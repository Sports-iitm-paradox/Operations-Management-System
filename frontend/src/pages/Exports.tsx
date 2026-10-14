import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, download } from "../api";
import { Err, Field } from "../ui";

const SETS: [string, string, string][] = [["issues", "Issue log", "Every issue with severity, owner, deadlines, resolution and closure."], ["duties", "Duty roster", "Who is assigned to which session and duty type."],
  ["attendance", "Attendance", "Scheduled versus actual check-in and check-out, lateness and planned hours."]];
export default function Exports() {
  const [event, setEvent] = useState(""); const [err, setErr] = useState<unknown>(null); const [busy, setBusy] = useState("");
  const evs = useQuery({ queryKey: ["events"], queryFn: () => api<any[]>("/events?limit=200") });
  const go = async (k: string, f: string) => { setErr(null); setBusy(k + f); try { await download(`/exports/${k}?format=${f}${event ? "&event_id=" + event : ""}`, `${k}.${f}`); } catch (e) { setErr(e); } setBusy(""); };
  return <><h2>Exports</h2><Field l="Limit to one event (optional)"><select value={event} onChange={e => setEvent(e.target.value)}><option value="">All events I can see</option>{evs.data?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><Err e={err} />
    {SETS.map(([k, t, d]) => <div className="card" key={k}><b>{t}</b><p className="mu">{d}</p><div className="btns"><button className="btn" disabled={!!busy} onClick={() => go(k, "xlsx")}>{busy === k + "xlsx" ? "Preparing" : "Excel"}</button>
      <button className="ghost" disabled={!!busy} onClick={() => go(k, "csv")}>{busy === k + "csv" ? "Preparing" : "CSV"}</button></div></div>)}
    <p className="mu small">Exports follow your access: you only get events you are allowed to see, and every export is recorded in the audit log.</p></>;
}
