import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { ASSIGNERS, MANAGERS, useMe } from "../me";
import { Empty, Err, Field, Icon, Sheet, fmtDT, label } from "../ui";

export default function More() {
  const me = useMe(); const nav = useNavigate(); const qc = useQueryClient(); const [pw, setPw] = useState(false); const [f, setF] = useState({ current_password: "", new_password: "" });
  const n = useQuery({ queryKey: ["notes"], queryFn: () => api<any[]>("/notifications"), refetchInterval: 15000 });
  const all = useMutation({ mutationFn: () => api("/notifications/read-all", "POST"), onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }) });
  const ch = useMutation({ mutationFn: () => api("/auth/change-password", "POST", f), onSuccess: () => { setPw(false); setF({ current_password: "", new_password: "" }); } });
  const unread = n.data?.filter(x => !x.read_at).length ?? 0;
  return <><h2>More</h2><div className="card profile"><div className="avatar big">{me?.name?.[0]}</div><div><b>{me?.name}</b><span className="mu">{me?.email}</span><span className="mu">{me ? label(me.role) : ""}</span></div></div>
    <div className="menu">{MANAGERS.includes(me?.role) && <Link to="/team"><Icon n="users" /> Team and roles</Link>}{ASSIGNERS.includes(me?.role) && <Link to="/events"><Icon n="cal" /> Events and sessions</Link>}
      {MANAGERS.includes(me?.role) && <Link to="/exports"><Icon n="duty" /> Exports</Link>}{ASSIGNERS.includes(me?.role) && <Link to="/audit"><Icon n="alert" /> Audit log</Link>}{me?.role === "CORE" && <Link to="/import"><Icon n="plus" /> Import workbook</Link>}
      <button onClick={() => setPw(true)}><Icon n="menu" /> Change password</button><button onClick={() => { setToken(""); qc.clear(); nav("/login"); }}><Icon n="x" /> Sign out</button></div>
    <div className="bar"><h3>Notifications {unread > 0 && <span className="badge">{unread}</span>}</h3>{unread > 0 && <button className="link" onClick={() => all.mutate()}>Mark all read</button>}</div>
    {n.data?.length === 0 && <Empty t="You are all caught up." />}{n.data?.map(x => <div className={"card" + (x.read_at ? " read" : "")} key={x.id}><b>{x.title}</b>{x.body && <p className="mu">{x.body}</p>}<small className="mu">{fmtDT(x.created_at)}</small></div>)}
    {pw && <Sheet title="Change password" onClose={() => setPw(false)}><Field l="Current password"><input type="password" value={f.current_password} onChange={e => setF({ ...f, current_password: e.target.value })} autoComplete="current-password" /></Field>
      <Field l="New password (min 12 characters)"><input type="password" value={f.new_password} onChange={e => setF({ ...f, new_password: e.target.value })} autoComplete="new-password" /></Field><Err e={ch.error} />
      <button className="btn block" disabled={f.new_password.length < 12} onClick={() => ch.mutate()}>Update password</button></Sheet>}</>;
}
