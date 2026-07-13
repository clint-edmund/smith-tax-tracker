import { supabase } from "./config.js";

import {
  requireAuthentication,
  signOut
} from "./auth-guard.js";

const pageMessage =
  document.querySelector("#page-message");

const clientForm =
  document.querySelector("#client-form");

const returnForm =
  document.querySelector("#return-form");

const statusForm =
  document.querySelector("#status-form");

const paymentForm =
  document.querySelector("#payment-form");

const returnSection =
  document.querySelector("#return-section");

const statusSection =
  document.querySelector("#status-section");

const paymentSection =
  document.querySelector("#payment-section");

const clientReturnsSection =
  document.querySelector("#client-returns-section");

const clientReturnsBody =
  document.querySelector("#client-returns-body");

const statusHistoryBody =
  document.querySelector("#status-history-body");

const paymentHistoryBody =
  document.querySelector("#payment-history-body");

const preparerSelect =
  document.querySelector("#assigned-preparer");

const parameters =
  new URLSearchParams(window.location.search);

let currentUser = null;
let currentProfile = null;
let currentClientId = parameters.get("client_id");
let currentReturnId = parameters.get("return_id");
let currentReturn = null;

function setMessage(text, type = "info") {
  pageMessage.textContent = text;
  pageMessage.className = `page-message ${type}`;
}

function clearMessage() {
  pageMessage.textContent = "";
  pageMessage.className = "page-message";
}

function cleanValue(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned === "" ? null : cleaned;
}

function numberValue(elementId) {
  const value =
    Number(document.querySelector(elementId).value);

  return Number.isFinite(value) ? value : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultDates() {
  const paymentDate =
    document.querySelector("#payment-date");

  if (!paymentDate.value) {
    paymentDate.value = today();
  }

  const taxYear =
    document.querySelector("#tax-year");

  if (!taxYear.value) {
    taxYear.value =
      new Date().getFullYear() - 1;
  }
}

async function loadPreparers() {
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      employee_name,
      role,
      active
    `)
    .eq("active", true)
    .order("employee_name", {
      ascending: true
    });

  if (error) {
    console.error("Unable to load preparers:", error);
    setMessage(
      `Unable to load employee list: ${error.message}`,
      "error"
    );
    return;
  }

  preparerSelect.innerHTML = `
    <option value="">Not assigned</option>
  `;

  for (const profile of data || []) {
    const option =
      document.createElement("option");

    option.value = profile.id;
    option.textContent =
      `${profile.employee_name} (${profile.role})`;

    preparerSelect.appendChild(option);
  }
}

async function loadReturnAndClient() {
  if (!currentReturnId) {
    if (currentClientId) {
      await loadClient(currentClientId);
    }
    return;
  }

  setMessage("Loading client record...");

  const { data, error } = await supabase
    .from("tax_returns")
    .select(`
      id,
      client_id,
      tax_year,
      return_type,
      assigned_preparer_id,
      date_received,
      delivery_method,
      current_status,
      expected_completion_date,
      follow_up_date,
      preparation_fee,
      additional_fees,
      discount,
      amount_paid,
      payment_status,
      balance_due,
      notes,
      clients (
        id,
        client_number,
        first_name,
        last_name,
        business_name,
        phone,
        email,
        preferred_contact_method,
        client_type,
        active,
        notes
      )
    `)
    .eq("id", currentReturnId)
    .single();

  if (error || !data) {
    console.error("Unable to load return:", error);
    setMessage(
      "The selected return could not be loaded.",
      "error"
    );
    return;
  }

  currentReturn = data;
  currentClientId = data.client_id;

  populateClient(data.clients);
  populateReturn(data);

  clientReturnsSection.classList.remove("hidden");
  returnSection.classList.remove("hidden");
  statusSection.classList.remove("hidden");
  paymentSection.classList.remove("hidden");

  await Promise.all([
    loadClientReturns(),
    loadStatusHistory(),
    loadPaymentHistory()
  ]);

  clearMessage();
}

async function loadClient(clientId) {
  setMessage("Loading client...");

  const { data, error } = await supabase
    .from("clients")
    .select(`
      id,
      client_number,
      first_name,
      last_name,
      business_name,
      phone,
      email,
      preferred_contact_method,
      client_type,
      active,
      notes
    `)
    .eq("id", clientId)
    .single();

  if (error || !data) {
    console.error("Unable to load client:", error);
    setMessage(
      "The selected client could not be loaded.",
      "error"
    );
    return;
  }

  populateClient(data);

  clientReturnsSection.classList.remove("hidden");
  returnSection.classList.remove("hidden");

  await loadClientReturns();
  clearMessage();
}

function populateClient(client) {
  document.querySelector("#client-heading")
    .textContent = "Client Record";

  document.querySelector("#client-id").value =
    client.id || "";

  document.querySelector("#client-number").value =
    client.client_number || "";

  document.querySelector("#client-type").value =
    client.client_type || "Individual";

  document.querySelector("#first-name").value =
    client.first_name || "";

  document.querySelector("#last-name").value =
    client.last_name || "";

  document.querySelector("#business-name").value =
    client.business_name || "";

  document.querySelector("#phone").value =
    client.phone || "";

  document.querySelector("#email").value =
    client.email || "";

  document.querySelector("#preferred-contact-method").value =
    client.preferred_contact_method || "";

  document.querySelector("#client-active").value =
    String(client.active ?? true);

  document.querySelector("#client-notes").value =
    client.notes || "";
}

function populateReturn(record) {
  document.querySelector("#return-id").value =
    record.id || "";

  document.querySelector("#tax-year").value =
    record.tax_year || "";

  document.querySelector("#return-type").value =
    record.return_type || "Federal and State";

  document.querySelector("#assigned-preparer").value =
    record.assigned_preparer_id || "";

  document.querySelector("#date-received").value =
    record.date_received || "";

  document.querySelector("#delivery-method").value =
    record.delivery_method || "";

  document.querySelector("#expected-completion-date").value =
    record.expected_completion_date || "";

  document.querySelector("#follow-up-date").value =
    record.follow_up_date || "";

  document.querySelector("#preparation-fee").value =
    record.preparation_fee || 0;

  document.querySelector("#additional-fees").value =
    record.additional_fees || 0;

  document.querySelector("#discount").value =
    record.discount || 0;

  document.querySelector("#current-balance").value =
    formatCurrency(record.balance_due);

  document.querySelector("#return-notes").value =
    record.notes || "";

  document.querySelector("#new-status").value =
    record.current_status;

  document.querySelector("#status-follow-up-date").value =
    record.follow_up_date || "";

  document.querySelector("#current-status-display").textContent =
    `Current status: ${record.current_status} — ` +
    `${record.payment_status}; ` +
    `${formatCurrency(record.balance_due)} due`;
}

function validateClientForm() {
  const clientType =
    document.querySelector("#client-type").value;

  const firstName =
    document.querySelector("#first-name").value.trim();

  const lastName =
    document.querySelector("#last-name").value.trim();

  const businessName =
    document.querySelector("#business-name").value.trim();

  if (
    clientType === "Individual" &&
    !firstName &&
    !lastName
  ) {
    setMessage(
      "Enter at least a first or last name for an individual client.",
      "error"
    );
    return false;
  }

  if (
    clientType === "Business" &&
    !businessName
  ) {
    setMessage(
      "Enter a business name for a business client.",
      "error"
    );
    return false;
  }

  return true;
}

clientForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!validateClientForm()) {
    return;
  }

  const clientId =
    document.querySelector("#client-id").value;

  const clientRecord = {
    client_number:
      document.querySelector("#client-number").value.trim(),

    first_name:
      cleanValue(document.querySelector("#first-name").value),

    last_name:
      cleanValue(document.querySelector("#last-name").value),

    business_name:
      cleanValue(document.querySelector("#business-name").value),

    phone:
      cleanValue(document.querySelector("#phone").value),

    email:
      cleanValue(document.querySelector("#email").value),

    preferred_contact_method:
      cleanValue(
        document.querySelector("#preferred-contact-method").value
      ),

    client_type:
      document.querySelector("#client-type").value,

    active:
      document.querySelector("#client-active").value === "true",

    notes:
      cleanValue(document.querySelector("#client-notes").value)
  };

  setMessage("Saving client...");

  if (clientId) {
    const { error } = await supabase
      .from("clients")
      .update(clientRecord)
      .eq("id", clientId);

    if (error) {
      console.error("Client update failed:", error);
      setMessage(
        `Unable to update client: ${error.message}`,
        "error"
      );
      return;
    }

    currentClientId = clientId;
    setMessage("Client information updated.", "success");
  } else {
    clientRecord.created_by = currentUser.id;

    const { data, error } = await supabase
      .from("clients")
      .insert(clientRecord)
      .select("id")
      .single();

    if (error) {
      console.error("Client creation failed:", error);
      setMessage(
        `Unable to create client: ${error.message}`,
        "error"
      );
      return;
    }

    currentClientId = data.id;

    document.querySelector("#client-id").value =
      data.id;

    document.querySelector("#client-heading").textContent =
      "Client Record";

    clientReturnsSection.classList.remove("hidden");
    returnSection.classList.remove("hidden");

    window.history.replaceState(
      {},
      "",
      `./client.html?client_id=${encodeURIComponent(data.id)}`
    );

    await loadClientReturns();

    setMessage(
      "Client created. You can now add a tax return.",
      "success"
    );
  }
});

returnForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!currentClientId) {
    setMessage(
      "Save the client before creating a return.",
      "error"
    );
    return;
  }

  const returnId =
    document.querySelector("#return-id").value;

  const returnRecord = {
    client_id: currentClientId,

    tax_year:
      Number(document.querySelector("#tax-year").value),

    return_type:
      document.querySelector("#return-type").value,

    assigned_preparer_id:
      cleanValue(
        document.querySelector("#assigned-preparer").value
      ),

    date_received:
      cleanValue(
        document.querySelector("#date-received").value
      ),

    delivery_method:
      cleanValue(
        document.querySelector("#delivery-method").value
      ),

    expected_completion_date:
      cleanValue(
        document.querySelector("#expected-completion-date").value
      ),

    follow_up_date:
      cleanValue(
        document.querySelector("#follow-up-date").value
      ),

    preparation_fee:
      numberValue("#preparation-fee"),

    additional_fees:
      numberValue("#additional-fees"),

    discount:
      numberValue("#discount"),

    notes:
      cleanValue(
        document.querySelector("#return-notes").value
      )
  };

  setMessage("Saving return...");

  if (returnId) {
    const { error } = await supabase
      .from("tax_returns")
      .update(returnRecord)
      .eq("id", returnId);

    if (error) {
      console.error("Return update failed:", error);
      setMessage(
        `Unable to update return: ${error.message}`,
        "error"
      );
      return;
    }

    currentReturnId = returnId;
    setMessage("Tax return updated.", "success");
  } else {
    returnRecord.current_status = "Documents Received";
    returnRecord.created_by = currentUser.id;
    returnRecord.received_by = currentUser.id;

    const { data, error } = await supabase
      .from("tax_returns")
      .insert(returnRecord)
      .select("id")
      .single();

    if (error) {
      console.error("Return creation failed:", error);
      setMessage(
        `Unable to create return: ${error.message}`,
        "error"
      );
      return;
    }

    currentReturnId = data.id;

    document.querySelector("#return-id").value =
      data.id;

    statusSection.classList.remove("hidden");
    paymentSection.classList.remove("hidden");

    window.history.replaceState(
      {},
      "",
      `./client.html?return_id=${encodeURIComponent(data.id)}`
    );

    setMessage("Tax return created.", "success");
  }

  await Promise.all([
    reloadCurrentReturn(),
    loadClientReturns()
  ]);
});

statusForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!currentReturnId) {
    setMessage(
      "Create the tax return before updating its status.",
      "error"
    );
    return;
  }

  setMessage("Updating status...");

  const { error } = await supabase.rpc(
    "update_return_status",
    {
      p_tax_return_id: currentReturnId,
      p_new_status:
        document.querySelector("#new-status").value,
      p_change_note:
        cleanValue(document.querySelector("#status-note").value),
      p_follow_up_date:
        cleanValue(
          document.querySelector("#status-follow-up-date").value
        )
    }
  );

  if (error) {
    console.error("Status update failed:", error);
    setMessage(
      `Unable to update status: ${error.message}`,
      "error"
    );
    return;
  }

  document.querySelector("#status-note").value = "";

  setMessage("Return status updated.", "success");

  await Promise.all([
    reloadCurrentReturn(),
    loadStatusHistory(),
    loadClientReturns()
  ]);
});

paymentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!currentReturnId) {
    setMessage(
      "Create the tax return before recording a payment.",
      "error"
    );
    return;
  }

  const paymentAmount =
    numberValue("#payment-amount");

  if (paymentAmount <= 0) {
    setMessage(
      "Enter a payment amount greater than zero.",
      "error"
    );
    return;
  }

  setMessage("Recording payment...");

  const { error } = await supabase.rpc(
    "record_return_payment",
    {
      p_tax_return_id: currentReturnId,
      p_payment_date:
        document.querySelector("#payment-date").value,
      p_amount: paymentAmount,
      p_payment_method:
        cleanValue(
          document.querySelector("#payment-method").value
        ),
      p_reference_number:
        cleanValue(
          document.querySelector("#payment-reference").value
        ),
      p_notes:
        cleanValue(
          document.querySelector("#payment-notes").value
        )
    }
  );

  if (error) {
    console.error("Payment entry failed:", error);
    setMessage(
      `Unable to record payment: ${error.message}`,
      "error"
    );
    return;
  }

  paymentForm.reset();
  setDefaultDates();

  setMessage("Payment recorded.", "success");

  await Promise.all([
    reloadCurrentReturn(),
    loadPaymentHistory(),
    loadClientReturns()
  ]);
});

async function reloadCurrentReturn() {
  if (!currentReturnId) {
    return;
  }

  const { data, error } = await supabase
    .from("tax_returns")
    .select(`
      id,
      client_id,
      tax_year,
      return_type,
      assigned_preparer_id,
      date_received,
      delivery_method,
      current_status,
      expected_completion_date,
      follow_up_date,
      preparation_fee,
      additional_fees,
      discount,
      amount_paid,
      payment_status,
      balance_due,
      notes
    `)
    .eq("id", currentReturnId)
    .single();

  if (error || !data) {
    console.error("Unable to reload current return:", error);
    return;
  }

  currentReturn = data;
  populateReturn(data);
}

async function loadClientReturns() {
  if (!currentClientId) {
    return;
  }

  const { data, error } = await supabase
    .from("tax_returns")
    .select(`
      id,
      tax_year,
      return_type,
      date_received,
      current_status,
      payment_status,
      balance_due,
      created_at
    `)
    .eq("client_id", currentClientId)
    .order("tax_year", {
      ascending: false
    })
    .order("created_at", {
      ascending: false
    });

  if (error) {
    console.error("Unable to load client returns:", error);
    clientReturnsBody.innerHTML = `
      <tr>
        <td colspan="6">
          Client returns could not be loaded.
        </td>
      </tr>
    `;
    return;
  }

  clientReturnsSection.classList.remove("hidden");

  if (!data || data.length === 0) {
    clientReturnsBody.innerHTML = `
      <tr>
        <td colspan="6">
          No returns have been created for this client.
        </td>
      </tr>
    `;
    return;
  }

  clientReturnsBody.innerHTML = "";

  for (const record of data) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHtml(record.tax_year)}</td>
      <td>${escapeHtml(record.return_type)}</td>
      <td>${escapeHtml(record.date_received || "")}</td>
      <td>${escapeHtml(record.current_status)}</td>
      <td>${escapeHtml(record.payment_status)}</td>
      <td>${formatCurrency(record.balance_due)}</td>
    `;

    row.addEventListener("click", () => {
      window.location.href =
        `./client.html?return_id=${encodeURIComponent(record.id)}`;
    });

    clientReturnsBody.appendChild(row);
  }
}

async function loadStatusHistory() {
  if (!currentReturnId) {
    return;
  }

  const { data, error } = await supabase
    .from("status_history")
    .select(`
      id,
      previous_status,
      new_status,
      change_note,
      changed_at,
      profiles!status_history_changed_by_fkey (
        employee_name
      )
    `)
    .eq("tax_return_id", currentReturnId)
    .order("changed_at", {
      ascending: false
    });

  if (error) {
    console.error("Unable to load status history:", error);
    statusHistoryBody.innerHTML = `
      <tr>
        <td colspan="5">
          Status history could not be loaded.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    statusHistoryBody.innerHTML = `
      <tr>
        <td colspan="5">
          No status changes have been recorded.
        </td>
      </tr>
    `;
    return;
  }

  statusHistoryBody.innerHTML =
    data.map((entry) => `
      <tr>
        <td>${escapeHtml(formatDateTime(entry.changed_at))}</td>
        <td>${escapeHtml(entry.previous_status || "Initial status")}</td>
        <td>${escapeHtml(entry.new_status)}</td>
        <td>${escapeHtml(entry.profiles?.employee_name || "Employee")}</td>
        <td>${escapeHtml(entry.change_note || "")}</td>
      </tr>
    `).join("");
}

async function loadPaymentHistory() {
  if (!currentReturnId) {
    return;
  }

  const { data, error } = await supabase
    .from("payments")
    .select(`
      id,
      payment_date,
      amount,
      payment_method,
      reference_number,
      notes,
      profiles!payments_received_by_fkey (
        employee_name
      )
    `)
    .eq("tax_return_id", currentReturnId)
    .order("payment_date", {
      ascending: false
    });

  if (error) {
    console.error("Unable to load payment history:", error);
    paymentHistoryBody.innerHTML = `
      <tr>
        <td colspan="6">
          Payment history could not be loaded.
        </td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    paymentHistoryBody.innerHTML = `
      <tr>
        <td colspan="6">
          No payments have been recorded.
        </td>
      </tr>
    `;
    return;
  }

  paymentHistoryBody.innerHTML =
    data.map((payment) => `
      <tr>
        <td>${escapeHtml(payment.payment_date)}</td>
        <td>${formatCurrency(payment.amount)}</td>
        <td>${escapeHtml(payment.payment_method || "")}</td>
        <td>${escapeHtml(payment.reference_number || "")}</td>
        <td>${escapeHtml(payment.profiles?.employee_name || "Employee")}</td>
        <td>${escapeHtml(payment.notes || "")}</td>
      </tr>
    `).join("");
}

function resetReturnFormForNewReturn() {
  if (!currentClientId) {
    setMessage(
      "Save the client before adding a return.",
      "error"
    );
    return;
  }

  currentReturnId = null;
  currentReturn = null;

  returnForm.reset();

  document.querySelector("#return-id").value = "";
  document.querySelector("#current-balance").value = "$0.00";
  document.querySelector("#assigned-preparer").value = "";

  statusSection.classList.add("hidden");
  paymentSection.classList.add("hidden");

  setDefaultDates();

  window.history.replaceState(
    {},
    "",
    `./client.html?client_id=${encodeURIComponent(currentClientId)}`
  );

  returnSection.scrollIntoView({
    behavior: "smooth"
  });

  setMessage(
    "Enter the new tax return information.",
    "info"
  );
}

async function initialize() {
  const authentication =
    await requireAuthentication();

  if (!authentication) {
    return;
  }

  currentUser = authentication.user;
  currentProfile = authentication.profile;

  document.querySelector("#employee-name").textContent =
    `${currentProfile.employee_name} — ${currentProfile.role}`;

  document.querySelector("#logout-button")
    .addEventListener("click", signOut);

  document.querySelector("#dashboard-button")
    .addEventListener("click", () => {
      window.location.href = "./dashboard.html";
    });

  document.querySelector("#clients-button")
    .addEventListener("click", () => {
      window.location.href = "./clients.html";
    });

  document.querySelector("#new-return-button")
    .addEventListener("click", resetReturnFormForNewReturn);

  setDefaultDates();

  await loadPreparers();
  await loadReturnAndClient();
}

initialize();
