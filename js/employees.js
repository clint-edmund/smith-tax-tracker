import {
  supabase, requireSession, escapeHtml, setMessage, clearMessage
} from "./app.js";

const message = document.querySelector("#employee-message");

async function loadEmployees() {
  setMessage(message, "Loading employees...");
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id, employee_name, email, role, active,
      tax_returns!tax_returns_assigned_preparer_id_fkey(id)
    `)
    .order("employee_name");

  if (error) {
    setMessage(message, `Unable to load employees: ${error.message}`, "error");
    return;
  }

  document.querySelector("#employee-body").innerHTML =
    (data || []).map((row) => `
      <tr>
        <td>${escapeHtml(row.employee_name)}</td>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.role)}</td>
        <td>${row.active ? "Yes" : "No"}</td>
        <td>${row.tax_returns?.length || 0}</td>
      </tr>
    `).join("") || `<tr><td colspan="5">No employees found.</td></tr>`;

  clearMessage(message);
}

await requireSession({ administratorOnly: true });
loadEmployees();
