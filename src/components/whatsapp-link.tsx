export function WhatsappLink({ href, cabinName }: { href: string; cabinName: string }) {
  return <p className="whatsapp-contact">
    <a className="button secondary" href={href} target="_blank" rel="noopener noreferrer"
      aria-label={`Consultar por WhatsApp sobre ${cabinName} (se abre en una pestaña nueva)`}>Consultar por WhatsApp</a>
    <small className="muted">Se abrirá WhatsApp con un mensaje que puedes revisar antes de enviar. No incluye tu nombre, correo ni teléfono.</small>
  </p>;
}
