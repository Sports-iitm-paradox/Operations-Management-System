import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { ASSIGNERS, LIVE, useMe } from "../me";
import { Chip, Empty, Err, Field, Icon, Sheet, dayKey, fmtT, label } from "../ui";

function StaffRow({ s, users }: { s: any; users: any[] }) {
  const qc = useQueryClient(); const [mode, setMode] = useState<"" | "re" | "x">(""); const [who, setWho] = useState(""); const [why, setWhy] = useState("");
  const done = { onSuccess: () => { setMode(""); setWhy(""); qc.invalidateQueries(); } };
  const re = useMutation({ mutationFn: () => api(`/duties/${s.duty_id}/reassign`, "POST", { user_id: who, reason: why }), ...done });
  const cx = useMutation({ mutationFn: () => api(`/duties/${s.duty_id}/cancel`, "POST", { reason: why }), ...done });
  return <div className="staff"><div className="bar"><span><Chip v={s.kind} /> <b>{s.name}</b></span><span className="mu small">{s.checked_in ? "Checked in" : label(s.status)}</span></div>
    {users.length > 0 && !mode && <div className="btns"><button className="ghost" onClick={() => setMode("re")}>Reassign</button><button className="ghost danger" onClick={() => setMode("x")}>Cancel duty</button></div>}
    {mode && <><Field l={mode === "re" ? "New person" : "Reason"}>{mode === "re" ? <select value={who} onChange={e => setWho(e.target.value)}><option value="">Select</option>{users.filter(u => u.id !== s.user_id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select> : <input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why is this being cancelled?" />}</Field>
      {mode === "re" && <Field l="Reason"><input value={why} onChange={e => setWhy(e.target.value)} placeholder="Why is this changing?" /></Field>}<Err e={re.error || cx.error} />
      <div className="btns"><button className="ghost" onClick={() => setMode("")}>Back</button><button className="btn" disabled={why.length < 3 || (mode === "re" && !who)} onClick={() => (mode === "re" ? re : cx).mutate()}>Confirm</button></div></>}</div>;
}

function AssignForm({ session, users }: { session: any; users: any[] }) {
  const qc = useQueryClient(); const [user, setUser] = useState(""); const [kind, setKind] = useState(session.missing[0] || "BACKUP"); const [why, setWhy] = useState("");
  const m = useMutation({ mutationFn: () => api("/duties", "POST", { session_id: session.id, user_id: user, kind, override_reason: why || undefined }), onSuccess: () => { setUser(""); setWhy(""); qc.invalidateQueries(); } });
  const clash = (m.error as Error | null)?.message === "Scheduling conflict";
  return <div className="panel"><b>Assign a duty</b>
    <Field l="Person"><select value={user} onChange={e => setUser(e.target.value)}><option value="">Select</option>{users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
    <Field l="Duty type"><select value={kind} onChange={e => setKind(e.target.value)}>{["POC", "BACKUP", "COORDINATOR"].map(k => <option key={k} value={k}>{label(k)}</option>)}</select></Field>
    {clash && <><p className="err">This person has an overlapping duty or less than the required gap between duties. Enter a reason to override.</p><Field l="Override reason"><input value={why} onChange={e => setWhy(e.target.value)} /></Field></>}
    {!clash && <Err e={m.error} />}<button className="btn block" disabled={!user || m.isPending || (clash && why.length < 3)} onClick={() => m.mutate()}>{clash ? "Assign with override" : "Assign"}</button></div>;
}

export default function Calendar() {
  const me = useMe(); const canAssign = ASSIGNERS.includes(me?.role);
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; }); const [sel, setSel] = useState(dayKey(new Date())); const [openId, setOpenId] = useState<string | null>(null);
  const start = new Date(cur); start.setDate(1 - ((cur.getDay() + 6) % 7)); start.setHours(0, 0, 0, 0);
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const end = new Date(cells[41]); end.setDate(end.getDate() + 1);
  const q = useQuery({ queryKey: ["cal", dayKey(start)], queryFn: () => api<any[]>(`/calendar?start=${encodeURIComponent(start.toISOString())}&end=${encodeURIComponent(end.toISOString())}`), ...LIVE });
  const users = useQuery({ queryKey: ["users-all"], queryFn: () => api<any[]>("/users?limit=200"), enabled: canAssign });
  const by = useMemo(() => { const m: Record<string, any[]> = {}; (q.data || []).forEach(s => { const k = dayKey(new Date(s.starts_at)); (m[k] = m[k] || []).push(s); }); return m; }, [q.data]);
  const today = dayKey(new Date()), agenda = by[sel] || [], open = q.data?.find(s => s.id === openId);
  const shift = (n: number) => { const d = new Date(cur); d.setMonth(d.getMonth() + n); setCur(d); };
  return <>
    <div className="bar"><h2>Calendar</h2><div className="btns"><button className="icon" onClick={() => shift(-1)} aria-label="Previous month"><Icon n="left" /></button>
      <b className="month">{cur.toLocaleString([], { month: "long", year: "numeric" })}</b><button className="icon" onClick={() => shift(1)} aria-label="Next month"><Icon n="right" /></button></div></div>
    <div className="cal" role="grid">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <div key={i} className="dow">{d}</div>)}
      {cells.map(d => { const k = dayKey(d), ss = by[k] || []; const gap = ss.some(s => s.missing.includes("POC"));
        return <button key={k} className={"day" + (d.getMonth() !== cur.getMonth() ? " off" : "") + (k === sel ? " sel" : "") + (k === today ? " today" : "")} onClick={() => setSel(k)} aria-label={`${k}, ${ss.length} sessions`}>
          <span>{d.getDate()}</span><i className="dots">{ss.slice(0, 3).map((s, j) => <b key={j} className={gap ? "gap" : ""} />)}</i></button>; })}</div>
    <h3>{new Date(sel + "T00:00").toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}</h3>
    {q.isLoading ? <p className="mu">Loading</p> : agenda.length === 0 ? <Empty t="No sessions on this day." /> : agenda.map(s => <button key={s.id} className="card session" onClick={() => setOpenId(s.id)}>
      <div className="time"><b>{fmtT(s.starts_at)}</b><span>{fmtT(s.ends_at)}</span></div>
      <div className="grow"><b>{s.event_name}</b><span className="mu">{s.stage}</span><div className="chips">{s.staff.map((x: any) => <span key={x.duty_id} className={"mini" + (x.checked_in ? " in" : "")}>{x.kind[0]} {x.name?.split(" ")[0]}</span>)}{s.missing.map((m: string) => <span key={m} className="mini miss">No {label(m)}</span>)}</div></div></button>)}
    {open && <Sheet title={`${open.event_name}: ${open.stage}`} onClose={() => setOpenId(null)}>
      <p className="mu">{fmtT(open.starts_at)} to {fmtT(open.ends_at)} <Chip v={open.status} /></p>
      <div className="btns">{open.meet_url && <a className="ghost" href={open.meet_url} target="_blank" rel="noreferrer">Meeting link</a>}{open.stream_url && <a className="ghost" href={open.stream_url} target="_blank" rel="noreferrer">Livestream</a>}</div>
      <h4>Staffing</h4>{open.staff.length === 0 && <Empty t="Nobody assigned yet." />}{open.staff.map((x: any) => <StaffRow key={x.duty_id} s={x} users={canAssign ? users.data || [] : []} />)}
      {open.missing.length > 0 && <p className="err">Missing: {open.missing.map(label).join(", ")}</p>}{canAssign && <AssignForm session={open} users={users.data || []} />}</Sheet>}
  </>;
}
