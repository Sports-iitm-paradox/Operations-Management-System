import { ReactNode } from "react";

export const label = (s: string) => s.replaceAll("_", " ");

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fmtT = (s?: string | null) =>
  s ? new Date(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

export const fmtTimeParts = (s?: string | null) => {
  if (!s) return { time: "--:--", ampm: "" };
  const str = new Date(s).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const parts = str.split(" ");
  if (parts.length === 2) {
    return { time: parts[0], ampm: parts[1] };
  }
  return { time: str, ampm: "" };
};

export const fmtDT = (s?: string | null) =>
  s ? new Date(s).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "none";

export const fmtShortDate = (s?: string | null | Date) => {
  if (!s) return "";
  const d = typeof s === "string" ? new Date(s) : s;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
};

export const fmtFullDate = (d: Date) =>
  d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning,";
  if (h < 17) return "Good afternoon,";
  return "Good evening,";
};

export const toIso = (local: string) => new Date(local).toISOString();

/* Stylized Sports "S" Mark */
export const BrandLogo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M23 6H12C8.686 6 6 8.686 6 12C6 14.8 7.9 17.2 10.6 17.8L19.4 19.8C21.8 20.3 23.5 22.4 23.5 24.8C23.5 27.6 21.2 29.8 18.5 29.8H7"
      stroke="currentColor"
      strokeWidth="3.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M15 12H26" stroke="#2563eb" strokeWidth="3.2" strokeLinecap="round" />
  </svg>
);

/* Clean, modern SVG icon library matching iOS / Figma design */
export const Icon = ({
  n,
  s = 20,
  className = "",
  style,
}: {
  n: string;
  s?: number;
  className?: string;
  style?: React.CSSProperties;
}) => {
  const commonProps = { width: s, height: s, className, style, "aria-hidden": true as const };
  switch (n) {
    case "home":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5H15v-5.5a1 1 0 00-1-1h-4a1 1 0 00-1 1V21H4.5A1.5 1.5 0 013 20v-9.5z" />
        </svg>
      );
    case "cal":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="3" />
          <path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
        </svg>
      );
    case "duty":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1.5" />
          <path d="M9 13.5l2 2 4-4" />
        </svg>
      );
    case "alert":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <path d="M12 9v4M12 17h.01" />
        </svg>
      );
    case "menu":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "search":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="11" cy="11" r="7.5" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "bell":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
      );
    case "user":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );
    case "users":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      );
    case "chevronRight":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case "arrowRight":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      );
    case "pin":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
      );
    case "clock":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      );
    case "check":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "plus":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "left":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      );
    case "right":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      );
    case "x":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      );
    case "file":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
      );
    case "shield":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
    case "info":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v4h1" />
        </svg>
      );
    case "trophy":
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
          <path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18" />
          <path d="M4 22h16M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v3h10v-3c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
          <path d="M18 4H6v7a6 6 0 0012 0V4z" />
        </svg>
      );
    default:
      return null;
  }
};

/* Soft pastel pill badges for modern clean aesthetics */
export const Chip = ({ v, className = "" }: { v: string; className?: string }) => {
  return <span className={`chip c-${v} ${className}`}>{label(v)}</span>;
};

export const Err = ({ e }: { e: unknown }) =>
  e ? (
    <p className="err" role="alert">
      {(e as Error).message}
    </p>
  ) : null;

export const Empty = ({ t, icon = "info" }: { t: string; icon?: string }) => (
  <div className="empty">
    <div className="empty-icon">
      <Icon n={icon} s={24} />
    </div>
    <span>{t}</span>
  </div>
);

export const Field = ({ l, children }: { l: string; children: ReactNode }) => (
  <label className="field">
    <span>{l}</span>
    {children}
  </label>
);

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-h">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon n="x" s={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}