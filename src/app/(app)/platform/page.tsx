import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { getMe } from "@/lib/data";
import { date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { createWorkspace } from "../admin/actions";

export const metadata: Metadata = { title: "Workspaces" };

type W = { id: string; slug: string; name: string; created_at: string; people: number; projects: number; units: number };

export default async function Platform() {
  const me = await getMe();
  if (!me?.is_platform_admin) redirect("/");
  const supabase = await createClient();
  const { data } = await supabase.rpc("platform_workspaces");
  return (
    <>
      <div className="we-pagehead"><div><div className="we-eyebrow">WE-estate staff</div><h1>Workspaces</h1></div></div>
      <div className="we-table-wrap">
        <table className="we-table">
          <thead><tr><th>Developer</th><th>Short name</th><th className="num">People</th><th className="num">Projects</th><th className="num">Units</th><th>Since</th><th /></tr></thead>
          <tbody>
            {((data ?? []) as W[]).map((w) => (
              <tr key={w.id}>
                <td><b>{w.name}</b></td>
                <td><span className="we-code">{w.slug}</span></td>
                <td className="num">{w.people}</td>
                <td className="num">{w.projects}</td>
                <td className="num">{w.units}</td>
                <td>{date(w.created_at)}</td>
                <td><Link href={`/admin/people?company=${w.id}`}>People</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="we-card">
        <h2>Open a workspace for a new developer</h2>
        <ActionForm action={createWorkspace} className="we-form-grid">
          <div className="we-field"><label htmlFor="name">Company name</label><input id="name" name="name" className="we-input" required /></div>
          <div className="we-field"><label htmlFor="name_ar">Name in Arabic</label><input id="name_ar" name="name_ar" className="we-input" dir="rtl" /></div>
          <div className="we-field"><label htmlFor="slug">Short name</label><input id="slug" name="slug" className="we-input we-mono" required placeholder="palmhills" pattern="[a-z0-9][a-z0-9-]{1,38}[a-z0-9]" /></div>
          <div className="we-field"><label htmlFor="admin_email">Their admin&apos;s email</label><input id="admin_email" name="admin_email" type="email" className="we-input" /></div>
          <div className="we-field"><label htmlFor="admin_name">Admin&apos;s name</label><input id="admin_name" name="admin_name" className="we-input" /></div>
          <div className="we-field" style={{ alignSelf: "end" }}><button className="we-btn we-btn--primary">Create workspace</button></div>
        </ActionForm>
      </section>
    </>
  );
}
