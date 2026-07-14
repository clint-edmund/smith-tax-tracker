import { supabase } from "./config.js";

const form =
  document.querySelector("#check-in-form");

const message =
  document.querySelector("#check-in-message");

const confirmationPanel =
  document.querySelector("#confirmation-panel");

const submitButton =
  document.querySelector("#submit-check-in");

let lastSubmissionAt = 0;

function clean(value) {
  const result = String(value ?? "").trim();
  return result === "" ? null : result;
}

function normalizePhone(value) {
  return String(value ?? "")
    .replace(/[^\d+]/g, "")
    .slice(0, 20);
}

function resetSensitiveFields() {
  [
    "#drivers-license-last-four",
    "#routing-last-four",
    "#account-last-four"
  ].forEach((selector) => {
    document.querySelector(selector).value = "";
  });
}

function createConfirmationCode() {
  const year = new Date().getFullYear();

  const randomPart =
    crypto.randomUUID()
      .replaceAll("-", "")
      .slice(0, 8)
      .toUpperCase();

  return `WI-${year}-${randomPart}`;
}

function validateLastFour(value, digitsOnly = false) {
  if (!value) {
    return true;
  }

  const expression =
    digitsOnly
      ? /^[0-9]{4}$/
      : /^[A-Za-z0-9]{4}$/;

  return expression.test(value);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!form.reportValidity()) {
    return;
  }

  const now = Date.now();

  if (now - lastSubmissionAt < 15000) {
    message.textContent =
      "Please wait a moment before submitting again.";

    message.className = "page-message error";
    return;
  }

  const honeypot =
    document.querySelector("#company-website").value;

  if (honeypot) {
    form.reset();
    return;
  }

  const licenseLastFour =
    clean(
      document.querySelector(
        "#drivers-license-last-four"
      ).value
    );

  const routingLastFour =
    clean(
      document.querySelector(
        "#routing-last-four"
      ).value
    );

  const accountLastFour =
    clean(
      document.querySelector(
        "#account-last-four"
      ).value
    );

  if (!validateLastFour(licenseLastFour)) {
    message.textContent =
      "The driver's-license last-four field must contain exactly four letters or numbers.";

    message.className = "page-message error";
    return;
  }

  if (!validateLastFour(routingLastFour, true)) {
    message.textContent =
      "The routing last-four field must contain exactly four digits.";

    message.className = "page-message error";
    return;
  }

  if (!validateLastFour(accountLastFour, true)) {
    message.textContent =
      "The account last-four field must contain exactly four digits.";

    message.className = "page-message error";
    return;
  }

  submitButton.disabled = true;

  message.textContent =
    "Submitting your check-in...";

  message.className = "page-message info";

  const confirmationCode =
    createConfirmationCode();

  const payload = {
    intake_code: confirmationCode,

    status: "Submitted",

    first_name:
      clean(
        document.querySelector("#first-name").value
      ),

    middle_name:
      clean(
        document.querySelector("#middle-name").value
      ),

    last_name:
      clean(
        document.querySelector("#last-name").value
      ),
    
    date_of_birth:
      clean(
        document.querySelector("#date-of-birth").value
      ),
        
    business_name:
      clean(
        document.querySelector("#business-name").value
      ),

    client_type:
      document.querySelector("#client-type").value,

    email:
      clean(
        document.querySelector("#email").value
      ),

    phone:
      normalizePhone(
        document.querySelector("#phone").value
      ),

    preferred_contact_method:
      document.querySelector(
        "#preferred-contact-method"
      ).value,

    address_line_1:
      clean(
        document.querySelector(
          "#address-line-1"
        ).value
      ),

    address_line_2:
      clean(
        document.querySelector(
          "#address-line-2"
        ).value
      ),

    city:
      clean(
        document.querySelector("#city").value
      ),

    state:
      clean(
        document.querySelector("#state").value
      )?.toUpperCase(),

    postal_code:
      clean(
        document.querySelector(
          "#postal-code"
        ).value
      ),

    drivers_license_state:
      clean(
        document.querySelector(
          "#drivers-license-state"
        ).value
      )?.toUpperCase(),

    drivers_license_expiration:
      clean(
        document.querySelector(
          "#drivers-license-expiration"
        ).value
      ),

    drivers_license_last_four:
      licenseLastFour,

    direct_deposit_requested:
      document.querySelector(
        "#direct-deposit-requested"
      ).value === "true",

    bank_name:
      clean(
        document.querySelector("#bank-name").value
      ),

    bank_account_type:
      clean(
        document.querySelector(
          "#bank-account-type"
        ).value
      ),

    routing_last_four:
      routingLastFour,

    account_last_four:
      accountLastFour,

    consent_received: true
  };

  const { error } = await supabase
    .from("walk_in_intakes")
    .insert(payload);

  resetSensitiveFields();
  submitButton.disabled = false;

  if (error) {
    console.error(
      "Check-in submission failed:",
      error
    );

    message.textContent =
      "The check-in could not be submitted. Please ask the receptionist for assistance.";

    message.className =
      "page-message error";

    return;
  }

  lastSubmissionAt = now;

  form.reset();
  form.classList.add("hidden");

  confirmationPanel.classList.remove(
    "hidden"
  );

  document.querySelector(
    "#confirmation-code"
  ).textContent = confirmationCode;

  message.textContent = "";
});

document.querySelector("#start-over")
  .addEventListener("click", () => {
    form.reset();
    resetSensitiveFields();

    confirmationPanel.classList.add(
      "hidden"
    );

    form.classList.remove("hidden");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  });
