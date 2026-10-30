import type { Metadata } from "next";
import { Fragment } from "react";
import { ActionForm } from "@/components/ActionForm";
import { PortalHead } from "@/components/PortalHead";
import { getMe } from "@/lib/data";
import { enquiriesTo, mailFrom, mailReady } from "@/lib/mail";
import { sendTestEmail } from "../actions";

export const metadata: Metadata = { title: "Email" };

const SENT: [string, string][] = [
  ["New demo request", "To you (the enquiries address), with Reply going straight to the person. They get a thank-you email too."],
  ["Waiting on you", "To everyone in the department a document has just moved to, for the projects they can see."],
  ["Returned, rejected or done", "To the person who raised the document."],
  ["New account", "Sign-in address and temporary password, when an admin adds someone and leaves \"Email them\" ticked."],
];

export default async function PlatformEmail() {
  const me = await getMe();
  const ready = mailReady();
  return (
    <>
      <PortalHead title="Email" lead="The app sends email from your Microsoft 365 mailbox." />
      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>{ready ? "Connected" : "Not connected yet"}</h2>
        {ready ? (
          <dl className="we-dl">
            <dt>Sends from</dt><dd>{mailFrom()}</dd>
            <dt>Demo requests go to</dt><dd>{enquiriesTo().join(", ")}</dd>
          </dl>
        ) : (
          <p className="we-help" style={{ margin: 0 }}>
            Add MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and MAIL_FROM to the app&apos;s settings on Vercel (MAIL_ENQUIRIES_TO is optional), then redeploy.
            Until then nothing is emailed and everything else works as before.
          </p>
        )}
        {ready && (
          <ActionForm action={sendTestEmail}>
            <div className="we-field" style={{ maxWidth: 420 }}><label htmlFor="to">Send a test to</label><input id="to" name="to" type="email" className="we-input" defaultValue={me?.email} /></div>
            <div><button className="we-btn we-btn--primary">Send test email</button></div>
          </ActionForm>
        )}
      </section>
      <section className="we-card we-stack">
        <h2 style={{ margin: 0 }}>What gets emailed</h2>
        <dl className="we-dl">{SENT.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>
        <p className="we-help" style={{ margin: 0 }}>Anyone can turn off their approval emails under My account.</p>
      </section>
    </>
  );
}
