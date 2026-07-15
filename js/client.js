import {
  supabase, requireSession, cleanValue, formatCurrency,
  formatDate, formatDateTime, escapeHtml, setMessage,
  clearMessage, todayIso, previousTaxYear
} from "./app.js";

const params = new URLSearchParams(window.location.search);
let clientId = params.get("client_id");
let returnId = params.get("return_id");
let auth = null;

const msg = document.querySelector("#page-message");
const returnsPanel = document.querySelector("#returns-panel");
const returnEditor = document.querySelector("#return-editor");
const workflowGrid = document.querySelector("#workflow-grid");

function number(id) {
  return Number(document.querySelector(id).value || 0);
}

async function loadPreparers() {
  const { data } = await supabase
    .from("profiles")
    .select("id, employee_name, role")
    .eq("active", true)
    .order("employee_name");

  const select = document.querySelector("#assigned-preparer");
  select.innerHTML = `<option value="">Unassigned</option>`;
  for (const row of data || []) {
    select.insertAdjacentHTML(
      "beforeend",
      `<option value="${row.id}">${escapeHtml(row.employee_name)} (${escapeHtml(row.role)})</option>`
    );
  }
}

function fillClient(row) {
  document.querySelector("#client-id").value = row.id || "";
  document.querySelector("#client-number").value = row.client_number || "";
  document.querySelector("#client-type").value = row.client_type || "Individual";
  document.querySelector("#first-name").value = row.first_name || "";
  document.querySelector("#last-name").value = row.last_name || "";
  document.querySelector("#business-name").value = row.business_name || "";
  document.querySelector("#phone").value = row.phone || "";
  document.querySelector("#email").value = row.email || "";
  document.querySelector("#preferred-contact").value = row.preferred_contact_method || "";
  document.querySelector("#client-active").value = String(row.active ?? true);
  document.querySelector("#client-notes").value = row.notes || "";
}

function fillReturn(row) {
  document.querySelector("#return-id").value = row.id || "";
  document.querySelector("#tax-year").value = row.tax_year || previousTaxYear();
  document.querySelector("#return-type").value = row.return_type || "Federal and State";
  document.querySelector("#assigned-preparer").value = row.assigned_preparer_id || "";
  document.querySelector("#date-received").value = row.date_received || "";
  document.querySelector("#delivery-method").value = row.delivery_method || "";
  document.querySelector("#expected-completion").value = row.expected_completion_date || "";
  document.querySelector("#follow-up-date").value = row.follow_up_date || "";
  document.querySelector("#preparation-fee").value = row.preparation_fee || 0;
  document.querySelector("#additional-fees").value = row.additional_fees || 0;
  document.querySelector("#discount").value = row.discount || 0;
  document.querySelector("#amount-paid").value = formatCurrency(row.amount_paid);
  document.querySelector("#balance-due").value = formatCurrency(row.balance_due);
  document.querySelector("#return-notes").value = row.notes || "";
  document.querySelector("#new-status").value = row.current_status || "Documents Received";
  document.querySelector("#status-follow-up").value = row.follow_up_date || "";
}

async function loadClient() {
  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .single();

  if (error) {
    setMessage(msg, `Unable to load client: ${error.message}`, "error");
    return;
  }

  fillClient(data);
  returnsPanel.classList.remove("hidden");
  returnEditor.classList.remove("hidden");
  await loadReturns();
}

async function loadReturn() {
  const { data, error } = await supabase
    .from("tax_returns")
    .select("*, clients(*)")
    .eq("id", returnId)
    .single();

  if (error) {
    setMessage(msg, `Unable to load return: ${error.message}`, "error");
    return;
  }

  clientId = data.client_id;
  fillClient(data.clients);
  fillReturn(data);

  returnsPanel.classList.remove("hidden");
  returnEditor.classList.remove("hidden");
  workflowGrid.classList.remove("hidden");

  await Promise.all([
    loadReturns(),
    loadStatusHistory(),
    loadPaymentHistory()
  ]);
}

async function loadReturns() {
  if (!clientId) return;

  const { data, error } = await supabase
    .from("tax_returns")
    .select("id, tax_year, return_type, current_status, date_received, payment_status, balance_due")
    .eq("client_id", clientId)
    .order("tax_year", { ascending: false });

  const body = document.querySelector("#returns-body");
  if (error) {
    body.innerHTML = `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  body.innerHTML = (data || []).length
    ? data.map((row) => `
      <tr data-id="${row.id}">
        <td>${row.tax_year}</td><td>${escapeHtml(row.return_type)}</td>
        <td>${escapeHtml(row.current_status)}</td>
        <td>${formatDate(row.date_received)}</td>
        <td>${escapeHtml(row.payment_status)}</td>
        <td>${formatCurrency(row.balance_due)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">No returns created.</td></tr>`;

  body.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href =
        `./client.html?return_id=${encodeURIComponent(row.dataset.id)}`;
    });
  });
}

async function loadStatusHistory() {
  if (!returnId) {
    return;
  }

  const historyContainer =
    document.querySelector("#status-history");

  historyContainer.innerHTML = `
    <p class="muted">
      Loading status history...
    </p>
  `;

  const { data, error } = await supabase
    .from("status_history")
    .select(`
      id,
      previous_status,
      new_status,
      change_note,
      changed_at,
      profiles!status_history_changed_by_profile_fkey (
        employee_name
      )
    `)
    .eq("tax_return_id", returnId)
    .order("changed_at", {
      ascending: false
    });

  if (error) {
    console.error(
      "Status history loading failed:",
      {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      }
    );

    historyContainer.innerHTML = `
      <p class="page-message error">
        Status history could not be loaded:
        ${escapeHtml(error.message)}
      </p>
    `;

    return;
  }

  historyContainer.innerHTML =
    (data || []).map((row) => `
      <div class="timeline-item">
        <strong>
          ${escapeHtml(
            row.previous_status ||
            "Initial status"
          )}
          →
          ${escapeHtml(row.new_status)}
        </strong>

        <span>
          ${formatDateTime(row.changed_at)}
          ·
          ${escapeHtml(
            row.profiles?.employee_name ||
            "Employee"
          )}
        </span>

        <p>
          ${escapeHtml(
            row.change_note ||
            "No note entered."
          )}
        </p>
      </div>
    `).join("") ||
    `
      <p class="muted">
        No status history has been recorded.
      </p>
    `;
}

async function loadPaymentHistory() {
  const { data } = await supabase
    .from("payments")
    .select(`
      payment_date, amount, payment_method, reference_number, notes,
      profiles!payments_received_by_fkey(employee_name)
    `)
    .eq("tax_return_id", returnId)
    .order("payment_date", { ascending: false });

  document.querySelector("#payment-history").innerHTML =
    (data || []).map((row) => `
      <div class="timeline-item">
        <strong>${formatCurrency(row.amount)} · ${escapeHtml(row.payment_method || "")}</strong>
        <span>${formatDate(row.payment_date)} · ${escapeHtml(row.profiles?.employee_name || "Employee")}</span>
        <p>${escapeHtml(row.reference_number || "")} ${escapeHtml(row.notes || "")}</p>
      </div>
    `).join("") || `<p class="muted">No payments recorded.</p>`;
}

document.querySelector("#client-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const record = {
    client_number: document.querySelector("#client-number").value.trim(),
    client_type: document.querySelector("#client-type").value,
    first_name: cleanValue(document.querySelector("#first-name").value),
    last_name: cleanValue(document.querySelector("#last-name").value),
    business_name: cleanValue(document.querySelector("#business-name").value),
    phone: cleanValue(document.querySelector("#phone").value),
    email: cleanValue(document.querySelector("#email").value),
    preferred_contact_method: cleanValue(document.querySelector("#preferred-contact").value),
    active: document.querySelector("#client-active").value === "true",
    notes: cleanValue(document.querySelector("#client-notes").value)
  };

  let result;
  if (clientId) {
    result = await supabase.from("clients").update(record).eq("id", clientId);
  } else {
    record.created_by = auth.user.id;
    result = await supabase.from("clients").insert(record).select("id").single();
    if (!result.error) {
      clientId = result.data.id;
      history.replaceState({}, "", `./client.html?client_id=${clientId}`);
    }
  }

  if (result.error) {
    setMessage(msg, `Unable to save client: ${result.error.message}`, "error");
    return;
  }

  returnsPanel.classList.remove("hidden");
  returnEditor.classList.remove("hidden");
  setMessage(msg, "Client saved.", "success");
  await loadReturns();
});

document.querySelector("#return-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!clientId) {
    setMessage(msg, "Save the client first.", "error");
    return;
  }

  const record = {
    client_id: clientId,
    tax_year: number("#tax-year"),
    return_type: document.querySelector("#return-type").value,
    assigned_preparer_id: cleanValue(document.querySelector("#assigned-preparer").value),
    date_received: cleanValue(document.querySelector("#date-received").value),
    delivery_method: cleanValue(document.querySelector("#delivery-method").value),
    expected_completion_date: cleanValue(document.querySelector("#expected-completion").value),
    follow_up_date: cleanValue(document.querySelector("#follow-up-date").value),
    preparation_fee: number("#preparation-fee"),
    additional_fees: number("#additional-fees"),
    discount: number("#discount"),
    notes: cleanValue(document.querySelector("#return-notes").value)
  };

  let result;
  if (returnId) {
    result = await supabase.from("tax_returns").update(record).eq("id", returnId);
  } else {
    Object.assign(record, {
      current_status: "Documents Received",
      created_by: auth.user.id,
      received_by: auth.user.id
    });
    result = await supabase.from("tax_returns").insert(record).select("id").single();
    if (!result.error) {
      returnId = result.data.id;
      history.replaceState({}, "", `./client.html?return_id=${returnId}`);
    }
  }

  if (result.error) {
    setMessage(msg, `Unable to save return: ${result.error.message}`, "error");
    return;
  }

  workflowGrid.classList.remove("hidden");
  setMessage(msg, "Return saved.", "success");
  await loadReturn();
});

document.querySelector("#status-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { error } = await supabase.rpc("update_return_status", {
    p_tax_return_id: returnId,
    p_new_status: document.querySelector("#new-status").value,
    p_change_note: cleanValue(document.querySelector("#status-note").value),
    p_follow_up_date: cleanValue(document.querySelector("#status-follow-up").value)
  });

  if (error) {
    setMessage(msg, `Unable to update status: ${error.message}`, "error");
    return;
  }

  document.querySelector("#status-note").value = "";
  setMessage(msg, "Status updated.", "success");
  await loadReturn();
});

document.querySelector("#payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const { error } = await supabase.rpc("record_return_payment", {
    p_tax_return_id: returnId,
    p_payment_date: document.querySelector("#payment-date").value,
    p_amount: number("#payment-amount"),
    p_payment_method: cleanValue(document.querySelector("#payment-method").value),
    p_reference_number: cleanValue(document.querySelector("#payment-reference").value),
    p_notes: cleanValue(document.querySelector("#payment-notes").value)
  });

  if (error) {
    setMessage(msg, `Unable to record payment: ${error.message}`, "error");
    return;
  }

  document.querySelector("#payment-form").reset();
  document.querySelector("#payment-date").value = todayIso();
  setMessage(msg, "Payment recorded.", "success");
  await loadReturn();
});

document.querySelector("#new-return").addEventListener("click", () => {
  returnId = null;
  document.querySelector("#return-form").reset();
  document.querySelector("#return-id").value = "";
  document.querySelector("#tax-year").value = previousTaxYear();
  document.querySelector("#amount-paid").value = formatCurrency(0);
  document.querySelector("#balance-due").value = formatCurrency(0);
  workflowGrid.classList.add("hidden");
  history.replaceState({}, "", `./client.html?client_id=${clientId}`);
  returnEditor.scrollIntoView({ behavior: "smooth" });
});

auth = await requireSession();
await loadPreparers();
document.querySelector("#payment-date").value = todayIso();
document.querySelector("#tax-year").value = previousTaxYear();

if (returnId) await loadReturn();
else if (clientId) await loadClient();
else {
  document.querySelector("#client-number").value =
    `SE-${Date.now().toString().slice(-6)}`;
}
