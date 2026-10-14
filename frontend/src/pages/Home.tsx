import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../api";
import { LIVE, useMe } from "../me";
import { Chip, Empty, Err, fmtDT, Icon, label } from "../ui";

export default function Home() {
  const me = useMe();
  const s = useQuery({ queryKey: ["sum"], queryFn: () => api("/dashboard/summary"), ...LIVE });
  const o = useQuery({ queryKey: ["overdue"], queryFn: () => api<any[]>("/issues/overdue"), ...LIVE });
  const d = useQuery({ queryKey: ["duties"], queryFn: () => api<any[]>("/duties/my-duties"), ...LIVE });
  const next = d.data?.find(x => ["ASSIGNED", "ACKNOWLEDGED", "CHECKED_IN"].includes(x.status) && new Date(x.ends_at) > new Date());
  if (s.error) return <Err e={s.error} />;
  const x = s.data, sev = x?.open_issues_by_severity || {};
  const tiles: [string, any, boolean][] = x ? [["Sessions today", x.sessions_today, false], ["Duties scheduled", x.duties_scheduled, false], ["Checked in", x.duties_checked_in, false],
    ["Missing check-in", x.duties_missing_checkin, x.duties_missing_checkin > 0], ["No POC", x.sessions_without_poc, x.sessions_without_poc > 0], ["Overdue issues", x.overdue_issues, x.overdue_issues > 0]] : [];
  return <>
    <div className="hero"><small>Welcome back</small><h1>{me?.name?.split(" ")[0] ?? ""}</h1><span className="role">{me ? label(me.role) : ""}</span></div>
    {next && <Link to="/duties" className="next"><small>Your next duty</small><b>{next.event_name}</b><span>{next.stage} · {label(next.kind)} · {fmtDT(next.starts_at)}</span></Link>}
    <div className="tiles">{tiles.map(([l, v, bad]) => <div key={l} className={"tile" + (bad ? " bad" : "")}><b>{v}</b><span>{l}</span></div>)}</div>
    <h3>Open issues</h3><div className="sevrow">{["CRITICAL", "HIGH", "MEDIUM", "LOW"].map(k => <div key={k} className="sev"><Chip v={k} /><b>{sev[k] ?? 0}</b></div>)}</div>
    <h3>Needs attention</h3>
    {o.data?.length ? o.data.slice(0, 6).map(i => <Link to="/issues" className="card link-card" key={i.id}><div className="bar"><span><Chip v={i.severity} /> <b>{i.ref}</b></span><Icon n="alert" s={18} /></div><p>{i.title}</p><small className="mu">Past deadline {fmtDT(i.resolve_by)}</small></Link>) : <Empty t="Nothing is overdue." />}
    {x?.median_resolution_minutes != null && <p className="mu small">Median resolution time {x.median_resolution_minutes} min</p>}
  </>;
}
