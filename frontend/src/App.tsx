import { Suspense, lazy, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, hasToken, setToken } from "./api";
import { Err, Field, Icon } from "./ui";
import Home from "./pages/Home";
const Calendar = lazy(() => import("./pages/Calendar")), Duties = lazy(() => import("./pages/Duties")), Issues = lazy(() => import("./pages/Issues")), More = lazy(() => import("./pages/More")),
  Team = lazy(() => import("./pages/Team")), Events = lazy(() => import("./pages/Events")), Exports = lazy(() => import("./pages/Exports")), Audit = lazy(() => import("./pages/Audit")), Import = lazy(() => import("./pages/Import"));

function Login() {
  const nav = useNavigate(); const [email, setE] = useState(""); const [pw, setP] = useState("");
  const m = useMutation({ mutationFn: () => api("/auth/login", "POST", { email: email.trim(), password: pw }), onSuccess: (r: any) => { setToken(r.access_token); nav("/"); } });
  return <main className="login"><div className="logo">OMS</div><h1>Sports OMS</h1><p className="mu">Operations management for your fest</p>
    <Field l="Email"><input value={email} onChange={e => setE(e.target.value)} autoComplete="username" inputMode="email" autoCapitalize="none" /></Field>
    <Field l="Password"><input type="password" value={pw} onChange={e => setP(e.target.value)} autoComplete="current-password" onKeyDown={e => e.key === "Enter" && m.mutate()} /></Field>
    <Err e={m.error} /><button className="btn block" disabled={m.isPending || !email || !pw} onClick={() => m.mutate()}>{m.isPending ? "Signing in" : "Sign in"}</button>
    <p className="mu small center">Need an account? Ask your Core team member.</p></main>;
}

export default function App() {
  return <Routes><Route path="/login" element={<Login />} /><Route path="/*" element={!hasToken() ? <Navigate to="/login" replace /> :
    <div className="shell"><header className="top"><span className="brand">Sports OMS</span></header>
      <main><Suspense fallback={<p className="mu">Loading</p>}><Routes><Route index element={<Home />} /><Route path="calendar" element={<Calendar />} /><Route path="duties" element={<Duties />} /><Route path="issues" element={<Issues />} />
        <Route path="more" element={<More />} /><Route path="team" element={<Team />} /><Route path="events" element={<Events />} /><Route path="exports" element={<Exports />} /><Route path="audit" element={<Audit />} /><Route path="import" element={<Import />} /></Routes></Suspense></main>
      <nav className="tabs" aria-label="Main"><NavLink to="/" end><Icon n="home" />Home</NavLink><NavLink to="/calendar"><Icon n="cal" />Calendar</NavLink><NavLink to="/duties"><Icon n="duty" />Duties</NavLink>
        <NavLink to="/issues"><Icon n="alert" />Issues</NavLink><NavLink to="/more"><Icon n="menu" />More</NavLink></nav></div>} /></Routes>;
}
