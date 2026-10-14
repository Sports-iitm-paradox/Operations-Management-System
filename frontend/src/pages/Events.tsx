import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { Chip, Empty, Err, Field, Icon, Sheet, fmtDT, label, toIso } from "../ui";

const NEXT: Record<string, string> = {
  DRAFT: "PUBLISHED",
  PUBLISHED: "ACTIVE",
  ACTIVE: "COMPLETED",
  COMPLETED: "ARCHIVED",
};

function Detail({ e, onClose }: { e: any; onClose: () => void }) {
  const qc = useQueryClient();
  const ss = useQuery({
    queryKey: ["sessions", e.id],
    queryFn: () => api<any[]>(`/events/${e.id}/sessions`),
  });
  const [s, setS] = useState({ stage: "", starts: "", ends: "" });
  const [links, setL] = useState({
    meet_url: e.meet_url || "",
    stream_url: e.stream_url || "",
  });
  const add = useMutation({
    mutationFn: () =>
      api(`/events/${e.id}/sessions`, "POST", {
        stage: s.stage,
        starts_at: toIso(s.starts),
        ends_at: toIso(s.ends),
      }),
    onSuccess: () => {
      setS({ stage: "", starts: "", ends: "" });
      qc.invalidateQueries();
    },
  });
  const tr = useMutation({
    mutationFn: () =>
      api(`/events/${e.id}/transition`, "POST", { to: NEXT[e.status] }),
    onSuccess: () => qc.invalidateQueries(),
  });
  const sv = useMutation({
    mutationFn: () =>
      api(`/events/${e.id}`, "PATCH", {
        meet_url: links.meet_url || null,
        stream_url: links.stream_url || null,
      }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <Sheet title={e.name} onClose={onClose}>
      <div className="chips" style={{ marginBottom: 12 }}>
        <Chip v={e.status} />
        <span className="mini">{e.code}</span>
      </div>
      {NEXT[e.status] && (
        <>
          <Err e={tr.error} />
          <button className="btn block" onClick={() => tr.mutate()}>
            Move to {label(NEXT[e.status])}
          </button>
        </>
      )}
      <h4>Sessions</h4>
      {ss.data?.length === 0 && <Empty t="No sessions yet." />}
      {ss.data?.map((x) => (
        <div className="staff" key={x.id}>
          <b>{x.stage}</b>
          <span className="mu">
            {" "}
            {fmtDT(x.starts_at)} to {fmtDT(x.ends_at)}
          </span>
        </div>
      ))}
      <div className="panel">
        <b>Add a session</b>
        <Field l="Stage or round">
          <input
            value={s.stage}
            onChange={(x) => setS({ ...s, stage: x.target.value })}
            placeholder="e.g. Round 1 or Final"
          />
        </Field>
        <Field l="Starts">
          <input
            type="datetime-local"
            value={s.starts}
            onChange={(x) => setS({ ...s, starts: x.target.value })}
          />
        </Field>
        <Field l="Ends">
          <input
            type="datetime-local"
            value={s.ends}
            onChange={(x) => setS({ ...s, ends: x.target.value })}
          />
        </Field>
        <Err e={add.error} />
        <button
          className="btn block"
          disabled={!s.stage || !s.starts || !s.ends}
          onClick={() => add.mutate()}
        >
          Add session
        </button>
      </div>
      <div className="panel">
        <b>Links</b>
        <Field l="Meeting link">
          <input
            value={links.meet_url}
            onChange={(x) => setL({ ...links, meet_url: x.target.value })}
            inputMode="url"
            placeholder="https://meet.google.com/..."
          />
        </Field>
        <Field l="Livestream link">
          <input
            value={links.stream_url}
            onChange={(x) => setL({ ...links, stream_url: x.target.value })}
            inputMode="url"
            placeholder="https://youtube.com/..."
          />
        </Field>
        <Err e={sv.error} />
        <button className="btn block" onClick={() => sv.mutate()}>
          Save links
        </button>
      </div>
    </Sheet>
  );
}

export default function Events() {
  const qc = useQueryClient();
  const [openId, setOpen] = useState<string | null>(null);
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ code: "", name: "", department: "" });
  const q = useQuery({
    queryKey: ["events"],
    queryFn: () => api<any[]>("/events?limit=200"),
  });
  const create = useMutation({
    mutationFn: () =>
      api("/events", "POST", { ...f, department: f.department || null }),
    onSuccess: () => {
      setAdd(false);
      setF({ code: "", name: "", department: "" });
      qc.invalidateQueries();
    },
  });
  const open = q.data?.find((e) => e.id === openId);

  return (
    <>
      <div className="section-header" style={{ margin: "4px 0 14px" }}>
        <div>
          <h1>Events</h1>
          <div className="cal-title-sub">Configure tournaments, rounds and streaming links</div>
        </div>
        <button className="btn" onClick={() => setAdd(true)}>
          <Icon n="plus" s={18} /> New event
        </button>
      </div>

      {q.data?.length === 0 && (
        <Empty t="No events yet. Create the first one." icon="cal" />
      )}

      {q.data?.map((e) => (
        <button
          className="card"
          key={e.id}
          onClick={() => setOpen(e.id)}
          style={{ padding: "16px" }}
        >
          <div className="bar" style={{ marginBottom: 4 }}>
            <b style={{ fontSize: 16 }}>{e.name}</b>
            <Chip v={e.status} />
          </div>
          <small className="mu">
            {e.code}
            {e.department ? " · " + e.department : ""}
          </small>
        </button>
      ))}

      {open && <Detail e={open} onClose={() => setOpen(null)} />}

      {add && (
        <Sheet title="New event" onClose={() => setAdd(false)}>
          <Field l="Event code">
            <input
              value={f.code}
              onChange={(e) => setF({ ...f, code: e.target.value })}
              placeholder="e.g. CRIC-01"
            />
          </Field>
          <Field l="Event name">
            <input
              value={f.name}
              onChange={(e) => setF({ ...f, name: e.target.value })}
              placeholder="e.g. Cricket Championship"
            />
          </Field>
          <Field l="Department">
            <input
              value={f.department}
              onChange={(e) => setF({ ...f, department: e.target.value })}
              placeholder="e.g. Sports or Esports"
            />
          </Field>
          <Err e={create.error} />
          <button
            className="btn block"
            disabled={!f.code || !f.name}
            onClick={() => create.mutate()}
          >
            Create event
          </button>
        </Sheet>
      )}
    </>
  );
}