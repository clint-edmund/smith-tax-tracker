import {
  supabase, requireSession, formatCurrency, formatDate,
  clientName, escapeHtml, setMessage, clearMessage
} from "./app.js";

const message = document.querySelector("#dashboard-message");

function statusRow(label, count) {
  return `<div class="status-row"><span>${escapeHtml(label)}</span><strong>${count}</strong></div>`;
}

async function loadDashboard() {
  setMessage(message, "Loading dashboard...");

  const { data, error } = await supabase
    .from("tax_returns")
    .select(`
      id, tax_year, current_status, follow_up_date,
      balance_due, assigned_preparer_id,
      clients (id, first_name, last_name, business_name),
      profiles:assigned_preparer_id (employee_name)
    `)
    .order("follow_up_date", { ascending: true, nullsFirst: false });

  if (error) {
    setMessage(message, `Unable to load dashboard: ${error.message}`, "error");
    return;
  }

  const rows = data || [];
  const today = new Date().toISOString().slice(0, 10);
  const statusCounts = {};
  const preparerCounts = {};

  for (const row of rows) {
    statusCounts[row.current_status] =
      (statusCounts[row.current_status] || 0) + 1;

    const preparer = row.profiles?.employee_name || "Unassigned";
    preparerCounts[preparer] =
      (preparerCounts[preparer] || 0) + 1;
  }

  document.querySelector("#kpi-total").textContent = rows.length;
  document.querySelector("#kpi-waiting").textContent =
    statusCounts["Waiting for Client"] || 0;
  document.querySelector("#kpi-ready").textContent =
    statusCounts["Ready to File"] || 0;
  document.querySelector("#kpi-completed").textContent =
    statusCounts["Completed"] || 0;
  document.querySelector("#kpi-overdue").textContent =
    rows.filter((r) =>
      r.follow_up_date &&
      r.follow_up_date < today &&
      !["Completed", "Cancelled"].includes(r.current_status)
    ).length;
  document.querySelector("#kpi-balance").textContent =
    formatCurrency(rows.reduce((sum, row) =>
      sum + Number(row.balance_due || 0), 0));

  document.querySelector("#status-summary").innerHTML =
    Object.entries(statusCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => statusRow(label, count))
      .join("") || "<p>No returns found.</p>";

  document.querySelector("#preparer-summary").innerHTML =
    Object.entries(preparerCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => statusRow(label, count))
      .join("") || "<p>No assignments found.</p>";

  const attention = rows.filter((r) =>
    (r.follow_up_date && r.follow_up_date <= today) ||
    r.balance_due > 0 ||
    ["Rejected", "Missing Information", "Waiting for Client"].includes(r.current_status)
  ).slice(0, 25);

  const body = document.querySelector("#attention-body");
  body.innerHTML = attention.length
    ? attention.map((row) => `
      <tr data-id="${row.id}">
        <td>${escapeHtml(clientName(row.clients))}</td>
        <td>${escapeHtml(row.tax_year)}</td>
        <td>${escapeHtml(row.current_status)}</td>
        <td>${formatDate(row.follow_up_date)}</td>
        <td>${escapeHtml(row.profiles?.employee_name || "Unassigned")}</td>
        <td>${formatCurrency(row.balance_due)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="6">No returns currently require attention.</td></tr>`;

  body.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href =
        `./client.html?return_id=${encodeURIComponent(row.dataset.id)}`;
    });
  });

  clearMessage(message);
}

await requireSession();
document.querySelector("#open-clients").addEventListener("click", () => {
  window.location.href = "./clients.html";
});
document.querySelector("#refresh-dashboard").addEventListener("click", loadDashboard);
loadDashboard();
