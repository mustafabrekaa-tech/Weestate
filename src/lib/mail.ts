// Email through Microsoft 365 (Microsoft Graph, sendMail as one mailbox).
// Needs MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_FROM; without
// them nothing is sent and the app carries on as before.

export type Mail = { to: string | string[]; subject: string; html: string; replyTo?: string };

const env = () => ({
  tenant: process.env.MS_TENANT_ID ?? "",
  client: process.env.MS_CLIENT_ID ?? "",
  secret: process.env.MS_CLIENT_SECRET ?? "",
  from: process.env.MAIL_FROM ?? "",
});

export const mailReady = () => Object.values(env()).every(Boolean);
export const mailFrom = () => env().from;
// Where website enquiries are sent; the sending mailbox if not set.
export const enquiriesTo = () => (process.env.MAIL_ENQUIRIES_TO || env().from).split(/[,;\s]+/).filter(Boolean);

let token: { value: string; until: number } | null = null;

async function getToken() {
  if (token && token.until > Date.now() + 60_000) return token.value;
  const { tenant, client, secret } = env();
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: client, client_secret: secret, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(j.error_description?.split("\r\n")[0] || `Microsoft sign-in failed (${res.status})`);
  token = { value: j.access_token, until: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return token.value;
}

// Sends one email; throws with Microsoft's reason if it fails.
export async function sendMail(m: Mail) {
  if (!mailReady()) throw new Error("Email isn't set up yet.");
  const to = (Array.isArray(m.to) ? m.to : [m.to]).filter(Boolean);
  if (!to.length) return;
  const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env().from)}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: to.map((address) => ({ emailAddress: { address } })),
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
      },
      saveToSentItems: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(j.error?.message || `Microsoft didn't send it (${res.status})`);
  }
}

// For alerts: a failed email never stops the work it's about.
export async function trySend(m: Mail) {
  if (!mailReady()) return;
  try {
    await sendMail(m);
  } catch (e) {
    console.error("email not sent:", m.subject, (e as Error).message);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export { esc };

// A plain branded email: heading, paragraphs (already escaped HTML), optional button.
export function layout({ heading, body, button, foot, appName = "WE-estate" }: {
  heading: string; body: string[]; button?: { href: string; label: string }; foot?: string; appName?: string;
}) {
  return `<!doctype html><html><body style="margin:0;background:#f5f3ee;font-family:Segoe UI,Arial,sans-serif;color:#1f2a33">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e0d6;border-radius:10px">
<tr><td style="padding:20px 28px;border-bottom:3px solid #c9a24a;font:700 18px Segoe UI,Arial,sans-serif;letter-spacing:.5px">${esc(appName)}</td></tr>
<tr><td style="padding:24px 28px">
<h1 style="margin:0 0 14px;font:600 20px Segoe UI,Arial,sans-serif;color:#1f2a33">${esc(heading)}</h1>
${body.map((p) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3c4852">${p}</p>`).join("\n")}
${button ? `<p style="margin:20px 0 4px"><a href="${esc(button.href)}" style="display:inline-block;background:#c9a24a;color:#1f2a33;text-decoration:none;font-weight:600;padding:11px 20px;border-radius:6px">${esc(button.label)}</a></p>` : ""}
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #eee9de;font-size:12px;color:#7a858e">${foot ?? "Sent by WE-estate."}</td></tr>
</table></td></tr></table></body></html>`;
}

// The address this request came in on, for links in emails.
export async function origin() {
  const { headers } = await import("next/headers");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "weestate.app";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}
