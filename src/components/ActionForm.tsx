"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/data";

// A form posting to a server action that answers with an error or a note.
export function ActionForm({
  action,
  children,
  className = "we-stack",
  resetOnOk = false,
}: {
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className} key={resetOnOk && state?.ok ? state.ok : undefined}>
      {state?.error && <div className="we-banner we-banner--error" role="alert">{state.error}</div>}
      {state?.ok && <div className="we-banner we-banner--ok" role="status">{state.ok}</div>}
      <fieldset disabled={pending} className="we-fieldset">{children}</fieldset>
    </form>
  );
}
