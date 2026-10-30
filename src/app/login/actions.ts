"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(_: string | null, form: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
  if (error && !error.status) return "Can't reach the WE-estate server right now. Try again in a minute.";
  if (error) return "That email and password don't match. Check them, or ask an admin to reset your password.";
  // Accounts with an authenticator app need the 6-digit code as well.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/verify");
  redirect("/");
}
