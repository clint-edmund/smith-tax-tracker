import {
  supabase, requireSession, formatCurrency, formatDate,
  clientName, escapeHtml, downloadCsv, setMessage, clearMessage, ROLE_GROUPS
} from "./app.js";

let exportRows = [];
const message = document.querySelector("#report-message");

async function runReport() {
  const type = document.querySelector("#report-type").value;
  const start = document.querySelector("#start-date").value;
  const end = document.querySelector("#end-date").value;
  setMessage(message, "Running report...");

  let data = [], error = null, headers = [], total = 0;

  if (type === "revenue") {
    let query = supabase.from("payments").select(`
      payment_date, amount, payment_method, reference_number,
      tax_returns(tax_year, clients(first_name,last_name,business_name))
    `).order("payment_date", { ascending: false });

    if (start) query = query.gte("payment_date", start);
    if (end) query = query.lte("payment_date", end);
    ({ data, error } = await query);
    headers = ["Date", "Client", "Tax year", "Method", "Reference", "Amount"];
    exportRows = (data || []).map((r) => ({
      Date: r.payment_date,
      Client: clientName(r.tax_returns?.clients),
      "Tax year": r.tax_returns?.tax_year,
      Method: r.payment_method,
      Reference: r.reference_number,
      Amount: r.amount
    }));
    total = exportRows.reduce((s, r) => s + Number(r.Amount || 0), 0);
  } else {
    let query = supabase.from("tax_returns").select(`
      id, tax_year, current_status, follow_up_date, completed_date,
      date_received, balance_due, payment_status,
      clients(first_name,last_name,business_name,client_number)
    `).order("tax_year", { ascending: false });

    if (type === "balances") query = query.gt("balance_due", 0);
    if (type === "waiting") query = query.eq("current_status", "Waiting for Client");
    if (type === "completed") query = query.eq("current_status", "Completed");
    if (type === "followups") {
      query = query.lt("follow_up_date", new Date().toISOString().slice(0, 10))
        .not("current_status", "in", '("Completed","Cancelled")');
    }
    ({ data, error } = await query);
    headers = ["Client", "Client #", "Tax year", "Status", "Follow-up", "Payment", "Balance"];
    exportRows = (data || []).map((r) => ({
      Client: clientName(r.clients),
      "Client #": r.clients?.client_number,
      "Tax year": r.tax_year,
      Status: r.current_status,
      "Follow-up": r.follow_up_date,
      Payment: r.payment_status,
      Balance: r.balance_due
    }));
    total = exportRows.reduce((s, r) => s + Number(r.Balance || 0), 0);
  }

  if (error) {
    setMessage(message, `Report failed: ${error.message}`, "error");
    return;
  }

  document.querySelector("#report-count").textContent = exportRows.length;
  document.querySelector("#report-total").textContent = formatCurrency(total);
  document.querySelector("#report-head").innerHTML =
    `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  document.querySelector("#report-body").innerHTML =
    exportRows.length
      ? exportRows.map((row) =>
          `<tr>${headers.map((h) =>
            `<td>${h.includes("Amount") || h === "Balance"
              ? formatCurrency(row[h])
              : h.includes("Date") || h === "Follow-up"
                ? formatDate(row[h])
                : escapeHtml(row[h] ?? "")}</td>`
          ).join("")}</tr>`
        ).join("")
      : `<tr><td colspan="${headers.length}">No matching records.</td></tr>`;

  clearMessage(message);
}

await requireSession({ allowedRoles: ROLE_GROUPS.REPORT_USERS });
document.querySelector("#run-report").addEventListener("click", runReport);
document.querySelector("#export-report").addEventListener("click", () => {
  downloadCsv("smith-enterprises-report.csv", exportRows);
});
runReport();
