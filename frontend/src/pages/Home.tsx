import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { LIVE, useMe } from "../me";
import {
  Chip,
  Err,
  fmtDT,
  fmtFullDate,
  getGreeting,
  Icon,
} from "../ui";

type SessionWithoutPoc = {
  session_id: string;
  event_id: string;
  event_name: string;
  stage: string;
  starts_at: string;
  ends_at: string;
};

export default function Home() {
  const me = useMe();
  const nav = useNavigate();

  const s = useQuery({
    queryKey: ["sum"],
    queryFn: () => api("/dashboard/summary"),
    ...LIVE,
  });

  const o = useQuery({
    queryKey: ["overdue"],
    queryFn: () => api<any[]>("/issues/overdue"),
    ...LIVE,
  });

  const d = useQuery({
    queryKey: ["duties"],
    queryFn: () => api<any[]>("/duties/my-duties"),
    ...LIVE,
  });

  const p = useQuery({
    queryKey: ["sessions-without-poc"],
    queryFn: () => api<SessionWithoutPoc[]>("/dashboard/sessions-without-poc"),
    ...LIVE,
  });

  const now = Date.now();
  const next = d.data
    ?.filter(
      (duty) =>
        ["ASSIGNED", "ACKNOWLEDGED", "CHECKED_IN"].includes(duty.status) &&
        new Date(duty.ends_at).getTime() > now
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    )[0];

  if (s.isError) return <Err e={s.error} />;

  const summary = s.data;
  const severity = summary?.open_issues_by_severity || {};
  const greeting = getGreeting();
  const displayName = me?.name ? me.name.split(" ")[0] : "Sports";
  const userRole = me?.role || "CORE";
  const todayStr = fmtFullDate(new Date());

  const sessionsToday = summary?.sessions_today;
  const dutiesScheduled = summary?.duties_scheduled;
  const missingCheckin = summary?.duties_missing_checkin;
  const noPoc = summary?.sessions_without_poc;
  const overdueCount = summary?.overdue_issues;

  const isSummaryLoading = s.isLoading;
  const metric = (value: number | undefined) =>
    isSummaryLoading ? "—" : (value ?? 0);

  return (
    <>
      {/* Greeting Header */}
      <div className="greeting-section">
        <div>
          <span className="greeting-label">{greeting}</span>
          <div className="greeting-name-row">
            <span className="greeting-name">{displayName}</span>
            <Chip v={userRole} />
          </div>
          <span className="greeting-date">{todayStr}</span>
        </div>
        <button
          className="icon-btn"
          aria-label="Notifications"
          onClick={() => nav("/more")}
        >
          <Icon n="bell" s={22} />
          <span className="icon-btn-dot" />
        </button>
      </div>

      {/* Hero Card: NEXT DUTY */}
      <Link to={next ? "/duties" : "/calendar"} className="hero-duty">
        <div className="hero-duty-trophy">
          <Icon n="trophy" s={130} />
        </div>
        <div className="hero-duty-tag">NEXT DUTY</div>
        <div className="hero-duty-title">
          {d.isLoading ? "Loading your duties…" : next?.event_name || "No upcoming duty"}
        </div>
        <div className="hero-duty-sub">
          {next
            ? `${next.stage} · ${next.kind}`
            : d.isLoading
              ? "Checking your assigned schedule"
              : d.isError
                ? "Unable to load your duties"
                : "You have no upcoming assigned duties"}
        </div>
        <div className="hero-duty-footer">
          <div className="hero-duty-meta">
            <div className="hero-duty-meta-item">
              <Icon n="cal" s={16} />
              <span>
                {next
                  ? fmtDT(next.starts_at)
                  : d.isLoading
                    ? "Loading schedule"
                    : "No scheduled time"}
              </span>
            </div>
            {next && (
              <div className="hero-duty-meta-item">
                <Icon n="pin" s={16} />
                <span>
                  {next.meet_url
                    ? "Online"
                    : next.location || "Location not set"}
                </span>
              </div>
            )}
          </div>
          <div className="hero-duty-btn" aria-label="View duty">
            <Icon n="arrowRight" s={18} />
          </div>
        </div>
      </Link>
      {d.isError && <Err e={d.error} />}

      {/* 2x2 Metric Grid */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-card-icon blue">
            <Icon n="cal" s={20} />
          </div>
          <span className="metric-card-num">{metric(sessionsToday)}</span>
          <span className="metric-card-label">Sessions today</span>
        </div>

        <div className="metric-card">
          <div className="metric-card-icon green">
            <Icon n="check" s={20} />
          </div>
          <span className="metric-card-num">{metric(dutiesScheduled)}</span>
          <span className="metric-card-label">Duties scheduled</span>
        </div>

        <div className={`metric-card ${(missingCheckin ?? 0) > 0 ? "alert-bad" : ""}`}>
          <div className="metric-card-icon red">
            <Icon n="user" s={20} />
          </div>
          <span className="metric-card-num">{metric(missingCheckin)}</span>
          <span className="metric-card-label">Missing check-in</span>
        </div>

        <div className={`metric-card ${(noPoc ?? 0) > 0 ? "alert-warn" : ""}`}>
          <div className="metric-card-icon amber">
            <Icon n="alert" s={20} />
          </div>
          <span className="metric-card-num">{metric(noPoc)}</span>
          <span className="metric-card-label">No POC</span>
        </div>
      </div>

      {/* Full-width Overdue Issues Row Card */}
      <Link to="/issues" className="row-card">
        <div className="row-card-left">
          <div className="row-card-icon">
            <Icon n="file" s={20} />
          </div>
          <div>
            <div className="row-card-title">Overdue issues</div>
            <div className="row-card-num">{metric(overdueCount)}</div>
          </div>
        </div>
        <div className="row-card-chevron">
          <Icon n="chevronRight" s={20} />
        </div>
      </Link>

      {/* Open Issues Section */}
      <div className="section-header">
        <h3>Open issues</h3>
        <Link to="/issues" className="section-link">
          View all
        </Link>
      </div>
      <div className="issues-summary-card">
        {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((level) => (
          <div className="issue-stat-col" key={level}>
            <div className="issue-stat-header">
              <span className={`stat-dot ${level.toLowerCase()}`} />
              <span>{level.charAt(0) + level.slice(1).toLowerCase()}</span>
            </div>
            <span className="issue-stat-num">
              {isSummaryLoading ? "—" : (severity[level] ?? 0)}
            </span>
          </div>
        ))}
      </div>

      {/* Needs Attention Section */}
      <div className="section-header">
        <h3>Needs attention</h3>
        <Link to="/issues" className="section-link">
          View all
        </Link>
      </div>

      <div className="attention-list">
        {typeof missingCheckin === "number" && missingCheckin > 0 && (
          <Link to="/duties" className="attention-item">
            <div className="attention-item-left">
              <div className="attention-icon-box red">
                <Icon n="user" s={20} />
              </div>
              <div className="attention-texts">
                <span className="attention-title">
                  {missingCheckin} {missingCheckin === 1 ? "member" : "members"} missing check-in
                </span>
                <span className="attention-sub">
                  View assigned duties to identify missing check-ins
                </span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        )}

        {p.isLoading && (
          <div className="attention-item">
            <div className="attention-texts">
              <span className="attention-title">Checking POC assignments…</span>
            </div>
          </div>
        )}

        {p.isError && (
          <div className="attention-item">
            <div className="attention-texts">
              <span className="attention-title">Unable to load POC assignments</span>
              <span className="attention-sub">Refresh the dashboard to try again.</span>
            </div>
          </div>
        )}

        {p.data?.map((session) => (
          <Link
            to="/calendar"
            className="attention-item"
            key={session.session_id}
          >
            <div className="attention-item-left">
              <div className="attention-icon-box amber">
                <Icon n="alert" s={20} />
              </div>
              <div className="attention-texts">
                <span className="attention-title">POC not assigned</span>
                <span className="attention-sub">
                  {session.event_name} · {session.stage} · {fmtDT(session.starts_at)}
                </span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        ))}

        {o.isLoading && (
          <div className="attention-item">
            <div className="attention-texts">
              <span className="attention-title">Loading overdue issues…</span>
            </div>
          </div>
        )}

        {o.isError && (
          <div className="attention-item">
            <div className="attention-texts">
              <span className="attention-title">Unable to load overdue issues</span>
              <span className="attention-sub">Refresh the dashboard to try again.</span>
            </div>
          </div>
        )}

        {o.data?.slice(0, 3).map((item) => (
          <Link to="/issues" className="attention-item" key={item.id}>
            <div className="attention-item-left">
              <div
                className={`attention-icon-box ${
                  item.severity === "CRITICAL"
                    ? "red"
                    : item.severity === "HIGH"
                      ? "amber"
                      : "slate"
                }`}
              >
                <Icon n="alert" s={20} />
              </div>
              <div className="attention-texts">
                <span className="attention-title">{item.title}</span>
                <span className="attention-sub">
                  {item.ref} · Past deadline {fmtDT(item.resolve_by)}
                </span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        ))}

        {!s.isLoading &&
          !d.isLoading &&
          !p.isLoading &&
          !o.isLoading &&
          !s.isError &&
          !d.isError &&
          !p.isError &&
          !o.isError &&
          (missingCheckin ?? 0) === 0 &&
          (p.data?.length ?? 0) === 0 &&
          (o.data?.length ?? 0) === 0 && (
            <div className="attention-item">
              <div className="attention-item-left">
                <div className="attention-icon-box slate">
                  <Icon n="info" s={20} />
                </div>
                <div className="attention-texts">
                  <span className="attention-title">Nothing needs attention</span>
                  <span className="attention-sub">
                    There are no missing check-ins, unassigned POCs, or overdue issues.
                  </span>
                </div>
              </div>
            </div>
          )}
      </div>

      {summary?.median_resolution_minutes != null && (
        <p className="mu small center" style={{ marginTop: 18 }}>
          Median resolution time {summary.median_resolution_minutes} min
        </p>
      )}
    </>
  );
}
