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
  redirect("/");
}
