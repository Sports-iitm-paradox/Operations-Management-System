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

export default function Home() {
  const me = useMe();
  const nav = useNavigate();
  const s = useQuery({ queryKey: ["sum"], queryFn: () => api("/dashboard/summary"), ...LIVE });
  const o = useQuery({ queryKey: ["overdue"], queryFn: () => api<any[]>("/issues/overdue"), ...LIVE });
  const d = useQuery({ queryKey: ["duties"], queryFn: () => api<any[]>("/duties/my-duties"), ...LIVE });

  const next = d.data?.find(
    (x) =>
      ["ASSIGNED", "ACKNOWLEDGED", "CHECKED_IN"].includes(x.status) &&
      new Date(x.ends_at) > new Date()
  );

  if (s.error) return <Err e={s.error} />;
  const x = s.data;
  const sev = x?.open_issues_by_severity || {};

  const greeting = getGreeting();
  const displayName = me?.name ? me.name.split(" ")[0] : "Sports";
  const userRole = me?.role || "CORE";
  const todayStr = fmtFullDate(new Date());

  const sessionsToday = x?.sessions_today ?? 2;
  const dutiesScheduled = x?.duties_scheduled ?? 4;
  const missingCheckin = x?.duties_missing_checkin ?? 0;
  const noPoc = x?.sessions_without_poc ?? 0;
  const overdueCount = x?.overdue_issues ?? 0;

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
          {next?.event_name || "IPL Auction Showdown"}
        </div>
        <div className="hero-duty-sub">
          {next
            ? `${next.stage} · ${next.kind}`
            : "Unstop Quiz · COORDINATOR"}
        </div>
        <div className="hero-duty-footer">
          <div className="hero-duty-meta">
            <div className="hero-duty-meta-item">
              <Icon n="cal" s={16} />
              <span>{next ? fmtDT(next.starts_at) : "Oct 14, 5:00 PM"}</span>
            </div>
            <div className="hero-duty-meta-item">
              <Icon n="pin" s={16} />
              <span>{next?.meet_url ? "Online" : next?.stage || "Online"}</span>
            </div>
          </div>
          <div className="hero-duty-btn" aria-label="View duty">
            <Icon n="arrowRight" s={18} />
          </div>
        </div>
      </Link>

      {/* 2x2 Metric Grid */}
      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-card-icon blue">
            <Icon n="cal" s={20} />
          </div>
          <span className="metric-card-num">{sessionsToday}</span>
          <span className="metric-card-label">Sessions today</span>
        </div>

        <div className="metric-card">
          <div className="metric-card-icon green">
            <Icon n="check" s={20} />
          </div>
          <span className="metric-card-num">{dutiesScheduled}</span>
          <span className="metric-card-label">Duties scheduled</span>
        </div>

        <div className={`metric-card ${missingCheckin > 0 ? "alert-bad" : ""}`}>
          <div className="metric-card-icon red">
            <Icon n="user" s={20} />
          </div>
          <span className="metric-card-num">{missingCheckin}</span>
          <span className="metric-card-label">Missing check-in</span>
        </div>

        <div className={`metric-card ${noPoc > 0 ? "alert-warn" : ""}`}>
          <div className="metric-card-icon amber">
            <Icon n="alert" s={20} />
          </div>
          <span className="metric-card-num">{noPoc}</span>
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
            <div className="row-card-num">{overdueCount}</div>
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
        <div className="issue-stat-col">
          <div className="issue-stat-header">
            <span className="stat-dot critical" />
            <span>Critical</span>
          </div>
          <span className="issue-stat-num">{sev["CRITICAL"] ?? 0}</span>
        </div>

        <div className="issue-stat-col">
          <div className="issue-stat-header">
            <span className="stat-dot high" />
            <span>High</span>
          </div>
          <span className="issue-stat-num">{sev["HIGH"] ?? 0}</span>
        </div>

        <div className="issue-stat-col">
          <div className="issue-stat-header">
            <span className="stat-dot medium" />
            <span>Medium</span>
          </div>
          <span className="issue-stat-num">{sev["MEDIUM"] ?? 0}</span>
        </div>

        <div className="issue-stat-col">
          <div className="issue-stat-header">
            <span className="stat-dot low" />
            <span>Low</span>
          </div>
          <span className="issue-stat-num">{sev["LOW"] ?? 0}</span>
        </div>
      </div>

      {/* Needs Attention Section */}
      <div className="section-header">
        <h3>Needs attention</h3>
        <Link to="/issues" className="section-link">
          View all
        </Link>
      </div>

      <div className="attention-list">
        {missingCheckin > 0 && (
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
                  {next?.event_name || "IPL Auction Showdown"}
                </span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        )}

        {noPoc > 0 && (
          <Link to="/calendar" className="attention-item">
            <div className="attention-item-left">
              <div className="attention-icon-box amber">
                <Icon n="shield" s={20} />
              </div>
              <div className="attention-texts">
                <span className="attention-title">POC not assigned</span>
                <span className="attention-sub">
                  {next?.event_name ? `${next.event_name} · Stage ${next.stage}` : "BGMI Finals"}
                </span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        )}

        {o.data && o.data.length > 0 ? (
          o.data.slice(0, 3).map((item) => (
            <Link to="/issues" className="attention-item" key={item.id}>
              <div className="attention-item-left">
                <div
                  className={`attention-icon-box ${
                    item.severity === "CRITICAL" ? "red" : item.severity === "HIGH" ? "amber" : "slate"
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
          ))
        ) : (
          <Link to="/issues" className="attention-item">
            <div className="attention-item-left">
              <div className="attention-icon-box slate">
                <Icon n="info" s={20} />
              </div>
              <div className="attention-texts">
                <span className="attention-title">No overdue issues</span>
                <span className="attention-sub">All clear for now</span>
              </div>
            </div>
            <Icon n="chevronRight" s={18} className="row-card-chevron" />
          </Link>
        )}
      </div>

      {x?.median_resolution_minutes != null && (
        <p className="mu small center" style={{ marginTop: 18 }}>
          Median resolution time {x.median_resolution_minutes} min
        </p>
      )}
    </>
  );
}