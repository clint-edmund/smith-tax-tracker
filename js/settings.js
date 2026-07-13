import { requireSession } from "./app.js";

const auth = await requireSession();
document.querySelector("#setting-name").textContent = auth.profile.employee_name;
document.querySelector("#setting-email").textContent = auth.profile.email;
document.querySelector("#setting-role").textContent = auth.profile.role;
document.querySelector("#setting-user-id").textContent = auth.user.id;
