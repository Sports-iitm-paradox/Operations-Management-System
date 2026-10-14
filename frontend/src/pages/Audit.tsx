import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import { Empty, Err, fmtDT } from "../ui";

const PAGE = 30;

export default function Audit() {
  const [action, setA] = useState("");
  const [entity, setE] = useState("");
  const [off, setOff] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const q = useQuery({
    queryKey: ["audit", action, entity, off],
    queryFn: () =>
      api(
        `/audit-logs?limit=${PAGE}&offset=${off}${
          action ? "&action=" + encodeURIComponent(action) : ""
        }${entity ? "&entity=" + entity : ""}`
      ),
    placeholderData: (p) => p,
  });
  const d: any = q.data;

  return (
    <>
      <div className="cal-title-section">
        <h1>Audit log</h1>
        <div className="cal-title-sub">Immutable trail of duties, overrides and system actions</div>
      </div>

      <div className="btns" style={{ marginBottom: 14 }}>
        <input
          placeholder="Filter action, e.g. duty or user.role..."
          value={action}
          onChange={(e) => {
            setA(e.target.value);
            setOff(0);
          }}
          aria-label="Action filter"
        />
        <select
          value={entity}
          onChange={(e) => {
            setE(e.target.value);
            setOff(0);
          }}
          aria-label="Entity"
        >
          <option value="">All records</option>
          {[
            "user",
            "event",
            "session",
            "duty",
            "issue",
            "escalation",
            "export",
            "import",
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </div>

      <Err e={q.error} />
      {d && d.items.length === 0 && <Empty t="No entries match." icon="file" />}

      {d?.items.map((a: any) => (
        <button
          className="card"
          key={a.id}
          onClick={() => setOpen(open === a.id ? null : a.id)}
          style={{ padding: "14px 16px" }}
        >
          <div className="bar">
            <b style={{ color: "var(--ac-text)", fontSize: 14 }}>{a.action}</b>
            <small className="mu">{fmtDT(a.at)}</small>
          </div>
          <small className="mu" style={{ display: "block", marginTop: 4 }}>
            {a.actor_name} · {a.entity}
            {a.entity_id ? " #" + String(a.entity_id).slice(0, 8) : ""}
          </small>
          {a.reason && <p style={{ fontSize: 13, marginTop: 4 }}>Reason: {a.reason}</p>}
          {open === a.id && (
            <pre className="json">
              {JSON.stringify({ before: a.before, after: a.after }, null, 2)}
            </pre>
          )}
        </button>
      ))}

      {d && d.total > 0 && (
        <div className="bar" style={{ marginTop: 16 }}>
          <button
            className="ghost"
            disabled={off === 0}
            onClick={() => setOff(Math.max(0, off - PAGE))}
          >
            Newer
          </button>
          <small className="mu">
            {off + 1} to {Math.min(off + PAGE, d.total)} of {d.total}
          </small>
          <button
            className="ghost"
            disabled={off + PAGE >= d.total}
            onClick={() => setOff(off + PAGE)}
          >
            Older
          </button>
        </div>
      )}
    </>
  );
}