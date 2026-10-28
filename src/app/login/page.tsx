import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="we-login">
      <section className="we-login__brand">
        <img src="/weestate-lockup-reverse.svg" alt="WE-estate" style={{ height: 40, width: "auto" }} />
        <div>
          <h1>We, on the same line.</h1>
          <p>Every department enters its own work. <span style={{ whiteSpace: "nowrap" }}>WE-estate</span> shows where every project stands, for all of us at once.</p>
        </div>
        <img src="/weestate-lockup-ar-reverse.svg" alt="وي إستيت" style={{ height: 28, width: "auto", justifySelf: "start" }} />
      </section>
      <section className="we-login__form">
        <LoginForm />
      </section>
    </div>
  );
}
