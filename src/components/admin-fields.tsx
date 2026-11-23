import type { InputHTMLAttributes } from "react";
export function Field({ label, name, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return <label className="form-field">{label}<input name={name} {...props}/></label>;
}
export function TextArea({ label, name, defaultValue = "", required = false, maxLength = 5000 }: { label: string; name: string; defaultValue?: string; required?: boolean; maxLength?: number }) {
  const rows = defaultValue.length > 140 ? 5 : 4;
  return <label className="form-field">{label}<textarea name={name} defaultValue={defaultValue} rows={rows} required={required} maxLength={maxLength}/></label>;
}
export function StatusMessage({ saved }: { saved: boolean }) { return saved ? <p role="status" className="notice">Cambios guardados. Ya puedes revisarlos en el sitio público.</p> : null; }
