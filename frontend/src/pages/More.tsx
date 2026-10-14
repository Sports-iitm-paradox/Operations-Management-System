import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api, setToken } from "../api";
import { ASSIGNERS, MANAGERS, useMe } from "../me";
import { Chip, Empty, Err, Field, Icon, Sheet, fmtDT } from "../ui";

export default function More() {
  const me = useMe();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [pw, setPw] = useState(false);
  const [f, setF] = useState({ current_password: "", new_password: "" });

  const n = useQuery({
    queryKey: ["notes"],
    queryFn: () => api<any[]>("/notifications"),
    refetchInterval: 15000,
  });
  const all = useMutation({
    mutationFn: () => api("/notifications/read-all", "POST"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notes"] }),
  });
  const ch = useMutation({
    mutationFn: () => api("/auth/change-password", "POST", f),
    onSuccess: () => {
      setPw(false);
      setF({ current_password: "", new_password: "" });
    },
  });

  const unread = n.data?.filter((x) => !x.read_at).length ?? 0;

  return (
    <>
      <div className="cal-title-section">
        <h1>More</h1>
        <div className="cal-title-sub">Manage events, roles, logs and your account</div>
      </div>

      {/* User Profile Card */}
      <div className="card profile" style={{ padding: "18px", marginBottom: 20 }}>
        <div className="avatar big">
          {me?.name ? me.name[0].toUpperCase() : "S"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <b style={{ fontSize: 18 }}>{me?.name}</b>
            {me?.role && <Chip v={me.role} />}
          </div>
          <span className="mu" style={{ fontSize: 13 }}>{me?.email}</span>
        </div>
      </div>

      {/* Grouped Management Menu */}
      <div className="menu">
        {MANAGERS.includes(me?.role) && (
          <Link to="/team">
            <Icon n="users" s={18} />
            <span style={{ flex: 1 }}>Team and roles</span>
            <Icon n="chevronRight" s={16} className="row-card-chevron" />
          </Link>
        )}
        {ASSIGNERS.includes(me?.role) && (
          <Link to="/events">
            <Icon n="cal" s={18} />
            <span style={{ flex: 1 }}>Events and sessions</span>
            <Icon n="chevronRight" s={16} className="row-card-chevron" />
          </Link>
        )}
        {MANAGERS.includes(me?.role) && (
          <Link to="/exports">
            <Icon n="duty" s={18} />
            <span style={{ flex: 1 }}>Exports</span>
            <Icon n="chevronRight" s={16} className="row-card-chevron" />
          </Link>
        )}
        {ASSIGNERS.includes(me?.role) && (
          <Link to="/audit">
            <Icon n="alert" s={18} />
            <span style={{ flex: 1 }}>Audit log</span>
            <Icon n="chevronRight" s={16} className="row-card-chevron" />
          </Link>
        )}
        {me?.role === "CORE" && (
          <Link to="/import">
            <Icon n="plus" s={18} />
            <span style={{ flex: 1 }}>Import workbook</span>
            <Icon n="chevronRight" s={16} className="row-card-chevron" />
          </Link>
        )}
        <button onClick={() => setPw(true)}>
          <Icon n="shield" s={18} />
          <span style={{ flex: 1 }}>Change password</span>
          <Icon n="chevronRight" s={16} className="row-card-chevron" />
        </button>
        <button
          onClick={() => {
            setToken("");
            qc.clear();
            nav("/login");
          }}
          style={{ color: "var(--bad)" }}
        >
          <Icon n="x" s={18} />
          <span style={{ flex: 1 }}>Sign out</span>
        </button>
      </div>

      {/* Notifications Section */}
      <div className="section-header">
        <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Notifications
          {unread > 0 && <span className="badge">{unread}</span>}
        </h3>
        {unread > 0 && (
          <button className="link" onClick={() => all.mutate()}>
            Mark all read
          </button>
        )}
      </div>

      {n.data?.length === 0 && <Empty t="You are all caught up." icon="check" />}
      {n.data?.map((x) => (
        <div className={`card ${x.read_at ? "read" : ""}`} key={x.id}>
          <div className="bar">
            <b>{x.title}</b>
            <small className="mu">{fmtDT(x.created_at)}</small>
          </div>
          {x.body && <p className="mu" style={{ fontSize: 13, marginTop: 4 }}>{x.body}</p>}
        </div>
      ))}

      {pw && (
        <Sheet title="Change password" onClose={() => setPw(false)}>
          <Field l="Current password">
            <input
              type="password"
              value={f.current_password}
              onChange={(e) => setF({ ...f, current_password: e.target.value })}
              autoComplete="current-password"
            />
          </Field>
          <Field l="New password (min 12 characters)">
            <input
              type="password"
              value={f.new_password}
              onChange={(e) => setF({ ...f, new_password: e.target.value })}
              autoComplete="new-password"
            />
          </Field>
          <Err e={ch.error} />
          <button
            className="btn block"
            disabled={f.new_password.length < 12}
            onClick={() => ch.mutate()}
          >
            Update password
          </button>
        </Sheet>
      )}
    </>
  );
}