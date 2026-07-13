import {
  supabase, requireSession, escapeHtml, setMessage, clearMessage, cleanValue, ROLE_GROUPS
} from "./app.js";

let rows = [];
let auth = null;
const message = document.querySelector("#import-message");

function parseCsv(text) {
  const result = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"'; i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(field); field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(field); field = "";
      if (row.some((v) => v !== "")) result.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((v) => v !== "")) result.push(row);
  return result;
}

document.querySelector("#preview-import").addEventListener("click", async () => {
  const file = document.querySelector("#csv-file").files[0];
  if (!file) {
    setMessage(message, "Select a CSV file first.", "error");
    return;
  }

  const matrix = parseCsv(await file.text());
  const headers = matrix.shift().map((h) => h.trim());

  rows = matrix.map((values) =>
    Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))
  );

  document.querySelector("#preview-head").innerHTML =
    `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  document.querySelector("#preview-body").innerHTML =
    rows.slice(0, 20).map((row) =>
      `<tr>${headers.map((h) => `<td>${escapeHtml(row[h])}</td>`).join("")}</tr>`
    ).join("");

  document.querySelector("#run-import").disabled = rows.length === 0;
  setMessage(message, `${rows.length} rows ready for review.`, "success");
});

document.querySelector("#run-import").addEventListener("click", async () => {
  if (!rows.length) return;
  setMessage(message, "Importing clients...");

  const records = rows.map((row) => ({
    client_number: row.client_number?.trim(),
    first_name: cleanValue(row.first_name),
    last_name: cleanValue(row.last_name),
    business_name: cleanValue(row.business_name),
    phone: cleanValue(row.phone),
    email: cleanValue(row.email),
    preferred_contact_method: cleanValue(row.preferred_contact_method),
    client_type: row.client_type || "Individual",
    active: String(row.active).toLowerCase() !== "false",
    notes: cleanValue(row.notes),
    created_by: auth.user.id
  }));

  const { error } = await supabase
    .from("clients")
    .upsert(records, { onConflict: "client_number" });

  if (error) {
    setMessage(message, `Import failed: ${error.message}`, "error");
    return;
  }

  setMessage(message, `${records.length} clients imported or updated.`, "success");
});

auth = await requireSession({ allowedRoles: ROLE_GROUPS.IMPORT_USERS });
