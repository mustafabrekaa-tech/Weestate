import type { Metadata } from "next";
import { WorkspaceForm } from "@/components/SiteForms";
import { getBrand } from "@/lib/brand";
import { goToWorkspace } from "../actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignIn() {
  const b = await getBrand();
  return (
    <main className="ws-signin">
      <div className="ws-card">
        <h1>Sign in to your workspace</h1>
        <p className="ws-muted">Each company has its own address, like <b>yourcompany.{b.rootDomain}</b>. Enter yours and we&apos;ll take you there.</p>
        <WorkspaceForm action={goToWorkspace} root={b.rootDomain} />
        <p className="ws-muted ws-small">Don&apos;t know it? Ask your company&apos;s {b.appName} admin. Not a customer yet? <a href="/#contact">Book a demo</a>.</p>
      </div>
    </main>
  );
}
