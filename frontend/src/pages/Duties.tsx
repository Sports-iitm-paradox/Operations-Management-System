import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { LIVE } from "../me";
import { Chip, Empty, Err, fmtDT } from "../ui";

export default function Duties() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ["duties"], queryFn: () => api<any[]>("/duties/my-duties"), ...LIVE });
  const act = useMutation({ mutationFn: (p: string) => api(p, "POST"), onSuccess: () => qc.invalidateQueries() });
  const live = (q.data || []).filter(d => !["COMPLETED", "CANCELLED"].includes(d.status)), past = (q.data || []).filter(d => ["COMPLETED", "CANCELLED"].includes(d.status));
  const card = (d: any) => <div className="card" key={d.id}><div className="bar"><b>{d.event_name}</b><Chip v={d.status} /></div><p className="mu">{d.stage}</p>
    <div className="chips"><Chip v={d.kind} /><span className="mini">{fmtDT(d.starts_at)}</span></div>{d.late_minutes > 0 && <p className="err">Checked in {d.late_minutes} min late</p>}
    <div className="btns">{d.status === "ASSIGNED" && <button className="btn" onClick={() => act.mutate(`/duties/${d.id}/acknowledge`)}>Acknowledge</button>}
      {["ASSIGNED", "ACKNOWLEDGED"].includes(d.status) && <button className="btn ok" onClick={() => act.mutate(`/duties/${d.id}/check-in`)}>Check in</button>}
      {d.status === "CHECKED_IN" && <button className="btn" onClick={() => act.mutate(`/duties/${d.id}/check-out`)}>Check out</button>}
      {d.meet_url && <a className="ghost" href={d.meet_url} target="_blank" rel="noreferrer">Meeting</a>}</div></div>;
  return <><h2>My duties</h2><Err e={act.error} />{q.data && live.length === 0 && <Empty t="No upcoming duties." />}{live.map(card)}
    {past.length > 0 && <><h3>History</h3>{past.map(card)}</>}</>;
}
