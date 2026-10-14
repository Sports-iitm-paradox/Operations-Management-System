import { Suspense, lazy, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, hasToken, setToken } from "./api";
import { useMe } from "./me";
import { BrandLogo, Err, Field, Icon } from "./ui";
import Home from "./pages/Home";

const Calendar = lazy(() => import("./pages/Calendar"));
const Duties = lazy(() => import("./pages/Duties"));
const Issues = lazy(() => import("./pages/Issues"));
const More = lazy(() => import("./pages/More"));
const Team = lazy(() => import("./pages/Team"));
const Events = lazy(() => import("./pages/Events"));
const Exports = lazy(() => import("./pages/Exports"));
const Audit = lazy(() => import("./pages/Audit"));
const Import = lazy(() => import("./pages/Import"));

function Login() {
  const [email, setE] = useState("");
  const [pw, setP] = useState("");
  const m = useMutation({
    mutationFn: () => api("/auth/login", "POST", { email: email.trim(), password: pw }),
    onSuccess: (r: any) => {
      if (!r?.access_token) {
        throw new Error("Login succeeded but the server did not return an access token.");
      }
      setToken(r.access_token);
      window.location.replace("/");
    },
  });

  return (
    <main className="login">
      <div className="login-brand-logo">
        <BrandLogo size={36} />
      </div>
      <h1>Sports OMS</h1>
      <p className="mu">Operations management for your fest</p>
      <div className="card-form">
        <Field l="Email">
          <input
            value={email}
            onChange={(e) => setE(e.target.value)}
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            placeholder="name@fest.invalid"
          />
        </Field>
        <Field l="Password">
          <input
            type="password"
            value={pw}
            onChange={(e) => setP(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••••••"
            onKeyDown={(e) => e.key === "Enter" && m.mutate()}
          />
        </Field>
        <Err e={m.error} />
        <button
          className="btn block"
          disabled={m.isPending || !email || !pw}
          onClick={() => m.mutate()}
        >
          {m.isPending ? "Signing in" : "Sign in"}
        </button>
      </div>
      <p className="mu small center" style={{ marginTop: 20 }}>
        Need an account? Ask your Core team member.
      </p>
    </main>
  );
}

function ShellHeader() {
  const me = useMe();
  const loc = useLocation();
  const nav = useNavigate();
  const isCalendar = loc.pathname.startsWith("/calendar");

  return (
    <header className="top">
      <div className="brand-row">
        <div className="brand-icon">
          <BrandLogo size={24} />
        </div>
        <span className="brand-text">Sports OMS</span>
      </div>
      <div className="top-actions">
        {isCalendar && (
          <button
            className="icon-btn"
            aria-label="Search schedule"
            onClick={() => nav("/issues")}
          >
            <Icon n="search" s={20} />
          </button>
        )}
        <button
          className="avatar-badge"
          aria-label="Profile and settings"
          onClick={() => nav("/more")}
        >
          {me?.name ? me.name[0].toUpperCase() : "S"}
        </button>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          !hasToken() ? (
            <Navigate to="/login" replace />
          ) : (
            <div className="shell">
              <ShellHeader />
              <main>
                <Suspense
                  fallback={
                    <div style={{ padding: "40px 0", textAlign: "center" }}>
                      <p className="mu">Loading</p>
                    </div>
                  }
                >
                  <Routes>
                    <Route index element={<Home />} />
                    <Route path="calendar" element={<Calendar />} />
                    <Route path="duties" element={<Duties />} />
                    <Route path="issues" element={<Issues />} />
                    <Route path="more" element={<More />} />
                    <Route path="team" element={<Team />} />
                    <Route path="events" element={<Events />} />
                    <Route path="exports" element={<Exports />} />
                    <Route path="audit" element={<Audit />} />
                    <Route path="import" element={<Import />} />
                  </Routes>
                </Suspense>
              </main>
              <nav className="tabs" aria-label="Main">
                <div className="tabs-row">
                  <NavLink to="/" end>
                    <Icon n="home" s={22} />
                    <span>Home</span>
                  </NavLink>
                  <NavLink to="/calendar">
                    <Icon n="cal" s={22} />
                    <span>Calendar</span>
                  </NavLink>
                  <NavLink to="/duties">
                    <Icon n="duty" s={22} />
                    <span>Duties</span>
                  </NavLink>
                  <NavLink to="/issues">
                    <Icon n="alert" s={22} />
                    <span>Issues</span>
                  </NavLink>
                  <NavLink to="/more">
                    <Icon n="menu" s={22} />
                    <span>More</span>
                  </NavLink>
                </div>
                <div className="home-indicator" />
              </nav>
            </div>
          )
        }
      />
    </Routes>
  );
}