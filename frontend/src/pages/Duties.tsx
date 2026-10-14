import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { LIVE } from "../me";
import { Chip, Empty, Err, fmtDT, Icon, label } from "../ui";

export default function Duties() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const q = useQuery({
    queryKey: ["duties"],
    queryFn: () => api<any[]>("/duties/my-duties"),
    ...LIVE,
  });
  const act = useMutation({
    mutationFn: (p: string) => api(p, "POST"),
    onSuccess: () => qc.invalidateQueries(),
  });

  const live = (q.data || []).filter(
    (d) => !["COMPLETED", "CANCELLED"].includes(d.status)
  );
  const past = (q.data || []).filter((d) =>
    ["COMPLETED", "CANCELLED"].includes(d.status)
  );

  const card = (d: any) => (
    <div className="card" key={d.id} style={{ padding: "18px" }}>
      <div className="bar" style={{ marginBottom: 4 }}>
        <b style={{ fontSize: 16 }}>{d.event_name}</b>
        <Chip v={d.status} />
      </div>
      <p className="mu" style={{ fontSize: 13, margin: "2px 0 10px" }}>
        {d.stage}
      </p>

      <div className="chips" style={{ margin: "8px 0 14px" }}>
        <Chip v={d.kind} />
        <span className="mini">
          <Icon n="cal" s={13} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />
          {fmtDT(d.starts_at)}
        </span>
      </div>

      {d.late_minutes > 0 && (
        <p className="err" style={{ fontSize: 12 }}>
          Checked in {d.late_minutes} min late
        </p>
      )}

      <div className="btns" style={{ marginTop: 12 }}>
        {d.status === "ASSIGNED" && (
          <button
            className="btn"
            disabled={act.isPending}
            onClick={() => act.mutate(`/duties/${d.id}/acknowledge`)}
          >
            Acknowledge
          </button>
        )}
        {["ASSIGNED", "ACKNOWLEDGED"].includes(d.status) && (
          <button
            className="btn ok"
            disabled={act.isPending}
            onClick={() => act.mutate(`/duties/${d.id}/check-in`)}
          >
            Check in
          </button>
        )}
        {d.status === "CHECKED_IN" && (
          <button
            className="btn"
            disabled={act.isPending}
            onClick={() => act.mutate(`/duties/${d.id}/check-out`)}
          >
            Check out
          </button>
        )}
        {d.meet_url && (
          <a
            className="ghost"
            href={d.meet_url}
            target="_blank"
            rel="noreferrer"
            style={{ gap: 6 }}
          >
            Meeting
          </a>
        )}
      </div>
    </div>
  );

  return (
    <>
      <div className="cal-title-section">
        <h1>My duties</h1>
        <div className="cal-title-sub">Track and complete your event duties</div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          background: "var(--bg-subtle)",
          padding: 4,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <button
          className={tab === "upcoming" ? "btn" : "ghost"}
          style={{
            flex: 1,
            minHeight: 36,
            padding: "6px 12px",
            fontSize: 13,
            border: 0,
            background: tab === "upcoming" ? "var(--card)" : "transparent",
            color: tab === "upcoming" ? "var(--fg)" : "var(--mu)",
            boxShadow: tab === "upcoming" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}
          onClick={() => setTab("upcoming")}
        >
          Upcoming ({live.length})
        </button>
        <button
          className={tab === "history" ? "btn" : "ghost"}
          style={{
            flex: 1,
            minHeight: 36,
            padding: "6px 12px",
            fontSize: 13,
            border: 0,
            background: tab === "history" ? "var(--card)" : "transparent",
            color: tab === "history" ? "var(--fg)" : "var(--mu)",
            boxShadow: tab === "history" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
          }}
          onClick={() => setTab("history")}
        >
          History ({past.length})
        </button>
      </div>

      <Err e={act.error} />

      {tab === "upcoming" && (
        <>
          {live.length === 0 ? <Empty t="No upcoming duties." /> : live.map(card)}
        </>
      )}

      {tab === "history" && (
        <>
          {past.length === 0 ? <Empty t="No past duty history." /> : past.map(card)}
        </>
      )}
    </>
  );
}