export const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
export const modeLabel = (mode: "night" | "hour") => mode === "night" ? "noche" : "hora";
