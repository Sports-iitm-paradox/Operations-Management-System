import { ReactNode } from "react";
export const label = (s: string) => s.replaceAll("_", " ");
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const fmtT = (s?: string | null) => (s ? new Date(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");
export const fmtDT = (s?: string | null) => (s ? new Date(s).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "none");
export const toIso = (local: string) => new Date(local).toISOString();
const P: Record<string, string> = {
  home: "M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z", cal: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
  duty: "M4 12.5l5 5L20 6.5", alert: "M12 3l10 18H2zM12 10v5M12 18v.5", menu: "M4 7h16M4 12h16M4 17h16", plus: "M12 5v14M5 12h14",
  left: "M15 5l-7 7 7 7", right: "M9 5l7 7-7 7", x: "M6 6l12 12M18 6L6 18", bell: "M6 17V11a6 6 0 0112 0v6l2 2H4zM10 21h4", users: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 4a4 4 0 010 7M22 21a7 7 0 00-4-6"
};
export const Icon = ({ n, s = 22 }: { n: string; s?: number }) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>;
export const Chip = ({ v }: { v: string }) => <span className={"chip c-" + v}>{label(v)}</span>;
export const Err = ({ e }: { e: unknown }) => (e ? <p className="err" role="alert">{(e as Error).message}</p> : null);
export const Empty = ({ t }: { t: string }) => <div className="empty">{t}</div>;
export const Field = ({ l, children }: { l: string; children: ReactNode }) => <label className="field"><span>{l}</span>{children}</label>;
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="scrim" onClick={onClose}><div className="sheet" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
    <div className="sheet-h"><b>{title}</b><button className="icon" onClick={onClose} aria-label="Close"><Icon n="x" /></button></div>{children}</div></div>;
}
