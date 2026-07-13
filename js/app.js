import { supabase } from "./config.js";

export { supabase };

export const ROLES = Object.freeze({
  ADMINISTRATOR: "administrator",
  OFFICE_MANAGER: "office_manager",
  SENIOR_PREPARER: "senior_preparer",
  PREPARER: "preparer",
  RECEPTIONIST: "receptionist",
  BOOKKEEPER: "bookkeeper",
  READ_ONLY: "read_only"
});

export const ROLE_LABELS = Object.freeze({
  administrator: "Administrator",
  office_manager: "Office Manager",
  senior_preparer: "Senior Preparer",
  preparer: "Preparer",
  receptionist: "Receptionist",
  bookkeeper: "Bookkeeper",
  read_only: "Read Only"
});

export const ROLE_GROUPS = Object.freeze({
  ALL_ACTIVE: ["administrator","office_manager","senior_preparer","preparer","receptionist","bookkeeper","read_only"],
  CLIENT_EDITORS: ["administrator","office_manager","senior_preparer","preparer","receptionist"],
  RETURN_EDITORS: ["administrator","office_manager","senior_preparer","preparer"],
  PAYMENT_USERS: ["administrator","office_manager","senior_preparer","preparer","receptionist","bookkeeper"],
  REPORT_USERS: ["administrator","office_manager","senior_preparer","preparer","bookkeeper","read_only"],
  EMPLOYEE_PAGE_USERS: ["administrator","office_manager"],
  IMPORT_USERS: ["administrator","office_manager"]
});

export function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
export function formatCurrency(value) { return new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(Number(value||0)); }
export function formatDate(value) { if(!value)return ""; return new Intl.DateTimeFormat("en-US",{dateStyle:"medium"}).format(new Date(`${value}T00:00:00`)); }
export function formatDateTime(value) { if(!value)return ""; return new Intl.DateTimeFormat("en-US",{dateStyle:"short",timeStyle:"short"}).format(new Date(value)); }
export function cleanValue(value) { const v=String(value??"").trim(); return v===""?null:v; }
export function clientName(client) { if(!client)return ""; if(client.business_name)return client.business_name; return [client.first_name,client.last_name].filter(Boolean).join(" ").trim(); }
export function setMessage(element,text,type="info") { if(!element)return; element.textContent=text; element.className=`page-message ${type}`; }
export function clearMessage(element) { if(!element)return; element.textContent=""; element.className="page-message"; }
export function roleLabel(role) { return ROLE_LABELS[role] || role; }
export function hasRole(profile,roles) { return Boolean(profile && roles.includes(profile.role)); }

export async function requireSession(options={}) {
  const { allowedRoles=ROLE_GROUPS.ALL_ACTIVE, redirectOnDenied="./dashboard.html" }=options;
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session){ window.location.href="./index.html"; return null; }
  const user=data.session.user;
  const {data:profile,error:profileError}=await supabase.from("profiles").select("id, employee_name, email, role, active").eq("id",user.id).single();
  if(profileError||!profile||!profile.active){ await supabase.auth.signOut(); window.location.href="./index.html"; return null; }
  if(!allowedRoles.includes(profile.role)){ window.location.href=redirectOnDenied; return null; }
  document.querySelectorAll("[data-employee-name]").forEach(el=>{el.textContent=`${profile.employee_name} — ${roleLabel(profile.role)}`;});
  document.querySelectorAll("[data-roles]").forEach(el=>{ const roles=el.dataset.roles.split(",").map(x=>x.trim()); el.hidden=!roles.includes(profile.role); });
  bindNavigation();
  return {user,profile,session:data.session};
}

function bindNavigation(){
  const routes={dashboard:"./dashboard.html",clients:"./clients.html",intakes: "./intakes.html",reports:"./reports.html",employees:"./employees.html",import:"./import.html",settings:"./settings.html"};
  document.querySelectorAll("[data-nav]").forEach(button=>{ if(button.dataset.bound==="true")return; const route=routes[button.dataset.nav]; if(!route)return; button.dataset.bound="true"; button.addEventListener("click",()=>window.location.href=route); });
  document.querySelectorAll("[data-logout]").forEach(button=>{ if(button.dataset.bound==="true")return; button.dataset.bound="true"; button.addEventListener("click",async()=>{await supabase.auth.signOut();window.location.href="./index.html";}); });
}
export function todayIso(){return new Date().toISOString().slice(0,10);}
export function previousTaxYear(){return new Date().getFullYear()-1;}
export function downloadCsv(filename,rows){ if(!rows.length)return; const headers=Object.keys(rows[0]); const q=v=>`"${String(v??"").replaceAll('"','""')}"`; const csv=[headers.map(q).join(","),...rows.map(r=>headers.map(h=>q(r[h])).join(","))].join("\n"); const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url); }
