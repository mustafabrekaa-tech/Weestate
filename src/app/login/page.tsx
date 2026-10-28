import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="we-login">
      <section className="we-login__brand">
        <img src="/weestate-logo-reverse.svg" alt="WE-estate, every project, one team" style={{ width: "min(100%, 360px)", height: "auto" }} />
        <p>
          Every department enters its own work. <span style={{ whiteSpace: "nowrap" }}>WE-estate</span> shows where every project stands.
        </p>
      </section>
      <section className="we-login__form">
        <LoginForm />
      </section>
    </div>
  );
}
