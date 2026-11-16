import { LoginForm } from "@/components/login-form";
export const metadata = { title: "Acceso administrativo", robots: { index: false, follow: false } };
export default function LoginPage() {
  return <main id="contenido" className="container section"><section className="price-panel login-panel">
    <p className="eyebrow">ADMINISTRACIÓN</p><h1>Bienvenido de nuevo.</h1>
    <p>Ingresa con la cuenta administradora de esta instalación.</p><LoginForm/>
    <small>El panel conserva contenido de demostración. No hay registro público.</small>
  </section></main>;
}
