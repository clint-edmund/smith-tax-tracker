import { supabase } from "./config.js";

export async function requireAuthentication() {
  const { data, error } =
    await supabase.auth.getSession();

  if (error || !data.session) {
    window.location.href = "./index.html";
    return null;
  }

  const user = data.session.user;

  const {
    data: profile,
    error: profileError
  } = await supabase
    .from("profiles")
    .select("employee_name, email, role, active")
    .eq("id", user.id)
    .single();

  if (
    profileError ||
    !profile ||
    !profile.active
  ) {
    console.error(
      "Employee profile check failed:",
      profileError
    );

    await supabase.auth.signOut();

    window.location.href = "./index.html";

    return null;
  }

  return {
    user,
    profile
  };
}

export async function signOut() {
  await supabase.auth.signOut();

  window.location.href = "./index.html";
}