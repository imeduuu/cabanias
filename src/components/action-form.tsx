"use client";
import { useActionState, type ReactNode } from "react";
export type FormState = { error: string };
export type FormAction = (state: FormState, data: FormData) => Promise<FormState>;
export function ActionForm({ action, children, label, kind }: { action: FormAction; children?: ReactNode; label: string; kind: string }) {
  const [state, submit, pending] = useActionState(action, { error: "" });
  return <form action={submit} className="management-form" data-management={kind}>
    <fieldset disabled={pending}>{children}</fieldset>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    <button className="button" disabled={pending}>{pending ? "Guardando…" : label}</button>
  </form>;
}
