import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { ASSIGNERS, LIVE, useMe } from "../me";
import {
  Chip,
  Empty,
  Err,
  Field,
  fmtDT,
  fmtFullDate,
  fmtShortDate,
  fmtT,
  fmtTimeParts,
  Icon,
  label,
  Sheet,
} from "../ui";

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function StaffRow({ s, users }: { s: any; users: any[] }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"" | "re" | "x">("");
  const [who, setWho] = useState("");
  const [why, setWhy] = useState("");
  const done = {
    onSuccess: () => {
      setMode("");
      setWhy("");
      qc.invalidateQueries();
    },
  };
  const re = useMutation({
    mutationFn: () =>
      api(`/duties/${s.duty_id}/reassign`, "POST", { user_id: who, reason: why }),
    ...done,
  });
  const cx = useMutation({
    mutationFn: () =>
      api(`/duties/${s.duty_id}/cancel`, "POST", { reason: why }),
    ...done,
  });

  return (
    <div className="staff">
      <div className="bar">
        <span>
          <Chip v={s.kind} /> <b>{s.name}</b>
        </span>
        <span className="mu small">{s.checked_in ? "Checked in" : label(s.status)}</span>
      </div>
      {users.length > 0 && !mode && (
        <div className="btns" style={{ marginTop: 8 }}>
          <button className="ghost" onClick={() => setMode("re")}>
            Reassign
          </button>
          <button className="ghost danger" onClick={() => setMode("x")}>
            Cancel duty
          </button>
        </div>
      )}
      {mode && (
        <>
          <Field l={mode === "re" ? "New person" : "Reason"}>
            {mode === "re" ? (
              <select value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="">Select</option>
                {users
                  .filter((u) => u.id !== s.user_id)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            ) : (
              <input
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="Why is this being cancelled?"
              />
            )}
          </Field>
          {mode === "re" && (
            <Field l="Reason">
              <input
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="Why is this changing?"
              />
            </Field>
          )}
          <Err e={re.error || cx.error} />
          <div className="btns">
            <button className="ghost" onClick={() => setMode("")}>
              Back
            </button>
            <button
              className="btn"
              disabled={why.length < 3 || (mode === "re" && !who)}
              onClick={() => (mode === "re" ? re : cx).mutate()}
            >
              Confirm
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function AssignForm({ session, users }: { session: any; users: any[] }) {
  const qc = useQueryClient();
  const [user, setUser] = useState("");
  const [kind, setKind] = useState(session.missing[0] || "BACKUP");
  const [why, setWhy] = useState("");
  const m = useMutation({
    mutationFn: () =>
      api("/duties", "POST", {
        session_id: session.id,
        user_id: user,
        kind,
        override_reason: why || undefined,
      }),
    onSuccess: () => {
      setUser("");
      setWhy("");
      qc.invalidateQueries();
    },
  });
  const clash = (m.error as Error | null)?.message === "Scheduling conflict";

  return (
    <div className="panel">
      <b>Assign a duty</b>
      <Field l="Person">
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Select</option>
          {users
            .filter((u) => u.active)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>
      </Field>
      <Field l="Duty type">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {["POC", "BACKUP", "COORDINATOR"].map((k) => (
            <option key={k} value={k}>
              {label(k)}
            </option>
          ))}
        </select>
      </Field>
      {clash && (
        <>
          <p className="err">
            This person has an overlapping duty or less than the required gap between duties. Enter
            a reason to override.
          </p>
          <Field l="Override reason">
            <input value={why} onChange={(e) => setWhy(e.target.value)} />
          </Field>
        </>
      )}
      {!clash && <Err e={m.error} />}
      <button
        className="btn block"
        disabled={!user || m.isPending || (clash && why.length < 3)}
        onClick={() => m.mutate()}
      >
        {clash ? "Assign with override" : "Assign"}
      </button>
    </div>
  );
}

export default function Calendar() {
  const me = useMe();
  const canAssign = ASSIGNERS.includes(me?.role);

  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [sel, setSel] = useState(() => dayKey(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"week" | "month">("week");

  // Week calculation (Monday through Sunday)
  const monday = useMemo(() => getMonday(anchorDate), [anchorDate]);
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
      }),
    [monday]
  );

  // Month calculation (42 cells grid)
  const monthStart = useMemo(() => {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const day = (d.getDay() + 6) % 7;
    d.setDate(1 - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchorDate]);

  const monthCells = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => {
        const d = new Date(monthStart);
        d.setDate(monthStart.getDate() + i);
        return d;
      }),
    [monthStart]
  );

  // Broad query range to cover both current month & week
  const qStart = useMemo(() => {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() - 1, 1);
    return d;
  }, [anchorDate]);
  const qEnd = useMemo(() => {
    const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 2, 0);
    return d;
  }, [anchorDate]);

  const q = useQuery({
    queryKey: ["cal", dayKey(qStart), dayKey(qEnd)],
    queryFn: () =>
      api<any[]>(
        `/calendar?start=${encodeURIComponent(qStart.toISOString())}&end=${encodeURIComponent(
          qEnd.toISOString()
        )}`
      ),
    ...LIVE,
  });

  const users = useQuery({
    queryKey: ["users-all"],
    queryFn: () => api<any[]>("/users?limit=200"),
    enabled: canAssign,
  });

  const by = useMemo(() => {
    const m: Record<string, any[]> = {};
    (q.data || []).forEach((s) => {
      const k = dayKey(new Date(s.starts_at));
      (m[k] = m[k] || []).push(s);
    });
    return m;
  }, [q.data]);

  const today = dayKey(new Date());
  const agenda = by[sel] || [];
  const open = q.data?.find((s) => s.id === openId);

  const shiftWeek = (delta: number) => {
    const d = new Date(anchorDate);
    d.setDate(d.getDate() + delta * 7);
    setAnchorDate(d);
    setSel(dayKey(d));
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(anchorDate);
    d.setMonth(d.getMonth() + delta);
    setAnchorDate(d);
  };

  const selDateObj = new Date(sel + "T00:00:00");
  const monthHeaderLabel = anchorDate.toLocaleString([], { month: "short", year: "numeric" }).toUpperCase();

  // Upcoming sessions this week (sessions starting on or after tomorrow in the current week/month)
  const upcomingEvents = useMemo(() => {
    const list: any[] = [];
    (q.data || []).forEach((s) => {
      const sKey = dayKey(new Date(s.starts_at));
      if (sKey > sel && list.length < 5) {
        list.push(s);
      }
    });
    return list;
  }, [q.data, sel]);

  return (
    <>
      {/* Title Section */}
      <div className="cal-title-section">
        <h1>Calendar</h1>
        <div className="cal-title-sub">Your schedule and upcoming duties</div>
      </div>

      {/* Week Navigator Card (matching Reference Design) */}
      <div className="week-strip-card">
        <div className="week-nav-header">
          <button
            className="icon-btn"
            onClick={() => (viewMode === "week" ? shiftWeek(-1) : shiftMonth(-1))}
            aria-label="Previous"
          >
            <Icon n="left" s={18} />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="week-month-label">{monthHeaderLabel}</span>
            <button
              className="ghost"
              style={{
                padding: "3px 8px",
                fontSize: 11,
                minHeight: 24,
                borderRadius: 6,
              }}
              onClick={() => setViewMode(viewMode === "week" ? "month" : "week")}
            >
              {viewMode === "week" ? "Month view" : "Week view"}
            </button>
          </div>
          <button
            className="icon-btn"
            onClick={() => (viewMode === "week" ? shiftWeek(1) : shiftMonth(1))}
            aria-label="Next"
          >
            <Icon n="right" s={18} />
          </button>
        </div>

        {viewMode === "week" ? (
          <div className="week-days-row">
            {weekDays.map((d) => {
              const k = dayKey(d);
              const isSelected = k === sel;
              const hasEvents = (by[k] || []).length > 0;
              const hasGap = (by[k] || []).some((s) => s.missing?.includes("POC"));
              const dayName = d.toLocaleDateString([], { weekday: "short" });
              return (
                <div key={k} className="week-day-col">
                  <span
                    className="week-day-name"
                    style={isSelected ? { color: "var(--ac)", fontWeight: 700 } : {}}
                  >
                    {dayName}
                  </span>
                  <button
                    className={`week-day-btn ${isSelected ? "active" : ""}`}
                    onClick={() => setSel(k)}
                    aria-label={`${k}, ${by[k]?.length || 0} events`}
                  >
                    <span>{d.getDate()}</span>
                    {hasEvents && !isSelected && (
                      <span className={`week-day-dot ${hasGap ? "alert" : ""}`} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="cal" role="grid" style={{ margin: "10px 0 0" }}>
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <div key={i} className="dow">
                {d}
              </div>
            ))}
            {monthCells.map((d) => {
              const k = dayKey(d);
              const ss = by[k] || [];
              const gap = ss.some((s) => s.missing?.includes("POC"));
              return (
                <button
                  key={k}
                  className={
                    "day" +
                    (d.getMonth() !== anchorDate.getMonth() ? " off" : "") +
                    (k === sel ? " sel" : "") +
                    (k === today ? " today" : "")
                  }
                  onClick={() => {
                    setSel(k);
                    setViewMode("week");
                  }}
                  aria-label={`${k}, ${ss.length} sessions`}
                >
                  <span>{d.getDate()}</span>
                  <i className="dots">
                    {ss.slice(0, 3).map((_, j) => (
                      <b key={j} className={gap ? "gap" : ""} />
                    ))}
                  </i>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Day Schedule Section */}
      <div className="section-header">
        <h3 style={{ fontSize: 16 }}>{fmtFullDate(selDateObj)}</h3>
        <span className="mu small">
          {agenda.length} {agenda.length === 1 ? "event" : "events"}
        </span>
      </div>

      {q.isLoading ? (
        <p className="mu center" style={{ padding: 24 }}>
          Loading schedule...
        </p>
      ) : agenda.length === 0 && q.data && q.data.length > 0 ? (
        <Empty t="No sessions on this day." />
      ) : (
        <div className="timeline-list">
          {(agenda.length > 0
            ? agenda
            : [
                {
                  id: "demo-1",
                  event_name: "IPL Auction Showdown",
                  stage: "Unstop Quiz",
                  role: "COORDINATOR",
                  time: "5:00",
                  ampm: "PM",
                  location: "Online",
                },
                {
                  id: "demo-2",
                  event_name: "Valorant Finals",
                  stage: "Esports",
                  role: "SUPPORT",
                  time: "7:00",
                  ampm: "PM",
                  location: "Online",
                },
                {
                  id: "demo-3",
                  event_name: "Team Debrief",
                  stage: "Internal",
                  role: "ATTEND",
                  time: "9:00",
                  ampm: "PM",
                  location: "Google Meet",
                },
              ]
          ).map((s: any) => {
            const startParts = s.time
              ? { time: s.time, ampm: s.ampm }
              : fmtTimeParts(s.starts_at);
            const pocAssigned = !s.missing?.includes("POC");
            const coord = s.staff?.find((x: any) => x.kind === "COORDINATOR");
            const roleBadge = s.role || (coord ? "COORDINATOR" : pocAssigned ? "POC" : "ATTEND");

            return (
              <div key={s.id} className="timeline-item">
                <div className="timeline-time-col">
                  <span className="time-large">{startParts.time}</span>
                  <span className="time-ampm">{startParts.ampm}</span>
                </div>
                <div className="timeline-line-marker">
                  <div className="marker-dot" />
                  <div className="timeline-line" />
                </div>
                <button
                  className="timeline-card"
                  onClick={() => s.starts_at && setOpenId(s.id)}
                  aria-label={`View ${s.event_name}`}
                >
                  <div className="timeline-card-content">
                    <span className="timeline-event-name">{s.event_name}</span>
                    <span className="timeline-event-sub">{s.stage}</span>
                    <div className="timeline-badges-row">
                      <Chip v={roleBadge} />
                      <div className="timeline-location">
                        <Icon n="pin" s={14} />
                        <span>{s.location || (s.meet_url ? "Online" : "Main Arena")}</span>
                      </div>
                    </div>
                  </div>
                  <Icon n="chevronRight" s={18} className="row-card-chevron" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* "Upcoming this week" Section */}
      {(upcomingEvents.length > 0 || (!q.data || q.data.length === 0)) && (
        <div style={{ marginTop: 28 }}>
          <div className="section-header">
            <h3>Upcoming this week</h3>
            <button
              className="section-link"
              onClick={() => shiftWeek(1)}
              style={{ background: "none", border: 0, cursor: "pointer" }}
            >
              See all
            </button>
          </div>
          <div className="upcoming-list">
            {(upcomingEvents.length > 0
              ? upcomingEvents.map((ev) => {
                  const dObj = new Date(ev.starts_at);
                  return {
                    id: ev.id,
                    day: dObj.getDate(),
                    month: dObj.toLocaleString([], { month: "short" }).toUpperCase(),
                    title: ev.event_name,
                    category: ev.stage,
                    role: ev.staff?.[0]?.kind || "COORDINATOR",
                    real: true,
                  };
                })
              : [
                  { id: "u-1", day: 15, month: "OCT", title: "Chess Finals", category: "Esports", role: "COORDINATOR" },
                  { id: "u-2", day: 16, month: "OCT", title: "Free Fire Finals", category: "Esports", role: "SUPPORT" },
                  { id: "u-3", day: 17, month: "OCT", title: "Sports Trivia - Finals", category: "Quiz", role: "ATTEND" },
                  { id: "u-4", day: 18, month: "OCT", title: "Closing Ceremony", category: "General", role: "ATTEND" },
                ]
            ).map((item: any) => (
              <button
                key={item.id}
                className="upcoming-card"
                onClick={() => item.real && setOpenId(item.id)}
              >
                <div className="upcoming-left">
                  <div className="date-box">
                    <span className="date-box-num">{item.day}</span>
                    <span className="date-box-month">{item.month}</span>
                  </div>
                  <div className="upcoming-info">
                    <span className="upcoming-title">{item.title}</span>
                    <div className="upcoming-meta">
                      <span className="upcoming-cat">{item.category}</span>
                      <Chip v={item.role} />
                    </div>
                  </div>
                </div>
                <Icon n="chevronRight" s={18} className="row-card-chevron" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Session Detail Sheet */}
      {open && (
        <Sheet
          title={`${open.event_name}: ${open.stage}`}
          onClose={() => setOpenId(null)}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <span className="mu">
              {fmtT(open.starts_at)} to {fmtT(open.ends_at)}
            </span>
            <Chip v={open.event_status || open.status} />
          </div>

          {(open.meet_url || open.stream_url) && (
            <div className="btns" style={{ marginBottom: 16 }}>
              {open.meet_url && (
                <a
                  className="ghost"
                  href={open.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ gap: 6 }}
                >
                  Meeting link
                </a>
              )}
              {open.stream_url && (
                <a
                  className="ghost"
                  href={open.stream_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ gap: 6 }}
                >
                  Livestream
                </a>
              )}
            </div>
          )}

          <h4>Staffing</h4>
          {open.staff.length === 0 && <Empty t="Nobody assigned yet." />}
          {open.staff.map((x: any) => (
            <StaffRow key={x.duty_id} s={x} users={canAssign ? users.data || [] : []} />
          ))}

          {open.missing.length > 0 && (
            <p className="err" style={{ marginTop: 12 }}>
              Missing: {open.missing.map(label).join(", ")}
            </p>
          )}

          {canAssign && <AssignForm session={open} users={users.data || []} />}
        </Sheet>
      )}
    </>
  );
}