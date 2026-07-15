import {
  createClient
} from "https://esm.sh/@supabase/supabase-js@2";

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  const bytes = base64ToBytes(encodedKey);
  if (bytes.length !== 32) {
    throw new Error(
      "INTAKE_ENCRYPTION_KEY must decode to exactly 32 bytes."
    );
  }
  return crypto.subtle.importKey(
    "raw",
    bytes,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptValue(
  key: CryptoKey,
  value: string
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(value);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv)
  };
}

async function hashValue(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return bytesToBase64(new Uint8Array(digest));
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function requiredText(
  value: unknown,
  fieldName: string,
  maximumLength: number
): string {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${fieldName} is required.`);
  if (result.length > maximumLength) {
    throw new Error(`${fieldName} is too long.`);
  }
  return result;
}

function optionalText(
  value: unknown,
  maximumLength: number
): string | null {
  const result = String(value ?? "").trim();
  return result ? result.slice(0, maximumLength) : null;
}

function digits(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  fieldName: string
): string {
  const result = String(value ?? "").replace(/\D/g, "");
  if (result.length < minimumLength || result.length > maximumLength) {
    throw new Error(`${fieldName} has an invalid length.`);
  }
  return result;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const encodedEncryptionKey = Deno.env.get("INTAKE_ENCRYPTION_KEY");
    const rateLimitSalt = Deno.env.get("INTAKE_RATE_LIMIT_SALT");
    const keyVersion =
      Deno.env.get("INTAKE_ENCRYPTION_KEY_VERSION") || "v1";

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !encodedEncryptionKey ||
      !rateLimitSalt
    ) {
      return jsonResponse(
        { error: "The secure submission service is not fully configured." },
        500
      );
    }

    const body = await request.json();

    if (body.consent !== true) {
      return jsonResponse({ error: "Consent is required." }, 400);
    }

    const routingNumber = digits(
      body.routing_number,
      9,
      9,
      "Routing number"
    );

    const accountNumber = digits(
      body.account_number,
      4,
      20,
      "Account number"
    );

    const driversLicenseNumber = requiredText(
      body.drivers_license_number,
      "Driver's-license number",
      40
    );

    const forwardedFor =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("cf-connecting-ip") ||
      "unknown";

    const sourceIp = forwardedFor.split(",")[0].trim();
    const ipHash = await hashValue(`${sourceIp}:${rateLimitSalt}`);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const oneHourAgo = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();

    const { count, error: countError } = await admin
      .from("intake_submission_limits")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("submitted_at", oneHourAgo);

    if (countError) throw countError;

    if ((count || 0) >= 10) {
      return jsonResponse(
        {
          error:
            "Too many submissions. Please ask the receptionist for assistance."
        },
        429
      );
    }

    const encryptionKey = await importKey(encodedEncryptionKey);

    const [encryptedLicense, encryptedRouting, encryptedAccount] =
      await Promise.all([
        encryptValue(encryptionKey, driversLicenseNumber),
        encryptValue(encryptionKey, routingNumber),
        encryptValue(encryptionKey, accountNumber)
      ]);

    const retentionDays = Number(
      Deno.env.get("INTAKE_SENSITIVE_RETENTION_DAYS") || "90"
    );

    const retentionDate = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

    const intake = {
      first_name: requiredText(body.first_name, "First name", 80),
      middle_name: optionalText(body.middle_name, 80),
      last_name: requiredText(body.last_name, "Last name", 80),
      date_of_birth: optionalText(body.date_of_birth, 10),
      business_name: optionalText(body.business_name, 160),
      client_type: requiredText(body.client_type, "Client type", 30),
      email: requiredText(body.email, "Email", 254),
      phone: requiredText(body.phone, "Phone", 20),
      preferred_contact_method: requiredText(
        body.preferred_contact_method,
        "Preferred contact method",
        20
      ),
      address_line_1: requiredText(
        body.address_line_1,
        "Street address",
        160
      ),
      address_line_2: optionalText(body.address_line_2, 120),
      city: requiredText(body.city, "City", 100),
      state: requiredText(body.state, "State", 2).toUpperCase(),
      postal_code: requiredText(body.postal_code, "ZIP code", 10),
      drivers_license_state: optionalText(
        body.drivers_license_state,
        2
      )?.toUpperCase(),
      drivers_license_expiration: optionalText(
        body.drivers_license_expiration,
        10
      ),
      drivers_license_number: driversLicenseNumber,
      direct_deposit_requested: body.direct_deposit_requested === true,
      bank_name: optionalText(body.bank_name, 120),
      bank_account_type: optionalText(body.bank_account_type, 20),
      routing_number: routingNumber,
      account_number: accountNumber
    };

    const { data, error } = await admin.rpc(
      "create_sensitive_walk_in_intake",
      {
        p_intake: intake,
        p_encrypted_drivers_license: encryptedLicense.ciphertext,
        p_drivers_license_iv: encryptedLicense.iv,
        p_encrypted_routing_number: encryptedRouting.ciphertext,
        p_routing_number_iv: encryptedRouting.iv,
        p_encrypted_account_number: encryptedAccount.ciphertext,
        p_account_number_iv: encryptedAccount.iv,
        p_key_version: keyVersion,
        p_retention_delete_after: retentionDate
      }
    );

    if (error) throw error;

    const { error: limitInsertError } = await admin
      .from("intake_submission_limits")
      .insert({ ip_hash: ipHash });

    if (limitInsertError) {
      console.error("Rate-limit log insert failed:", limitInsertError);
    }

    return jsonResponse({
      confirmation_code: data.confirmation_code
    });
  } catch (error) {
    console.error("Sensitive intake submission failed:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "The secure submission was rejected."
      },
      400
    );
  }
});
