import {
  supabase, requireSession, escapeHtml, clientName,
  setMessage, clearMessage
} from "./app.js";

let clients = [];
const body = document.querySelector("#clients-body");
const message = document.querySelector("#clients-message");

function render(rows) {
  document.querySelector("#client-count").textContent =
    `${rows.length} client${rows.length === 1 ? "" : "s"}`;

  body.innerHTML = rows.length
    ? rows.map((client) => `
      <tr data-id="${client.id}">
        <td>${escapeHtml(client.client_number)}</td>
        <td><strong>${escapeHtml(clientName(client))}</strong></td>
        <td>${escapeHtml(client.client_type)}</td>
        <td>${escapeHtml(client.phone || "")}</td>
        <td>${escapeHtml(client.email || "")}</td>
        <td>${client.active ? "Active" : "Inactive"}</td>
        <td>${client.tax_returns?.length || 0}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7">No matching clients found.</td></tr>`;

  body.querySelectorAll("tr[data-id]").forEach((row) => {
    row.addEventListener("click", () => {
      window.location.href =
        `./client.html?client_id=${encodeURIComponent(row.dataset.id)}`;
    });
  });
}

function applyFilters() {
  const query = document.querySelector("#client-search").value
    .trim().toLowerCase();
  const type = document.querySelector("#type-filter").value;
  const active = document.querySelector("#active-filter").value;

  render(clients.filter((client) => {
    const text = [
      client.client_number, client.first_name, client.last_name,
      client.business_name, client.phone, client.email
    ].filter(Boolean).join(" ").toLowerCase();

    return (!query || text.includes(query)) &&
      (!type || client.client_type === type) &&
      (!active || String(client.active) === active);
  }));
}

async function loadClients() {
  setMessage(message, "Loading clients...");
  const { data, error } = await supabase
    .from("clients")
    .select(`
      id, client_number, first_name, last_name, business_name,
      phone, email, client_type, active,
      tax_returns (id)
    `)
    .order("last_name", { ascending: true, nullsFirst: false })
    .order("business_name", { ascending: true, nullsFirst: false });

  if (error) {
    setMessage(message, `Unable to load clients: ${error.message}`, "error");
    return;
  }

  clients = data || [];
  render(clients);
  clearMessage(message);
}

await requireSession();
document.querySelector("#add-client").addEventListener("click", () => {
  window.location.href = "./client.html";
});
["client-search", "type-filter", "active-filter"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener(
    id === "client-search" ? "input" : "change",
    applyFilters
  );
});
loadClients();
