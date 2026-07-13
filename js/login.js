import { supabase } from "./config.js";

const form = document.querySelector("#login-form");
const message = document.querySelector("#login-message");

async function redirectExistingSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    window.location.href = "./dashboard.html";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "Signing in...";

  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error(error);
    message.textContent = `Sign-in failed: ${error.message}`;
    message.className = "page-message error";
    return;
  }

  window.location.href = "./dashboard.html";
});

redirectExistingSession();
