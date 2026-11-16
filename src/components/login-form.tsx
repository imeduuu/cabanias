"use client";
import { useState } from "react";
import { createAuthClient } from "better-auth/react";
const authClient = createAuthClient();
export function LoginForm() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return <form className="login-form" onSubmit={async event => {
    event.preventDefault(); setError(""); setPending(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const result = await authClient.signIn.email({ email: String(data.get("email")).trim().toLowerCase(),
        password: String(data.get("password")), rememberMe: false });
      if (result.error) { setError("No fue posible iniciar sesión. Revisa tus credenciales o espera antes de reintentar."); return; }
      form.reset(); window.location.assign("/admin");
    } catch { setError("No fue posible conectar. Intenta nuevamente."); }
    finally { setPending(false); }
  }}>
    <label htmlFor="email">Correo electrónico</label>
    <input id="email" name="email" type="email" autoComplete="username" maxLength={254} required disabled={pending}/>
    <label htmlFor="password">Contraseña</label>
    <input id="password" name="password" type="password" autoComplete="current-password" maxLength={128} required disabled={pending}/>
    <p role="alert" aria-live="polite">{error}</p>
    <button className="button" disabled={pending}>{pending ? "Ingresando…" : "Iniciar sesión"}</button>
  </form>;
}
