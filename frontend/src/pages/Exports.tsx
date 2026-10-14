import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, download } from "../api";
import { Err, Field, Icon } from "../ui";

const SETS: [string, string, string][] = [
  [
    "issues",
    "Issue log",
    "Every issue with severity, owner, deadlines, resolution and closure audit trail.",
  ],
  [
    "duties",
    "Duty roster",
    "Who is assigned to which session, roles, attendance status and override records.",
  ],
  [
    "attendance",
    "Attendance",
    "Scheduled versus actual check-in and check-out, minutes late and planned hours.",
  ],
];

export default function Exports() {
  const [event, setEvent] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [busy, setBusy] = useState("");
  const evs = useQuery({
    queryKey: ["events"],
    queryFn: () => api<any[]>("/events?limit=200"),
  });

  const go = async (k: string, f: string) => {
    setErr(null);
    setBusy(k + f);
    try {
      await download(
        `/exports/${k}?format=${f}${event ? "&event_id=" + event : ""}`,
        `${k}.${f}`
      );
    } catch (e) {
      setErr(e);
    }
    setBusy("");
  };

  return (
    <>
      <div className="cal-title-section">
        <h1>Exports</h1>
        <div className="cal-title-sub">Download production rosters, attendance and incident reports</div>
      </div>

      <Field l="Limit to one event (optional)">
        <select value={event} onChange={(e) => setEvent(e.target.value)}>
          <option value="">All events I can see</option>
          {evs.data?.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <Err e={err} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        {SETS.map(([k, t, d]) => (
          <div className="card" key={k} style={{ padding: "18px" }}>
            <b style={{ fontSize: 16 }}>{t}</b>
            <p className="mu" style={{ fontSize: 13, margin: "4px 0 14px" }}>
              {d}
            </p>
            <div className="btns">
              <button
                className="btn"
                disabled={!!busy}
                onClick={() => go(k, "xlsx")}
              >
                {busy === k + "xlsx" ? "Preparing..." : "Excel"}
              </button>
              <button
                className="ghost"
                disabled={!!busy}
                onClick={() => go(k, "csv")}
              >
                {busy === k + "csv" ? "Preparing..." : "CSV"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="mu small center" style={{ marginTop: 24 }}>
        Exports follow your role permissions and every download is logged in the audit trail.
      </p>
    </>
  );
}