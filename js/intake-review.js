import {
  supabase,
  requireSession,
  escapeHtml,
  formatDateTime,
  clientName,
  setMessage,
  clearMessage
} from "./app.js";

const parameters =
  new URLSearchParams(window.location.search);

const intakeId =
  parameters.get("intake_id");

const message =
  document.querySelector("#review-message");

let intake = null;
let selectedClient = null;

function intakeFullName(row) {
  return [
    row.first_name,
    row.middle_name,
    row.last_name
  ].filter(Boolean).join(" ");
}

function populateDetails(row) {
  document.querySelector("#intake-status-badge")
    .textContent = row.status;

  document.querySelector("#detail-code")
    .textContent = row.intake_code;

  document.querySelector("#detail-name")
    .textContent = intakeFullName(row);

  document.querySelector("#detail-business")
    .textContent = row.business_name || "";

  document.querySelector("#detail-email")
    .textContent = row.email || "";

  document.querySelector("#detail-phone")
    .textContent = row.phone || "";

  document.querySelector("#detail-contact")
    .textContent =
      row.preferred_contact_method || "";

  document.querySelector("#detail-address")
    .textContent = [
      row.address_line_1,
      row.address_line_2,
      row.city,
      row.state,
      row.postal_code
    ].filter(Boolean).join(", ");

  document.querySelector("#detail-license")
    .textContent = row.drivers_license_last_four
      ? `${
          row.drivers_license_state || ""
        } ending ${row.drivers_license_last_four}; expires ${
          row.drivers_license_expiration || "not entered"
        }`
      : "Not provided";

  document.querySelector("#detail-deposit")
    .textContent =
      row.direct_deposit_requested
        ? `Requested — ${
            row.bank_account_type || "account type not selected"
          }`
        : "Not requested";

  document.querySelector("#detail-bank")
    .textContent =
      row.direct_deposit_requested
        ? `${
            row.bank_name || "Bank not entered"
          }; routing ending ${
            row.routing_last_four || "not entered"
          }; account ending ${
            row.account_last_four || "not entered"
          }`
        : "";

  document.querySelector("#detail-submitted")
    .textContent = formatDateTime(row.submitted_at);

  document.querySelector("#identity-verified")
    .value = String(row.identity_verified);

  document.querySelector("#bank-verified")
    .value = String(row.bank_information_verified);

  document.querySelector("#review-note")
    .value = row.review_note || "";
}

function chooseClient(client) {
  selectedClient = client;

  document.querySelector("#selected-client-id")
    .value = client.id;

  document.querySelector(
    "#selected-client-display"
  ).textContent =
    `Selected: ${clientName(client)} (${
      client.client_number
    })`;
}

async function searchClients() {
  const query =
    document.querySelector("#client-match-search")
      .value.trim();

  if (query.length < 2) {
    document.querySelector(
      "#client-match-results"
    ).innerHTML =
      `<p class="muted">
        Enter at least two characters.
      </p>`;

    return;
  }

  const escaped =
    query.replaceAll("%", "\\%").replaceAll(",", " ");

  const { data, error } = await supabase
    .from("clients")
    .select(`
      id,
      client_number,
      first_name,
      last_name,
      business_name,
      email,
      phone
    `)
    .or(
      `client_number.ilike.%${escaped}%,` +
      `first_name.ilike.%${escaped}%,` +
      `last_name.ilike.%${escaped}%,` +
      `business_name.ilike.%${escaped}%,` +
      `email.ilike.%${escaped}%,` +
      `phone.ilike.%${escaped}%`
    )
    .limit(20);

  const container =
    document.querySelector("#client-match-results");

  if (error) {
    container.innerHTML =
      `<p class="page-message error">
        ${escapeHtml(error.message)}
      </p>`;

    return;
  }

  container.innerHTML =
    (data || []).map((client) => `
      <button
        type="button"
        class="match-card"
        data-client-id="${client.id}"
      >
        <strong>${escapeHtml(clientName(client))}</strong>
        <span>
          ${escapeHtml(client.client_number)}
          ·
          ${escapeHtml(client.email || "")}
          ·
          ${escapeHtml(client.phone || "")}
        </span>
      </button>
    `).join("") ||
    `<p class="muted">No matching clients found.</p>`;

  container.querySelectorAll(
    "[data-client-id]"
  ).forEach((button) => {
    button.addEventListener("click", () => {
      chooseClient(
        data.find(
          (client) =>
            client.id === button.dataset.clientId
        )
      );
    });
  });
}

async function loadIntakeHistory() {
  const { data, error } = await supabase
    .from("walk_in_intake_history")
    .select(`
      action,
      previous_status,
      new_status,
      note,
      created_at,
      profiles:changed_by (
        employee_name
      )
    `)
    .eq("intake_id", intakeId)
    .order("created_at", {
      ascending: false
    });

  const container =
    document.querySelector("#intake-history");

  if (error) {
    container.innerHTML =
      `<p class="page-message error">
        ${escapeHtml(error.message)}
      </p>`;

    return;
  }

  container.innerHTML =
    (data || []).map((row) => `
      <div class="timeline-item">
        <strong>${escapeHtml(row.action)}</strong>

        <span>
          ${formatDateTime(row.created_at)}
          ·
          ${escapeHtml(
            row.profiles?.employee_name ||
            "Employee"
          )}
        </span>

        <p>
          ${escapeHtml(
            [
              row.previous_status,
              row.new_status
            ].filter(Boolean).join(" → ")
          )}
          ${
            row.note
              ? `<br>${escapeHtml(row.note)}`
              : ""
          }
        </p>
      </div>
    `).join("") ||
    `<p class="muted">No intake history.</p>`;
}

async function loadIntake() {
  if (!intakeId) {
    setMessage(
      message,
      "No intake ID was supplied.",
      "error"
    );

    return;
  }

  setMessage(message, "Loading intake...");

  const { data, error } = await supabase
    .from("walk_in_intakes")
    .select("*")
    .eq("id", intakeId)
    .single();

  if (error) {
    setMessage(
      message,
      `Unable to load intake: ${error.message}`,
      "error"
    );

    return;
  }

  intake = data;
  populateDetails(data);

  if (data.matched_client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select(`
        id,
        client_number,
        first_name,
        last_name,
        business_name,
        email,
        phone
      `)
      .eq("id", data.matched_client_id)
      .single();

    if (client) {
      chooseClient(client);
    }
  }

  await loadIntakeHistory();
  clearMessage(message);
}

async function callReviewRpc(action) {
  setMessage(message, "Saving intake review...");

  const { data, error } = await supabase.rpc(
    "process_walk_in_intake",
    {
      p_intake_id: intakeId,
      p_action: action,
      p_selected_client_id:
        selectedClient?.id || null,
      p_review_status:
        document.querySelector(
          "#review-status"
        ).value,
      p_update_existing_client:
        document.querySelector(
          "#update-existing-client"
        ).value === "true",
      p_identity_verified:
        document.querySelector(
          "#identity-verified"
        ).value === "true",
      p_bank_verified:
        document.querySelector(
          "#bank-verified"
        ).value === "true",
      p_review_note:
        document.querySelector(
          "#review-note"
        ).value.trim() || null
    }
  );

  if (error) {
    console.error(error);

    setMessage(
      message,
      `Unable to process intake: ${error.message}`,
      "error"
    );

    return;
  }

  setMessage(
    message,
    data?.message || "Intake updated.",
    "success"
  );

  await loadIntake();
}

let searchTimer = null;

document.querySelector("#client-match-search")
  .addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchClients, 300);
  });

document.querySelector("#save-review")
  .addEventListener(
    "click",
    () => callReviewRpc("save_review")
  );

document.querySelector("#match-existing")
  .addEventListener("click", () => {
    if (!selectedClient) {
      setMessage(
        message,
        "Select an existing client first.",
        "error"
      );

      return;
    }

    callReviewRpc("match_existing");
  });

document.querySelector("#create-client")
  .addEventListener(
    "click",
    () => callReviewRpc("create_client")
  );

document.querySelector("#complete-intake")
  .addEventListener(
    "click",
    () => callReviewRpc("complete")
  );


let sensitiveHideTimer = null;
let sensitiveCountdownTimer = null;
function hideSensitiveValues() {
  clearTimeout(sensitiveHideTimer);
  clearInterval(sensitiveCountdownTimer);
  ["#full-license-number", "#full-routing-number", "#full-account-number"].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = "";
  });
  document.querySelector("#sensitive-values")?.classList.add("hidden");
  const hideButton = document.querySelector("#hide-sensitive-data");
  if (hideButton) hideButton.hidden = true;
}
async function revealSensitiveValues() {
  const reason = document.querySelector("#sensitive-reveal-reason").value.trim();
  const output = document.querySelector("#sensitive-message");
  if (reason.length < 10) {
    setMessage(output, "Enter a specific reason of at least ten characters.", "error");
    return;
  }
  hideSensitiveValues();
  setMessage(output, "Requesting and decrypting the restricted information...", "info");
  const { data, error } = await supabase.functions.invoke("reveal-sensitive-intake", {
    body: { intake_id: intakeId, reason }
  });
  if (error) {
    setMessage(output, "Sensitive information could not be revealed. Confirm your role and session.", "error");
    return;
  }
  document.querySelector("#full-license-number").textContent = data.drivers_license_number;
  document.querySelector("#full-routing-number").textContent = data.routing_number;
  document.querySelector("#full-account-number").textContent = data.account_number;
  document.querySelector("#sensitive-values").classList.remove("hidden");
  document.querySelector("#hide-sensitive-data").hidden = false;
  let seconds = 60;
  document.querySelector("#sensitive-countdown").textContent = `${seconds} seconds`;
  sensitiveCountdownTimer = setInterval(() => {
    seconds -= 1;
    document.querySelector("#sensitive-countdown").textContent = `${seconds} seconds`;
    if (seconds <= 0) {
      hideSensitiveValues();
      setMessage(output, "Sensitive information was automatically hidden.", "info");
    }
  }, 1000);
  sensitiveHideTimer = setTimeout(hideSensitiveValues, 60000);
  setMessage(output, "Sensitive information revealed. This access has been logged.", "success");
}


document.querySelector("#reveal-sensitive-data")?.addEventListener("click", revealSensitiveValues);
document.querySelector("#hide-sensitive-data")?.addEventListener("click", hideSensitiveValues);
window.addEventListener("beforeunload", hideSensitiveValues);
document.addEventListener("visibilitychange", () => { if (document.hidden) hideSensitiveValues(); });

await requireSession();
loadIntake();
