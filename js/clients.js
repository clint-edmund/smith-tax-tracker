import { supabase } from "./config.js";

import {
  requireAuthentication,
  signOut
} from "./auth-guard.js";

const tableBody =
  document.querySelector("#clients-table-body");

const searchInput =
  document.querySelector("#client-search");

const typeFilter =
  document.querySelector("#client-type-filter");

const activeFilter =
  document.querySelector("#active-filter");

const message =
  document.querySelector("#clients-message");

const clientCount =
  document.querySelector("#client-count");

let clientRecords = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getClientName(client) {
  if (client.business_name) {
    return client.business_name;
  }

  return [
    client.first_name,
    client.last_name
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function renderClients(records) {
  tableBody.innerHTML = "";

  clientCount.textContent =
    `${records.length} client${records.length === 1 ? "" : "s"}`;

  if (records.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          No matching clients were found.
        </td>
      </tr>
    `;
    return;
  }

  for (const client of records) {
    const row = document.createElement("tr");

    const returnCount =
      Array.isArray(client.tax_returns)
        ? client.tax_returns.length
        : 0;

    row.innerHTML = `
      <td>${escapeHtml(client.client_number)}</td>
      <td><strong>${escapeHtml(getClientName(client))}</strong></td>
      <td>${escapeHtml(client.client_type)}</td>
      <td>${escapeHtml(client.phone || "")}</td>
      <td>${escapeHtml(client.email || "")}</td>
      <td>${client.active ? "Active" : "Inactive"}</td>
      <td>${returnCount}</td>
    `;

    row.addEventListener("click", () => {
      window.location.href =
        `./client.html?client_id=${encodeURIComponent(client.id)}`;
    });

    tableBody.appendChild(row);
  }
}

function applyFilters() {
  const searchValue =
    searchInput.value.trim().toLowerCase();

  const selectedType =
    typeFilter.value;

  const selectedActive =
    activeFilter.value;

  const filtered =
    clientRecords.filter((client) => {
      const searchableText = [
        client.client_number,
        client.first_name,
        client.last_name,
        client.business_name,
        client.phone,
        client.email
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const searchMatches =
        !searchValue ||
        searchableText.includes(searchValue);

      const typeMatches =
        !selectedType ||
        client.client_type === selectedType;

      const activeMatches =
        selectedActive === "" ||
        String(client.active) === selectedActive;

      return searchMatches && typeMatches && activeMatches;
    });

  renderClients(filtered);
}

async function loadClients() {
  message.textContent = "Loading clients...";

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
      client_type,
      active,
      tax_returns (
        id
      )
    `)
    .order("last_name", {
      ascending: true,
      nullsFirst: false
    })
    .order("business_name", {
      ascending: true,
      nullsFirst: false
    });

  if (error) {
    console.error("Unable to load clients:", error);
    message.textContent =
      `Unable to load clients: ${error.message}`;
    return;
  }

  clientRecords = data || [];
  renderClients(clientRecords);
  message.textContent = "";
}

async function initialize() {
  const authentication =
    await requireAuthentication();

  if (!authentication) {
    return;
  }

  document.querySelector("#employee-name").textContent =
    `${authentication.profile.employee_name} — ` +
    `${authentication.profile.role}`;

  document.querySelector("#dashboard-button")
    .addEventListener("click", () => {
      window.location.href = "./dashboard.html";
    });

  document.querySelector("#add-client-button")
    .addEventListener("click", () => {
      window.location.href = "./client.html";
    });

  document.querySelector("#logout-button")
    .addEventListener("click", signOut);

  searchInput.addEventListener("input", applyFilters);
  typeFilter.addEventListener("change", applyFilters);
  activeFilter.addEventListener("change", applyFilters);

  await loadClients();
}

initialize();
