import {
  supabase,
  requireSession,
  escapeHtml,
  formatDateTime,
  clientName,
  setMessage,
  clearMessage
} from "./app.js";

let records = [];

const message =
  document.querySelector("#intakes-message");

function renderSummary(rows) {
  const today =
    new Date().toISOString().slice(0, 10);

  document.querySelector("#submitted-count").textContent =
    rows.filter(
      (row) => row.status === "Submitted"
    ).length;

  document.querySelector(
    "#possible-match-count"
  ).textContent =
    rows.filter(
      (row) => row.status === "Possible Match"
    ).length;

  document.querySelector("#correction-count").textContent =
    rows.filter(
      (row) => row.status === "Needs Correction"
    ).length;

  document.querySelector(
    "#completed-today-count"
  ).textContent =
    rows.filter(
      (row) =>
        row.status === "Completed" &&
        row.reviewed_at?.slice(0, 10) === today
    ).length;
}

function render(rows) {
  const body =
    document.querySelector("#intakes-body");

  body.innerHTML = rows.length
    ? rows.map((row) => `
      <tr data-id="${row.id}">
        <td>
          <strong>${escapeHtml(row.intake_code)}</strong>
        </td>

        <td>
          ${escapeHtml(
            [
              row.first_name,
              row.middle_name,
              row.last_name
            ].filter(Boolean).join(" ")
          )}
        </td>

        <td>${formatDateTime(row.submitted_at)}</td>

        <td>${escapeHtml(row.email || "")}</td>

        <td>${escapeHtml(row.phone || "")}</td>

        <td>${escapeHtml(row.status)}</td>

        <td>
          ${escapeHtml(
            clientName(row.clients) || "Not matched"
          )}
        </td>
      </tr>
    `).join("")
    : `
      <tr>
        <td colspan="7">
          No matching intake records were found.
        </td>
      </tr>
    `;

  body.querySelectorAll("tr[data-id]")
    .forEach((row) => {
      row.addEventListener("click", () => {
        window.location.href =
          `./intake-review.html?intake_id=${
            encodeURIComponent(row.dataset.id)
          }`;
      });
    });

  renderSummary(records);
}

function applyFilters() {
  const query =
    document.querySelector("#intake-search")
      .value.trim().toLowerCase();

  const status =
    document.querySelector(
      "#intake-status-filter"
    ).value;

  const filtered =
    records.filter((row) => {
      const searchText = [
        row.intake_code,
        row.first_name,
        row.middle_name,
        row.last_name,
        row.email,
        row.phone
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!query || searchText.includes(query)) &&
        (!status || row.status === status)
      );
    });

  render(filtered);
}

async function loadIntakes() {
  setMessage(message, "Loading walk-in intakes...");

  const { data, error } = await supabase
    .from("walk_in_intakes")
    .select(`
      id,
      intake_code,
      first_name,
      middle_name,
      last_name,
      email,
      phone,
      status,
      submitted_at,
      reviewed_at,
      matched_client_id,
      clients:matched_client_id (
        id,
        first_name,
        last_name,
        business_name,
        client_number
      )
    `)
    .order("submitted_at", {
      ascending: false
    });

  if (error) {
    console.error(error);

    setMessage(
      message,
      `Unable to load intakes: ${error.message}`,
      "error"
    );

    return;
  }

  records = data || [];
  render(records);
  clearMessage(message);
}

await requireSession();

document.querySelector("#intake-search")
  .addEventListener("input", applyFilters);

document.querySelector("#intake-status-filter")
  .addEventListener("change", applyFilters);

document.querySelector("#refresh-intakes")
  .addEventListener("click", loadIntakes);

loadIntakes();
