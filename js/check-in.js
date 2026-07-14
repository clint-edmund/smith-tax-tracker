import { supabase } from "./config.js";

const form = document.querySelector("#check-in-form");
const message = document.querySelector("#check-in-message");
const confirmationPanel = document.querySelector("#confirmation-panel");
const submitButton = document.querySelector("#submit-check-in");
let lastSubmissionAt = 0;

const clean = (value) => {
  const result = String(value ?? "").trim();
  return result === "" ? null : result;
};
const digits = (value) => String(value ?? "").replace(/\D/g, "");
const phone = (value) => String(value ?? "").replace(/[^\d+]/g, "").slice(0, 20);
function clearSensitive() {
  ["#drivers-license-number", "#routing-number", "#account-number"].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.value = "";
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  if (Date.now() - lastSubmissionAt < 15000) {
    message.textContent = "Please wait a moment before submitting again.";
    message.className = "page-message error";
    return;
  }
  if (document.querySelector("#company-website")?.value) {
    form.reset();
    return;
  }

  const routingNumber = digits(document.querySelector("#routing-number").value);
  const accountNumber = digits(document.querySelector("#account-number").value);
  if (routingNumber.length !== 9) {
    message.textContent = "The routing number must contain exactly nine digits.";
    message.className = "page-message error";
    return;
  }
  if (accountNumber.length < 4 || accountNumber.length > 20) {
    message.textContent = "The account number must contain between four and twenty digits.";
    message.className = "page-message error";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Encrypting and submitting your check-in...";
  message.className = "page-message info";

  const payload = {
    first_name: clean(document.querySelector("#first-name").value),
    middle_name: clean(document.querySelector("#middle-name").value),
    last_name: clean(document.querySelector("#last-name").value),
    date_of_birth: clean(document.querySelector("#date-of-birth")?.value),
    business_name: clean(document.querySelector("#business-name").value),
    client_type: document.querySelector("#client-type").value,
    email: clean(document.querySelector("#email").value),
    phone: phone(document.querySelector("#phone").value),
    preferred_contact_method: document.querySelector("#preferred-contact-method").value,
    address_line_1: clean(document.querySelector("#address-line-1").value),
    address_line_2: clean(document.querySelector("#address-line-2").value),
    city: clean(document.querySelector("#city").value),
    state: clean(document.querySelector("#state").value)?.toUpperCase(),
    postal_code: clean(document.querySelector("#postal-code").value),
    drivers_license_state: clean(document.querySelector("#drivers-license-state").value)?.toUpperCase(),
    drivers_license_expiration: clean(document.querySelector("#drivers-license-expiration").value),
    drivers_license_number: clean(document.querySelector("#drivers-license-number").value),
    direct_deposit_requested: document.querySelector("#direct-deposit-requested").value === "true",
    bank_name: clean(document.querySelector("#bank-name").value),
    bank_account_type: clean(document.querySelector("#bank-account-type").value),
    routing_number: routingNumber,
    account_number: accountNumber,
    consent: document.querySelector("#consent").checked
  };

  const { data, error } = await supabase.functions.invoke("submit-sensitive-intake", { body: payload });
  clearSensitive();
  submitButton.disabled = false;
  if (error) {
    message.textContent = "The secure check-in could not be submitted. Please ask the receptionist for assistance.";
    message.className = "page-message error";
    return;
  }

  lastSubmissionAt = Date.now();
  form.reset();
  form.classList.add("hidden");
  confirmationPanel.classList.remove("hidden");
  document.querySelector("#confirmation-code").textContent = data.confirmation_code;
  message.textContent = "";
});

document.querySelector("#start-over").addEventListener("click", () => {
  form.reset();
  clearSensitive();
  confirmationPanel.classList.add("hidden");
  form.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
});
