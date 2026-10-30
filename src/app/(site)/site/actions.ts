"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { getBrand } from "@/lib/brand";
import type { ActionResult } from "@/lib/data";
import { enquiriesTo, esc, layout, origin, trySend } from "@/lib/mail";
import { createClient } from "@/lib/supabase/server";

const s = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);

export async function sendEnquiry(_: ActionResult, form: FormData): Promise<ActionResult> {
  // A field people never see; bots fill it in.
  if (s(form, "website")) return { ok: "Thanks, we'll be in touch." };
  const name = s(form, "name", 120), email = s(form, "email");
  if (name.length < 2) return { error: "Please tell us your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Please enter a valid email address." };
  const supabase = await createClient();
  const row = {
    name, email,
    company: s(form, "company", 160),
    phone: s(form, "phone", 40),
    role: s(form, "role", 80),
    projects: s(form, "projects", 40),
    message: s(form, "message", 4000),
    source: s(form, "source", 40) || "website",
  };
  const { error } = await supabase.from("enquiries").insert(row);
  if (error) return { error: "We couldn't send that just now. Please try again in a minute." };

  const { appName, rootDomain } = await getBrand();
  const site = await origin();
  after(async () => {
    const lines: [string, string][] = [["Name", row.name], ["Company", row.company], ["Email", row.email], ["Phone", row.phone], ["Role", row.role], ["Projects", row.projects]];
    await trySend({
      to: enquiriesTo(),
      replyTo: email,
      subject: `New demo request: ${row.company || row.name}`,
      html: layout({
        appName,
        heading: "New demo request from the website",
        body: [
          lines.filter(([, v]) => v).map(([k, v]) => `<b>${k}:</b> ${esc(v)}`).join("<br>"),
          ...(row.message ? [`<b>Message:</b><br>${esc(row.message).replace(/\n/g, "<br>")}`] : []),
          "Reply to this email to answer them directly.",
        ],
        button: { href: `https://admin.${rootDomain}/platform/enquiries`, label: "Open website enquiries" },
      }),
    });
    await trySend({
      to: email,
      subject: `Thanks for contacting ${appName}`,
      html: layout({
        appName,
        heading: `Thanks, ${row.name.split(" ")[0]}`,
        body: [
          "We've got your request and will get back to you within one working day to arrange a demo.",
          "If there's anything you'd like us to prepare, such as a project you'd like to see in the app, just reply to this email.",
        ],
        button: { href: site, label: `Visit ${rootDomain}` },
        foot: `You're getting this because you asked for a demo on ${esc(rootDomain)}.`,
      }),
    });
  });
  return { ok: `Thanks ${name.split(" ")[0]}. We've got your message and will get back to you within one working day.` };
}
