import type { Metadata } from "next";
import { getBrand } from "@/lib/brand";
import { VerifyForm } from "./VerifyForm";

export const metadata: Metadata = { title: "Enter your code" };

export default async function VerifyPage() {
  const b = await getBrand();
  return (
    <div className="we-login">
      <section className="we-login__brand">
        <img src={b.company?.logo_url || b.logo || "/weestate-logo.svg"} alt={b.company?.name ?? b.appName} style={{ maxWidth: "min(100%, 320px)", maxHeight: 160, objectFit: "contain" }} />
      </section>
      <section className="we-login__form">
        <VerifyForm />
      </section>
    </div>
  );
}
