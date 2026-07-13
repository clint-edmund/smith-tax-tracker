import { supabase } from "./config.js";

export { supabase };

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(Number(value || 0));
}

export function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(`${value}T00:00:00`));
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function cleanValue(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned === "" ? null : cleaned;
}

export function clientName(client) {
  if (!client) return "";
  if (client.business_name) return client.business_name;
  return [client.first_name, client.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function setMessage(element, text, type = "info") {
  if (!element) return;
  element.textContent = text;
  element.className = `page-message ${type}`;
}

export function clearMessage(element) {
  if (!element) return;
  element.textContent = "";
  element.className = "page-message";
}

export async function requireSession(options = {}) {
  const { administratorOnly = false } = options;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    window.location.href = "./index.html";
    return null;
  }

  const user = data.session.user;
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, employee_name, email, role, active")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || !profile.active) {
    await supabase.auth.signOut();
    window.location.href = "./index.html";
    return null;
  }

  if (administratorOnly && profile.role !== "administrator") {
    window.location.href = "./dashboard.html";
    return null;
  }

  document.querySelectorAll("[data-employee-name]")
    .forEach((el) => {
      el.textContent =
        `${profile.employee_name} — ${profile.role}`;
    });

  document.querySelectorAll("[data-admin-only]")
    .forEach((el) => {
      el.hidden = profile.role !== "administrator";
    });

  bindSharedNavigation();
  return { user, profile, session: data.session };
}

function bindSharedNavigation() {
  const routes = {
    dashboard: "./dashboard.html",
    clients: "./clients.html",
    reports: "./reports.html",
    employees: "./employees.html",
    import: "./import.html",
    settings: "./settings.html"
  };

  document.querySelectorAll("[data-nav]")
    .forEach((button) => {
      if (button.dataset.bound === "true") return;
      const route = routes[button.dataset.nav];
      if (!route) return;
      button.dataset.bound = "true";
      button.addEventListener("click", () => {
        window.location.href = route;
      });
    });

  document.querySelectorAll("[data-logout]")
    .forEach((button) => {
      if (button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "./index.html";
      });
    });
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function previousTaxYear() {
  return new Date().getFullYear() - 1;
}

export function downloadCsv(filename, rows) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const quote = (value) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;

  const csv = [
    headers.map(quote).join(","),
    ...rows.map((row) =>
      headers.map((header) => quote(row[header])).join(",")
    )
  ].join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
