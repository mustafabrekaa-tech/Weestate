import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { changePassword, saveProfile } from "./actions";
import { TwoFactor } from "./TwoFactor";

export const metadata: Metadata = { title: "My account" };

export default async function Account() {
  const me = await getMe();
  if (!me) redirect("/login");
  const supabase = await createClient();
  const [{ data: dept }, { data: comp }] = await Promise.all([
    supabase.from("departments").select("name").eq("code", me.department ?? "").maybeSingle(),
    supabase.from("companies").select("name, require_mfa").eq("id", me.company_id ?? "").maybeSingle(),
  ]);
  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">{comp?.name}</div><h1>My account</h1></div></div>
      <div className="we-grid">
        <section className="we-card">
          <h2>Me</h2>
          <ActionForm action={saveProfile.bind(null, me.id)} className="we-stack">
            <div className="we-field"><label htmlFor="full_name">Full name</label><input id="full_name" name="full_name" className="we-input" defaultValue={me.full_name} /></div>
            <div className="we-field"><label htmlFor="phone">Mobile</label><input id="phone" name="phone" className="we-input" defaultValue={me.phone} /></div>
            <dl className="we-dl">
              <dt>Email</dt><dd>{me.email}</dd>
              <dt>Department</dt><dd>{dept?.name ?? "Not set"}</dd>
              <dt>Role</dt><dd>{me.is_platform_admin ? "WE-estate staff" : me.is_admin ? "Admin" : "Member"}</dd>
            </dl>
            <div><button className="we-btn we-btn--primary">Save</button></div>
          </ActionForm>
        </section>
        <section className="we-card">
          <h2>Change password</h2>
          <ActionForm action={changePassword} className="we-stack" resetOnOk>
            <div className="we-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" className="we-input" autoComplete="new-password" required minLength={8} /></div>
            <div className="we-field"><label htmlFor="confirm">Again</label><input id="confirm" name="confirm" type="password" className="we-input" autoComplete="new-password" required minLength={8} /></div>
            <div><button className="we-btn we-btn--primary">Change password</button></div>
          </ActionForm>
        </section>
        <section className="we-card" id="security">
          <h2>Authenticator app</h2>
          <TwoFactor required={!!comp?.require_mfa} />
        </section>
      </div>
    </>
  );
}
