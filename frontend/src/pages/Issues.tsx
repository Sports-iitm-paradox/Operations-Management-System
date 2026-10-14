import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, openFile, prepareFile, sendFile } from "../api";
import { LIVE } from "../me";
import { Chip, Empty, Err, Field, Icon, Sheet, fmtDT, label } from "../ui";

const STATUSES = ["", "REPORTED", "TRIAGED", "ASSIGNED", "IN_PROGRESS", "RESOLUTION_SUBMITTED", "VERIFIED", "CLOSED", "REOPENED"];
function Detail({ i, onClose }: { i: any; onClose: () => void }) {
  const qc = useQueryClient(); const [note, setNote] = useState(""); const [owner, setOwner] = useState("");
  const hist = useQuery({ queryKey: ["hist", i.id, i.status], queryFn: () => api<any[]>(`/issues/${i.id}/history`) });
  const users = useQuery({ queryKey: ["users-all"], queryFn: () => api<any[]>("/users?limit=200"), retry: false });
  const atts = useQuery({ queryKey: ["att", i.id], queryFn: () => api<any[]>(`/issues/${i.id}/attachments`) });
  const up = useMutation({ mutationFn: async (f: File) => sendFile(`/issues/${i.id}/attachments?filename=${encodeURIComponent(f.name)}`, await prepareFile(f)), onSuccess: () => qc.invalidateQueries({ queryKey: ["att", i.id] }) });
  const mv = useMutation({ mutationFn: (to: string) => api(`/issues/${i.id}/transition`, "POST", { to, note }), onSuccess: () => { setNote(""); qc.invalidateQueries(); } });
  const as = useMutation({ mutationFn: () => api(`/issues/${i.id}/assign`, "POST", { owner_id: owner }), onSuccess: () => qc.invalidateQueries() });
  return <Sheet title={i.ref} onClose={onClose}><div className="chips"><Chip v={i.severity} /><Chip v={i.status} /></div><h4>{i.title}</h4><p>{i.description}</p>
    <p className="mu small">Respond by {fmtDT(i.respond_by)} · Resolve by {fmtDT(i.resolve_by)}</p>{i.resolution && <p className="ok-t">Resolution: {i.resolution}</p>}
    <h4>Evidence</h4>{atts.data?.map(a => <button key={a.id} className="ghost att" onClick={() => openFile(`/attachments/${a.id}`)}>{a.filename} · {Math.max(1, Math.round(a.size / 1024))} KB</button>)}
    <label className="ghost att add">{up.isPending ? "Uploading" : "Add photo or PDF"}<input type="file" hidden accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) up.mutate(f); e.target.value = ""; }} /></label><Err e={up.error} />
    {users.data && ["REPORTED", "TRIAGED", "REOPENED"].includes(i.status) && <div className="panel"><Field l="Assign owner"><select value={owner} onChange={e => setOwner(e.target.value)}><option value="">Select</option>{users.data.filter((u: any) => u.active).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <button className="btn block" disabled={!owner} onClick={() => as.mutate()}>Assign</button><Err e={as.error} /></div>}
    {i.allowed.length > 0 && <div className="panel"><Field l="Note (required to resolve, cancel or reopen)"><input value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div className="btns">{i.allowed.map((to: string) => <button key={to} className="btn" onClick={() => mv.mutate(to)}>{label(to)}</button>)}</div><Err e={mv.error} /></div>}
    <h4>Timeline</h4>{hist.data?.map(h => <div className="tl" key={h.id}><b>{fmtDT(h.at)}</b> {h.from_status ? label(h.from_status) + " to " : "Reported as "}{label(h.to_status)}{h.note ? `: ${h.note}` : ""}</div>)}</Sheet>;
}

export default function Issues() {
  const qc = useQueryClient(); const [status, setS] = useState(""); const [q, setQ] = useState(""); const [openId, setOpen] = useState<string | null>(null); const [form, setForm] = useState(false);
  const list = useQuery({ queryKey: ["issues", status, q], queryFn: () => api(`/issues?limit=100${status ? "&status=" + status : ""}${q ? "&q=" + encodeURIComponent(q) : ""}`), ...LIVE });
  const evs = useQuery({ queryKey: ["events"], queryFn: () => api<any[]>("/events?limit=200") });
  const [f, setF] = useState({ title: "", description: "", event_id: "", severity: "MEDIUM" });
  const create = useMutation({ mutationFn: () => api("/issues", "POST", { ...f, category: "Other" }), onSuccess: () => { setForm(false); setF({ title: "", description: "", event_id: "", severity: "MEDIUM" }); qc.invalidateQueries(); } });
  const items: any[] = (list.data as any)?.items || [], open = items.find(i => i.id === openId);
  return <><h2>Issues</h2><div className="btns"><input placeholder="Search title, text or reference" value={q} onChange={e => setQ(e.target.value)} aria-label="Search" />
    <select value={status} onChange={e => setS(e.target.value)} aria-label="Status">{STATUSES.map(s => <option key={s} value={s}>{s ? label(s) : "All statuses"}</option>)}</select></div>
    {list.data && items.length === 0 && <Empty t="No issues match." />}
    {items.map(i => <button className="card issue" key={i.id} onClick={() => setOpen(i.id)}><div className="bar"><span><Chip v={i.severity} /> <b>{i.ref}</b></span><Chip v={i.status} /></div><p>{i.title}</p><small className="mu">Resolve by {fmtDT(i.resolve_by)}</small></button>)}
    <button className="fab" onClick={() => setForm(true)} aria-label="Report issue"><Icon n="plus" s={28} /></button>
    {open && <Detail i={open} onClose={() => setOpen(null)} />}
    {form && <Sheet title="Report an issue" onClose={() => setForm(false)}>
      <Field l="Event"><select value={f.event_id} onChange={e => setF({ ...f, event_id: e.target.value })}><option value="">Select</option>{evs.data?.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
      <Field l="Severity"><div className="seg">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => <button key={s} className={f.severity === s ? "on" : ""} onClick={() => setF({ ...f, severity: s })}>{label(s)}</button>)}</div></Field>
      <Field l="Title"><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field>
      <Field l="What happened"><textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field><Err e={create.error} />
      <button className="btn block" disabled={f.title.length < 3 || !f.event_id || !f.description || create.isPending} onClick={() => create.mutate()}>Submit</button></Sheet>}</>;
}
