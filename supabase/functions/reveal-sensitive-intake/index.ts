import {
  createClient
} from "https://esm.sh/@supabase/supabase-js@2";

function base64ToBytes(
  value: string
): Uint8Array {
  const binary = atob(value);

  return Uint8Array.from(
    binary,
    (character) => character.charCodeAt(0)
  );
}

function bytesToBase64(
  value: Uint8Array
): string {
  let binary = "";

  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function importKey(
  encodedKey: string
): Promise<CryptoKey> {
  const bytes =
    base64ToBytes(encodedKey);

  if (bytes.length !== 32) {
    throw new Error(
      "INTAKE_ENCRYPTION_KEY must decode to exactly 32 bytes."
    );
  }

  return crypto.subtle.importKey(
    "raw",
    bytes,
    {
      name: "AES-GCM"
    },
    false,
    [
      "encrypt",
      "decrypt"
    ]
  );
}

async function decryptValue(
  key: CryptoKey,
  ciphertext: string,
  encodedIv: string
): Promise<string> {
  const decrypted =
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64ToBytes(encodedIv)
      },
      key,
      base64ToBytes(ciphertext)
    );

  return new TextDecoder().decode(
    decrypted
  );
}

async function hashValue(
  value: string
): Promise<string> {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );

  return bytesToBase64(
    new Uint8Array(digest)
  );
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods":
    "POST, OPTIONS"
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        "Cache-Control": "no-store",
        "Content-Type": "application/json"
      }
    }
  );
}

Deno.serve(
  async (request: Request) => {
    if (request.method === "OPTIONS") {
      return new Response(
        "ok",
        {
          headers: corsHeaders
        }
      );
    }

    if (request.method !== "POST") {
      return jsonResponse(
        {
          error: "Method not allowed."
        },
        405
      );
    }

    try {
      const supabaseUrl =
        Deno.env.get(
          "SUPABASE_URL"
        );

      const serviceRoleKey =
        Deno.env.get(
          "SUPABASE_SERVICE_ROLE_KEY"
        );

      const encodedEncryptionKey =
        Deno.env.get(
          "INTAKE_ENCRYPTION_KEY"
        );

      const authorization =
        request.headers.get(
          "Authorization"
        );

      if (
        !supabaseUrl ||
        !serviceRoleKey ||
        !encodedEncryptionKey ||
        !authorization
      ) {
        return jsonResponse(
          {
            error: "Unauthorized."
          },
          401
        );
      }

      const token =
        authorization.replace(
          /^Bearer\s+/i,
          ""
        );

      const admin =
        createClient(
          supabaseUrl,
          serviceRoleKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false
            }
          }
        );

      const {
        data: userData,
        error: userError
      } = await admin.auth.getUser(
        token
      );

      if (
        userError ||
        !userData.user
      ) {
        return jsonResponse(
          {
            error: "Invalid session."
          },
          401
        );
      }

      const {
        data: profile,
        error: profileError
      } = await admin
        .from("profiles")
        .select(
          "id, role, active"
        )
        .eq(
          "id",
          userData.user.id
        )
        .single();

      if (
        profileError ||
        !profile?.active ||
        ![
          "administrator",
          "office_manager",
          "senior_preparer"
        ].includes(profile.role)
      ) {
        return jsonResponse(
          {
            error:
              "Your role is not authorized to reveal sensitive information."
          },
          403
        );
      }

      const body =
        await request.json();

      const intakeId =
        String(
          body.intake_id || ""
        ).trim();

      const reason =
        String(
          body.reason || ""
        ).trim();

      if (!intakeId) {
        return jsonResponse(
          {
            error:
              "Intake ID is required."
          },
          400
        );
      }

      if (reason.length < 10) {
        return jsonResponse(
          {
            error:
              "A specific access reason of at least ten characters is required."
          },
          400
        );
      }

      const {
        data: sensitive,
        error: sensitiveError
      } = await admin
        .from(
          "walk_in_intake_sensitive"
        )
        .select(`
          intake_id,
          client_id,
          encrypted_drivers_license,
          drivers_license_iv,
          encrypted_routing_number,
          routing_number_iv,
          encrypted_account_number,
          account_number_iv
        `)
        .eq(
          "intake_id",
          intakeId
        )
        .single();

      if (
        sensitiveError ||
        !sensitive
      ) {
        return jsonResponse(
          {
            error:
              "No encrypted sensitive information was found for this intake."
          },
          404
        );
      }

      const encryptionKey =
        await importKey(
          encodedEncryptionKey
        );

      const [
        driversLicenseNumber,
        routingNumber,
        accountNumber
      ] = await Promise.all([
        decryptValue(
          encryptionKey,
          sensitive.encrypted_drivers_license,
          sensitive.drivers_license_iv
        ),

        decryptValue(
          encryptionKey,
          sensitive.encrypted_routing_number,
          sensitive.routing_number_iv
        ),

        decryptValue(
          encryptionKey,
          sensitive.encrypted_account_number,
          sensitive.account_number_iv
        )
      ]);

      const forwardedFor =
        request.headers.get(
          "x-forwarded-for"
        ) ||
        request.headers.get(
          "cf-connecting-ip"
        ) ||
        "unknown";

      const userAgent =
        request.headers.get(
          "user-agent"
        ) || "unknown";

      const [
        sourceIpHash,
        userAgentHash
      ] = await Promise.all([
        hashValue(forwardedFor),
        hashValue(userAgent)
      ]);

      const {
        error: logError
      } = await admin
        .from(
          "walk_in_sensitive_access_log"
        )
        .insert({
          intake_id:
            intakeId,

          client_id:
            sensitive.client_id,

          accessed_by:
            profile.id,

          access_reason:
            reason,

          fields_revealed: [
            "drivers_license_number",
            "routing_number",
            "account_number"
          ],

          source_ip_hash:
            sourceIpHash,

          user_agent_hash:
            userAgentHash
        });

      if (logError) {
        console.error(
          "Sensitive access log failed:",
          logError
        );

        return jsonResponse(
          {
            error:
              "The reveal was blocked because the audit log could not be written."
          },
          500
        );
      }

      return jsonResponse({
        drivers_license_number:
          driversLicenseNumber,

        routing_number:
          routingNumber,

        account_number:
          accountNumber
      });
    } catch (error) {
      console.error(
        "Sensitive reveal failed:",
        error
      );

      return jsonResponse(
        {
          error:
            "The sensitive information could not be revealed."
        },
        500
      );
    }
  }
);
