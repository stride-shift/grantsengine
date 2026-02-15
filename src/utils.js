import { C } from "./theme";

export const fmt = n => n ? `R${(n / 1e6).toFixed(1)}M` : "—";
export const fmtK = n => n ? (n >= 1e6 ? `R${(n / 1e6).toFixed(1)}M` : `R${(n / 1e3).toFixed(0)}K`) : "—";
export const dL = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
export const uid = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const urgC = d => d === null ? C.t3 : d < 0 ? C.red : d <= 14 ? C.red : d < 30 ? C.amber : C.ok;
export const urgLabel = d => d === null ? null : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : d <= 3 ? `${d}d left!` : d <= 14 ? `⚠ ${d}d` : `${d}d`;
export const td = () => new Date().toISOString().slice(0, 10);
export const addD = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const cp = t => {
  try { navigator.clipboard.writeText(t); }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); document.body.removeChild(a); }
};

