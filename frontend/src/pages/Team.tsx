import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { ASSIGNERS, useMe } from "../me";
import { Chip, Empty, Err, Field, Icon, Sheet, label } from "../ui";

const ROLES = ["CORE", "DEPUTY_CORE", "SUPER_COORDINATOR", "COORDINATOR", "VOLUNTEER"];

function Member({ u, w, users, onClose }: { u: any; w?: any; users: any[]; onClose: () => void }) {
  const me = useMe();
  const qc = useQueryClient();
  const isCore = me.role === "CORE",
    self = me.id === u.id;
  const [f, setF] = useState({
    name: u.name,
    email: u.email,
    phone: u.phone || "",
    reports_to_id: u.reports_to_id || "",
  });
  const [pw, setPw] = useState("");
  const [role, setRole] = useState(u.role);
  const ok = { onSuccess: () => qc.invalidateQueries() };
  const save = useMutation({
    mutationFn: () =>
      api(`/users/${u.id}`, "PATCH", {
        ...f,
        phone: f.phone || null,
        reports_to_id: f.reports_to_id || null,
      }),
    ...ok,
  });
  const rl = useMutation({
    mutationFn: () => api(`/users/${u.id}/roles`, "POST", { role }),
    ...ok,
  });
  const rp = useMutation({
    mutationFn: () => api(`/users/${u.id}/reset-password`, "POST", { password: pw }),
    onSuccess: () => {
      setPw("");
      qc.invalidateQueries();
    },
  });
  const tg = useMutation({
    mutationFn: () => api(`/users/${u.id}/${u.active ? "deactivate" : "activate"}`, "POST"),
    ...ok,
  });
  const evs = useQuery({
    queryKey: ["events"],
    queryFn: () => api<any[]>("/events?limit=200"),
    enabled: ASSIGNERS.includes(me.role),
  });
  const sc = useQuery({
    queryKey: ["scopes", u.id],
    queryFn: () => api<any>(`/users/${u.id}/scopes`),
    enabled: ASSIGNERS.includes(me.role) && ["COORDINATOR", "SUPER_COORDINATOR"].includes(u.role),
  });
  const setSc = useMutation({
    mutationFn: (ids: string[]) => api(`/users/${u.id}/scopes`, "PUT", ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["scopes", u.id] }),
  });

  return (
    <Sheet title={u.name} onClose={onClose}>
      <div className="chips" style={{ marginBottom: 10 }}>
        <Chip v={u.role} />
        <span className="mini">{u.active ? "Active" : "Cannot sign in"}</span>
      </div>
      {w && (
        <p className="mu" style={{ fontSize: 13, margin: "4px 0 12px" }}>
          {w.POC} POC · {w.BACKUP} backup · {w.COORDINATOR} coordinator · {w.hours} h planned
        </p>
      )}
      <Field l="Name">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field l="Email (used to sign in)">
        <input
          value={f.email}
          onChange={(e) => setF({ ...f, email: e.target.value })}
          inputMode="email"
        />
      </Field>
      <Field l="Phone">
        <input
          value={f.phone}
          onChange={(e) => setF({ ...f, phone: e.target.value })}
          inputMode="tel"
        />
      </Field>
      <Field l="Reports to">
        <select
          value={f.reports_to_id}
          onChange={(e) => setF({ ...f, reports_to_id: e.target.value })}
        >
          <option value="">Nobody</option>
          {users
            .filter((x) => x.id !== u.id)
            .map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
        </select>
      </Field>
      <Err e={save.error} />
      <button className="btn block" disabled={self} onClick={() => save.mutate()}>
        Save details
      </button>

      {isCore && !self && (
        <div className="panel">
          <Field l="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </Field>
          <Err e={rl.error} />
          <button className="btn block" disabled={role === u.role} onClick={() => rl.mutate()}>
            Change role
          </button>
        </div>
      )}

      {sc.data && (
        <div className="panel">
          <b>Events this person can manage</b>
          {evs.data?.length === 0 && <p className="mu">Create events first.</p>}
          {evs.data?.map((e) => {
            const on = sc.data.event_ids.includes(e.id);
            return (
              <label key={e.id} className="check">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setSc.mutate(
                      on
                        ? sc.data.event_ids.filter((x: string) => x !== e.id)
                        : [...sc.data.event_ids, e.id]
                    )
                  }
                />
                {e.name}
              </label>
            );
          })}
          <Err e={setSc.error} />
        </div>
      )}

      {!self && (
        <div className="panel">
          <Field
            l={
              u.email.endsWith("@import.invalid")
                ? "Set a password so they can sign in"
                : "Set a new password (min 12 characters)"
            }
          >
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
            />
          </Field>
          <Err e={rp.error} />
          <button
            className="btn block"
            disabled={pw.length < 12}
            onClick={() => rp.mutate()}
          >
            Set password and activate
          </button>
        </div>
      )}

      {!self && (
        <div style={{ marginTop: 12 }}>
          <Err e={tg.error} />
          <button
            className={"btn block " + (u.active ? "danger" : "ok")}
            onClick={() => tg.mutate()}
          >
            {u.active ? "Deactivate account" : "Activate account"}
          </button>
        </div>
      )}
    </Sheet>
  );
}

export default function Team() {
  const me = useMe();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openId, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState(false);

  const users = useQuery({
    queryKey: ["users-all"],
    queryFn: () => api<any[]>("/users?limit=200"),
  });
  const wl = useQuery({
    queryKey: ["workload"],
    queryFn: () => api<any[]>("/reports/workload"),
  });
  const blank = {
    name: "",
    email: "",
    phone: "",
    role: "VOLUNTEER",
    password: "",
    reports_to_id: "",
  };
  const [f, setF] = useState(blank);
  const create = useMutation({
    mutationFn: () =>
      api("/users", "POST", {
        ...f,
        phone: f.phone || null,
        reports_to_id: f.reports_to_id || null,
      }),
    onSuccess: () => {
      setAdd(false);
      setF(blank);
      qc.invalidateQueries();
    },
  });

  const list = (users.data || []).filter((u) =>
    (u.name + u.email).toLowerCase().includes(q.toLowerCase())
  );
  const open = users.data?.find((u) => u.id === openId);
  const canAdd = ASSIGNERS.includes(me?.role);
  const W = (id: string) => wl.data?.find((x) => x.user_id === id);
  const roles = ROLES.filter(
    (r) => me?.role === "CORE" || ROLES.indexOf(r) > ROLES.indexOf(me?.role)
  );

  return (
    <>
      <div className="section-header" style={{ margin: "4px 0 14px" }}>
        <div>
          <h1>Team</h1>
          <div className="cal-title-sub">Manage volunteers, coordinators and permissions</div>
        </div>
        {canAdd && (
          <button className="btn" onClick={() => setAdd(true)}>
            <Icon n="plus" s={18} /> Add member
          </button>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          placeholder="Search by name or email..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search members"
        />
      </div>
      <Err e={users.error} />

      {users.data && list.length === 0 && <Empty t="No members found." />}

      {list.map((u) => {
        const w = W(u.id);
        return (
          <button
            className="card member"
            key={u.id}
            onClick={() => setOpen(u.id)}
            style={{ padding: "14px 16px" }}
          >
            <div className="avatar">{u.name[0]?.toUpperCase()}</div>
            <div className="grow">
              <b style={{ fontSize: 15 }}>{u.name}</b>
              <span className="mu" style={{ fontSize: 12.5 }}>
                {u.email.endsWith("@import.invalid") ? "No login yet" : u.email}
              </span>
            </div>
            <div className="right">
              <Chip v={u.role} />
              {w && <small className="mu">{w.hours} h</small>}
            </div>
          </button>
        );
      })}

      {open && (
        <Member
          u={open}
          w={W(open.id)}
          users={users.data || []}
          onClose={() => setOpen(null)}
        />
      )}

      {add && (
        <Sheet title="Add member" onClose={() => setAdd(false)}>
          <Field l="Full name">
            <input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="e.g. Volunteer One"
            />
          </Field>
          <Field l="Email (used to sign in)">
            <input
              value={f.email}
              inputMode="email"
              autoCapitalize="none"
              onChange={(e) => setF({ ...f, email: e.target.value })}
              placeholder="user@example.com"
            />
          </Field>
          <Field l="Phone">
            <input
              value={f.phone}
              inputMode="tel"
              onChange={(e) => setF({ ...f, phone: e.target.value })}
              placeholder="+91 ..."
            />
          </Field>
          <Field l="Role">
            <select
              value={f.role}
              onChange={(e) => setF({ ...f, role: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {label(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field l="Reports to">
            <select
              value={f.reports_to_id}
              onChange={(e) => setF({ ...f, reports_to_id: e.target.value })}
            >
              <option value="">Nobody</option>
              {users.data?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </Field>
          <Field l="Starting password (min 12 characters)">
            <input
              type="text"
              value={f.password}
              onChange={(e) => setF({ ...f, password: e.target.value })}
              autoComplete="off"
              placeholder="Secure password"
            />
          </Field>
          <Err e={create.error} />
          <button
            className="btn block"
            disabled={
              !f.name || !f.email || f.password.length < 12 || create.isPending
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Creating..." : "Create account"}
          </button>
        </Sheet>
      )}
    </>
  );
}