"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";
const TABS = ["Dashboard", "Analytics", "Planning", "Tasks", "Workflow", "Collaboration", "Feedback", "Employees", "Projects", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports", "Validation", "Audit", "Administration", "Enterprise Data", "Database", "Settings"];
const ROLE_TABS = {
  Admin: TABS,
  Director: ["Dashboard", "Analytics", "Planning", "Collaboration", "Feedback", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports"],
  Manager: ["Dashboard", "Analytics", "Planning", "Tasks", "Workflow", "Collaboration", "Feedback", "Employees", "Projects", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports", "Validation"],
  "Project Manager": ["Dashboard", "Analytics", "Planning", "Tasks", "Workflow", "Collaboration", "Feedback", "Employees", "Projects", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports", "Validation"],
  "Team Leader": ["Analytics", "Planning", "Tasks", "Workflow", "Collaboration", "Feedback", "Progress", "Quality", "Workload", "Risk"],
  Employee: ["Dashboard", "Analytics", "Planning", "Tasks", "Workflow", "Collaboration", "Feedback", "Employees", "Projects", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports"],
  Viewer: ["Dashboard", "Analytics", "Planning", "Collaboration", "Feedback", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports"]
};
// OSE2 public view: visitors who are not logged in see these read-only tabs.
const GUEST_TABS = ["Dashboard", "Analytics", "Planning", "KPI", "Project KPI", "Progress", "Quality", "Workload", "Risk", "Reports"];
const WORKFLOW_ACTIONS = [
  ["assign_task", "Assign Task"],
  ["update_progress", "Update Progress"],
  ["submit_work", "Submit Work"],
  ["start_review", "Start Review"],
  ["need_revision", "Need Revision"],
  ["resubmit", "Resubmit"],
  ["approve", "Approve"],
  ["complete", "Complete"],
  ["on_hold", "On Hold"],
  ["cancel", "Cancel"]
];
const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#60a5fa"];

function classNames(...x) { return x.filter(Boolean).join(" "); }
function emptyDashboard() { return { cards: {}, employeeKpi: [], statusData: [], projectRisk: [] }; }

const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readApiError(res) {
  let detail = "";
  try {
    const text = await res.text();
    if (text) {
      try {
        const js = JSON.parse(text);
        detail = typeof js?.detail === "string" ? js.detail : (js?.message || text);
      } catch {
        detail = text;
      }
    }
  } catch {}
  return { status: res.status, detail: String(detail || res.statusText || "Request failed") };
}

function makeHttpError(status, detail) {
  const err = new Error(`HTTP ${status}: ${detail}`);
  err.status = status;
  err.detail = detail;
  err.kind = "http";
  return err;
}

export default function Page() {
  const [user, setUser] = useState(null);
  const [login, setLogin] = useState({ username: "admin", password: "" });
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState("Dashboard");
  const [dashboard, setDashboard] = useState(emptyDashboard());
  const [tasks, setTasks] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [kpi, setKpi] = useState([]);
  const [projectKpi, setProjectKpi] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [risk, setRisk] = useState([]);
  const [validation, setValidation] = useState([]);
  const [audit, setAudit] = useState([]);
  const [dbInfo, setDbInfo] = useState(null);
  const [dbSafety, setDbSafety] = useState(null);
  const [dbBackups, setDbBackups] = useState([]);
  const [dbIntegrity, setDbIntegrity] = useState(null);
  const [settingsRows, setSettingsRows] = useState([]);
  const [filters, setFilters] = useState({ project: "All", employee: "All", status: "All" });
  const [workflow, setWorkflow] = useState({ task_id: "", action_by: "", progress: 50, comment: "" });
  const [history, setHistory] = useState([]);
  const [allHistory, setAllHistory] = useState([]);
  const [backendStatus, setBackendStatus] = useState("checking");
  const [backendHealth, setBackendHealth] = useState(null);
  const [loginError, setLoginError] = useState(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const isGuest = !!user?.IsGuest;
  const [showLogin, setShowLogin] = useState(false);
  const allowedTabs = useMemo(() => (user?.IsGuest ? GUEST_TABS : ROLE_TABS[user?.Role]) || [], [user]);

  async function loadSessionUser() {
    try {
      const r = await fetch(`${API}/auth/me`, { credentials: "include", cache: "no-store" });
      const js = r.ok ? await r.json() : null;
      if (js?.user) {
        setUser(js.user);
        setActive(((js.user.IsGuest ? GUEST_TABS : ROLE_TABS[js.user.Role]) || ["Dashboard"])[0]);
        return js.user;
      }
    } catch {}
    setUser(null);
    return null;
  }

  async function probeBackend(silent = true) {
    try {
      const res = await fetchWithTimeout(`${API}/health`, { cache: "no-store" }, 8000);
      if (!res.ok) {
        const info = await readApiError(res);
        throw makeHttpError(info.status, info.detail);
      }
      const h = await res.json();
      setBackendStatus("online");
      setBackendHealth(h);
      if (!silent) {
        alert(`Backend OK\nVersion: ${h.version || "-"}\nDatabase: ${h.database_url_kind || "-"}\nDialect: ${h.dialect || "-"}\nTables: ${h.tables ?? "-"}`);
      }
      return h;
    } catch (e) {
      setBackendStatus("offline");
      setBackendHealth(null);
      if (!silent) {
        const suffix = e?.name === "AbortError" ? " (connection timed out)" : "";
        alert(`Backend health check failed${suffix}.\n\nStart Project KPI Manager with START_PROJECT_KPI_MANAGER.bat, or run FastAPI on http://127.0.0.1:8000.`);
      }
      return null;
    }
  }

  async function api(path, options = {}) {
    let res;
    const headers = { ...(options.headers || {}) };
    const hasBody = options.body !== undefined && options.body !== null;
    if (hasBody && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    try {
      res = await fetchWithTimeout(`${API}${path}`, {
        ...options,
        cache: options.cache || "no-store",
        credentials: "include",
        headers
      });
      // Any HTTP response proves the backend is reachable, including 401/423/500.
      setBackendStatus("online");
    } catch (e) {
      setBackendStatus("offline");
      const err = new Error(e?.name === "AbortError" ? "Backend request timed out." : "Backend connection failed (network/CORS/unreachable).");
      err.kind = "network";
      throw err;
    }
    if (!res.ok) {
      const info = await readApiError(res);
      throw makeHttpError(info.status, info.detail);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async function doLogin() {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetchWithTimeout(`${API}/auth/login`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login)
      });
      // HTTP 401/423/500 still means the backend is online.
      setBackendStatus("online");
      if (!res.ok) {
        const info = await readApiError(res);
        let message = info.detail;
        if (info.status === 401) message = `HTTP 401 — ${info.detail || "Invalid username or password."}`;
        else if (info.status === 423) message = `HTTP 423 — ${info.detail || "Account is temporarily locked."}`;
        else if (info.status >= 500) message = `HTTP ${info.status} — Backend error: ${info.detail || "Internal server error."}`;
        else message = `HTTP ${info.status} — ${info.detail}`;
        setLoginError({ status: info.status, message });
        return;
      }
      const js = await res.json();
      setUser(js.user);
      setShowLogin(false);
      setLoginError(null);
      setMsg(`Logged in as ${js.user.FullName || js.user.Username}`);
      setActive((ROLE_TABS[js.user.Role] || ["Dashboard"])[0]);
      probeBackend(true);
    } catch (e) {
      const timedOut = e?.name === "AbortError";
      setBackendStatus("offline");
      setLoginError({
        status: 0,
        message: timedOut
          ? "Login request timed out. The backend may be busy or blocked."
          : "Login request could not reach /auth/login (network, CORS, or backend process problem). The health indicator may still be stale; click Retry Connection."
      });
    } finally {
      setLoginBusy(false);
    }
  }

  async function logout() {
    try { await fetch(`${API}/auth/logout`, { method: "POST", credentials: "include" }); } catch {}
    setUser(null);
    setMsg("");
    setDashboard(emptyDashboard());
    setActive("Dashboard");
    setShowLogin(false);
    await loadSessionUser();
  }

  async function changeOwnPassword() {
    const current_password = prompt("Current password:");
    if (current_password === null) return;
    const new_password = prompt("New password (minimum 8 characters):");
    if (!new_password) return;
    try {
      const r = await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ current_password, new_password })
      });
      alert(r.message || "Password changed. Please sign in again.");
      setUser(null);
      setActive("Dashboard");
    } catch (e) { alert(`Change password error: ${e.message}`); }
  }

  async function refreshAll() {
    try {
      const [d, t, e, p, ek, pk, wl, tr] = await Promise.all([
        api("/dashboard"), api("/tasks"), api("/tables/employees"), api("/tables/projects"),
        api("/tables/employee_kpi"), api("/tables/project_kpi"), api("/tables/workload_balance"), api("/tables/task_risk")
      ]);
      setDashboard(d); setTasks(t.rows || []); setEmployees(e.rows || []); setProjects(p.rows || []);
      setKpi(ek.rows || []); setProjectKpi(pk.rows || []); setWorkload(wl.rows || []); setRisk(tr.rows || []);
      if ((t.rows || []).length && !workflow.task_id) setWorkflow(v => ({ ...v, task_id: t.rows[0].TaskID }));
      if ((e.rows || []).length && !workflow.action_by) setWorkflow(v => ({ ...v, action_by: e.rows[0].EmployeeID }));
    } catch (e) {
      setMsg(e.message);
    }
  }

  async function checkBackend() {
    await probeBackend(false);
  }

  async function initDb() {
    if (!confirm("Initialize the database? A safety snapshot will be created first if the current database exists.")) return;
    const typed = prompt('Type INITIALIZE DATABASE to continue:');
    if (typed !== "INITIALIZE DATABASE") { alert("Initialize cancelled. Confirmation text did not match."); return; }
    const r = await api("/db/safety/init", { method: "POST", body: JSON.stringify({ confirm_text: typed }) });
    setDbInfo(r);
    setMsg(r.message || "Database initialized safely");
    await refreshAll();
    await loadDbSafety();
  }
  async function importDemo() { const r = await api("/import/demo", { method: "POST" }); setMsg(`Imported demo Excel. Tasks: ${r.calculate?.tasks || 0}`); await refreshAll(); await loadDbSafety(); }
  async function calculate() { const r = await api("/calculate", { method: "POST" }); setMsg(`KPI calculated. Tasks: ${r.tasks || 0}`); await refreshAll(); }
  async function verifyDb() { const r = await api("/db/verify"); setDbInfo(r); setMsg(r.message); }
  async function clearDb() {
    if (!confirm("Clear the database? A safety snapshot will be created automatically before any data are removed.")) return;
    const typed = prompt('FINAL CONFIRMATION: type CLEAR DATABASE to continue:');
    if (typed !== "CLEAR DATABASE") { alert("Clear cancelled. Confirmation text did not match."); return; }
    const r = await api("/db/safety/clear", { method: "POST", body: JSON.stringify({ confirm_text: typed }) });
    setDbInfo(r);
    setMsg(r.message || "Database cleared safely");
    await refreshAll();
    await loadDbSafety();
  }
  async function runValidation() { const r = await api("/validation/run", { method: "POST" }); setValidation(r.rows || []); setMsg(`Validation issues: ${r.issues}`); }
  async function loadAudit() { const r = await api("/audit/log"); setAudit(r.rows || []); }

  async function loadSettings() {
    try {
      const r = await api("/settings/manage");
      setSettingsRows(r.rows || []);
      setMsg(`Settings loaded: ${r.count ?? (r.rows || []).length}`);
      return r.rows || [];
    } catch (e) {
      setMsg(`Settings error: ${e.message}`);
      throw e;
    }
  }

  async function saveSetting(row) {
    try {
      const r = await api("/settings/manage", {
        method: "POST",
        body: JSON.stringify({ data: row })
      });
      setMsg(r.message || "Setting saved");
      await loadSettings();
      return r;
    } catch (e) {
      alert(`Save setting error: ${e.message}`);
      throw e;
    }
  }

  function openExcelReport() { window.open(`${API}/reports/excel`, "_blank"); }
  function legacyBackupDb() { window.open(`${API}/db/backup`, "_blank"); }

  async function downloadResponseFile(res, fallbackName) {
    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = match ? decodeURIComponent(match[1].replace(/"/g, "").trim()) : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }

  async function loadDbSafety() {
    try {
      const [status, backups] = await Promise.all([
        api("/db/safety/status"),
        api("/db/safety/backups")
      ]);
      setDbSafety(status);
      setDbBackups(backups.rows || []);
      setDbInfo(status);
      return status;
    } catch (e) {
      setMsg(`Database safety status error: ${e.message}`);
      throw e;
    }
  }

  async function backupDb() {
    try {
      const res = await fetch(`${API}/db/safety/backup`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      const filename = await downloadResponseFile(res, "Project_KPI_DB_Snapshot_V314.sqlite");
      setMsg(`Safety snapshot created: ${filename}`);
      await loadDbSafety();
    } catch (e) {
      alert(`Safety backup error: ${e.message}`);
    }
  }

  async function restoreDatabaseUpload(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    try {
      if (!confirm(`Restore database from ${file.name}? The current database will be backed up automatically before restore.`)) return;
      const typed = prompt('Type RESTORE DATABASE to continue:');
      if (typed !== "RESTORE DATABASE") { alert("Restore cancelled. Confirmation text did not match."); return; }
      const fd = new FormData();
      fd.append("file", file);
      fd.append("confirm_text", typed);
      const res = await fetch(`${API}/db/safety/restore-upload`, {
        method: "POST",
        credentials: "include",
        body: fd
      });
      if (!res.ok) throw new Error(await res.text());
      const r = await res.json();
      setDbInfo(r);
      setMsg(r.message || "Database restored");
      await refreshAll();
      await loadDbSafety();
      await checkDbIntegrity();
    } catch (e) {
      alert(`Restore error: ${e.message}`);
    } finally {
      evt.target.value = "";
    }
  }

  async function restoreServerBackup(filename) {
    if (!confirm(`Restore database from stored snapshot ${filename}? A pre-restore backup will be created automatically.`)) return;
    const typed = prompt('Type RESTORE DATABASE to continue:');
    if (typed !== "RESTORE DATABASE") { alert("Restore cancelled. Confirmation text did not match."); return; }
    try {
      const r = await api("/db/safety/restore-server", {
        method: "POST",
        body: JSON.stringify({ filename, confirm_text: typed })
      });
      setDbInfo(r);
      setMsg(r.message || `Restored ${filename}`);
      await refreshAll();
      await loadDbSafety();
      await checkDbIntegrity();
    } catch (e) {
      alert(`Restore error: ${e.message}`);
    }
  }

  async function downloadServerBackup(filename) {
    try {
      const res = await fetch(`${API}/db/safety/backup-file/${encodeURIComponent(filename)}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      await downloadResponseFile(res, filename);
    } catch (e) {
      alert(`Download snapshot error: ${e.message}`);
    }
  }

  async function checkDbIntegrity() {
    try {
      const r = await api("/db/safety/integrity");
      setDbIntegrity(r);
      setDbInfo(r);
      setMsg(r.message || "Database integrity checked");
      return r;
    } catch (e) {
      alert(`Integrity check error: ${e.message}`);
      throw e;
    }
  }

  async function saveCurrentData() {
    try {
      const r = await api("/db/save-current", { method: "POST" });
      setDbInfo(r);
      setMsg(r.message || "Current data saved/checkpointed");
    } catch (e) {
      alert(`Save current data error: ${e.message}`);
    }
  }

  async function loadFromDatabase() {
    try {
      const r = await api("/db/load-current", { method: "POST" });
      setDbInfo(r);
      await refreshAll();
      setMsg(r.message || "Reloaded current data from database");
    } catch (e) {
      alert(`Load from database error: ${e.message}`);
    }
  }

  async function showDatabaseLocation() {
    try {
      const r = await api("/db/location");
      setDbInfo(r);
      const location = r.location || r.database || r.path || "See Database Info";
      setMsg(`Database location: ${location}`);
    } catch (e) {
      alert(`Database location error: ${e.message}`);
    }
  }

  async function openDatabaseFolder() {
    try {
      const r = await api("/db/open-folder", { method: "POST" });
      setDbInfo(r);
      setMsg(r.message || "Database folder opened");
    } catch (e) {
      alert(`Open database folder error: ${e.message}`);
    }
  }

  async function uploadExcel(evt) {
    const file = evt.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${API}/import/upload`, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) throw new Error(await res.text());
    setMsg(`Uploaded ${file.name}`);
    await refreshAll();
  }

  async function saveGeneric(table, row) {
    await api(`/${table}`, { method: "POST", body: JSON.stringify({ data: row }) });
    setMsg(`${table} saved`);
    await refreshAll();
  }

  async function deleteTask(taskId) {
    if (!confirm(`Delete task ${taskId}?`)) return;
    const res = await fetch(`${API}/tasks/${taskId}`, { method: "DELETE", credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    setMsg(`Task ${taskId} deleted`);
    await refreshAll();
  }

  async function runWorkflow(action) {
    try {
      const payload = { ...workflow, action, progress: Number(workflow.progress || 0) };
      const r = await api("/workflow", { method: "POST", body: JSON.stringify(payload) });
      setMsg(`${action} OK: ${r.approval?.FromStatus || ""} → ${r.approval?.ToStatus || ""}`);
      await refreshAll();
      await loadHistory(payload.task_id);
      await loadAllHistory();
    } catch (e) {
      alert(`Workflow error: ${e.message}`);
    }
  }

  async function loadHistory(taskId) {
    if (!taskId) return;
    const r = await api(`/tasks/${taskId}/history`);
    setHistory(r.approval_history || []);
  }

  async function loadAllHistory() {
    const r = await api("/workflow/history/all");
    setAllHistory(r.rows || []);
    return r.rows || [];
  }

  async function loadNotificationCount() {
    if (!user || user.IsGuest) return 0;
    try {
      const r = await api("/collaboration/notifications?unread_only=true&limit=500");
      const n = Number(r.count || 0);
      setNotificationCount(n);
      return n;
    } catch {
      return 0;
    }
  }

  useEffect(() => {
    probeBackend(true);
    loadSessionUser();
    const timer = setInterval(() => probeBackend(true), 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAll();
    if (user.IsGuest) return;
    loadNotificationCount();
    const notificationTimer = setInterval(() => loadNotificationCount(), 30000);
    return () => clearInterval(notificationTimer);
  }, [user]);
  useEffect(() => { if (workflow.task_id && user && !user.IsGuest) loadHistory(workflow.task_id); }, [workflow.task_id]);
  useEffect(() => {
    if (user && active === "Settings") {
      loadSettings().catch(() => {});
    }
  }, [active, user]);
  useEffect(() => {
    if (user && active === "Database") {
      loadDbSafety().catch(() => {});
    }
  }, [active, user]);

  const visibleTasks = tasks.filter(t =>
    (filters.project === "All" || t.ProjectID === filters.project) &&
    (filters.employee === "All" || t.AssignedTo === filters.employee) &&
    (filters.status === "All" || t.DeadlineStatus === filters.status || t.Status === filters.status)
  );

  if (!user || (isGuest && showLogin)) return <Login login={login} setLogin={setLogin} doLogin={doLogin} backendStatus={backendStatus} backendHealth={backendHealth} probeBackend={probeBackend} loginError={loginError} loginBusy={loginBusy} onBack={isGuest ? () => { setShowLogin(false); setLoginError(null); } : null} />;

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-72 overflow-y-auto bg-gradient-to-b from-slate-950 to-blue-950 p-5 pb-10 text-white lg:block">
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/10 p-4">
          <div className="text-xl font-black leading-tight">Project KPI Manager</div>
          <div className="mt-1 text-sm text-blue-100">V3.8.1b Gantt Schedule Synchronization Fix</div>
          <div className="mt-4 text-xs leading-5 text-slate-300">Next.js + TailwindCSS + Recharts frontend. FastAPI + PostgreSQL/SQLite backend.</div>
        </div>
        <nav className="space-y-1">
          {allowedTabs.map(tab => <button key={tab} onClick={() => { setActive(tab); if(tab === "Audit") loadAudit(); }} className={classNames("w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition", active === tab ? "bg-blue-600 text-white shadow" : "text-slate-200 hover:bg-white/10")}>{tab}</button>)}
        </nav>
      </aside>
      <main className="lg:ml-72">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-black text-slate-900">Project KPI Manager V3.8.1b</h1>
              {isGuest
                ? <div className="text-xs text-slate-500">Chế độ xem: <b>Khách (chỉ xem)</b> · Không cần đăng nhập · Không chỉnh sửa được dữ liệu</div>
                : <div className="text-xs text-slate-500">User: <b>{user.FullName || user.Username}</b> · Access: <b>{user.AccessRole || user.Role}</b> · Scope: <b>{user.ProjectScope || "-"}</b></div>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={classNames(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold",
                backendStatus === "online" && "border-green-300 bg-green-50 text-green-700",
                backendStatus === "offline" && "border-red-300 bg-red-50 text-red-700",
                backendStatus === "checking" && "border-amber-300 bg-amber-50 text-amber-700"
              )}>
                <span className={classNames(
                  "mr-2 h-2 w-2 rounded-full",
                  backendStatus === "online" && "bg-green-500",
                  backendStatus === "offline" && "bg-red-500",
                  backendStatus === "checking" && "bg-amber-500"
                )}></span>
                Backend: {backendStatus === "online" ? `Online · ${backendHealth?.database_url_kind || "Connected"}` : backendStatus === "offline" ? "Offline" : "Checking"}
              </span>
              <button className="btn" onClick={checkBackend}>{backendStatus === "offline" ? "Retry Backend" : "Check Backend"}</button>
              {user.Role === "Admin" && <button className="btn" onClick={initDb}>Initialize DB</button>}
              {user.Role === "Admin" && <button className="btn" onClick={importDemo}>Import Demo Excel</button>}
              {user.Role === "Admin" && <label className="btn cursor-pointer">Upload Excel<input className="hidden" type="file" accept=".xlsx,.xlsm" onChange={uploadExcel} /></label>}
              {!isGuest && !["Employee"].includes(user.Role) && <button className="btn-primary" onClick={calculate}>Calculate KPI</button>}
              <button className="btn" onClick={openExcelReport}>Export Excel</button>
              {user.Role === "Admin" && <button className="btn" onClick={backupDb}>Backup DB</button>}
              {user.Role === "Admin" && <button className="btn-danger" onClick={clearDb}>Clear DB</button>}
              {allowedTabs.includes("Collaboration") && <button className="btn" onClick={() => setActive("Collaboration")}>
                Notifications {notificationCount > 0 ? `(${notificationCount})` : ""}
              </button>}
              {isGuest
                ? <button className="btn-primary" onClick={() => setShowLogin(true)}>Đăng nhập để chỉnh sửa</button>
                : <>
                    <button className="btn" onClick={changeOwnPassword}>Change Password</button>
                    <button className="btn" onClick={logout}>Logout</button>
                  </>}
            </div>
          </div>
          {isGuest && <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Bạn đang xem ở chế độ khách: chỉ xem, không chỉnh sửa được. Muốn cập nhật dữ liệu, bấm “Đăng nhập để chỉnh sửa”.</div>}
          {msg && <div className="mt-2 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{msg}</div>}
        </header>
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          {allowedTabs.map(tab => <button key={tab} className={classNames("btn whitespace-nowrap", active === tab && "bg-blue-600 text-white")} onClick={() => setActive(tab)}>{tab}</button>)}
        </div>
        <div className="p-4 lg:p-8">
          {active === "Dashboard" && <Dashboard data={dashboard} />}
          {active === "Analytics" && <Analytics tasks={tasks} projects={projects} employees={employees} projectKpi={projectKpi} risk={risk} />}
          {active === "Planning" && <Planning api={api} user={user} projects={projects} tasks={tasks} />}
          {active === "Tasks" && <Tasks tasks={visibleTasks} allTasks={tasks} projects={projects} employees={employees} filters={filters} setFilters={setFilters} saveTask={(row)=>saveGeneric("tasks", row)} deleteTask={deleteTask} user={user} />}
          {active === "Workflow" && <Workflow tasks={tasks} employees={employees} workflow={workflow} setWorkflow={setWorkflow} runWorkflow={runWorkflow} history={history} allHistory={allHistory} loadHistory={loadHistory} loadAllHistory={loadAllHistory} user={user} />}
          {active === "Collaboration" && <Collaboration api={api} user={user} tasks={tasks} employees={employees} projects={projects} onNotificationCountChange={setNotificationCount} />}
          {active === "Feedback" && <PilotFeedback api={api} user={user} activeTab={active} />}
          {active === "Employees" && <Crud title="Employees" rows={employees} columns={["EmployeeID","EmployeeName","Department","Position","Role","StandardCapacityWeight","Active"]} onSave={(r)=>saveGeneric("employees", r)} readOnly={!canEditMaster(user)} />}
          {active === "Projects" && <Crud title="Projects" rows={projects} columns={["ProjectID","ProjectName","Client","ProjectType","StartDate","EndDate","Status"]} onSave={(r)=>saveGeneric("projects", r)} readOnly={!canEditMaster(user)} />}
          {active === "KPI" && <TableCard title="Employee KPI" rows={kpi} />}
          {active === "Project KPI" && <TableCard title="Project KPI" rows={projectKpi} />}
          {active === "Progress" && <Progress rows={visibleTasks} projects={projects} employees={employees} filters={filters} setFilters={setFilters} />}
          {active === "Quality" && <Quality rows={tasks} />}
          {active === "Workload" && <Workload rows={workload} api={api} projects={projects} employees={employees} tasks={tasks} user={user} />}
          {active === "Risk" && <Risk rows={risk} projectRisk={dashboard.projectRisk || []} projects={projects} />}
          {active === "Reports" && <Reports api={api} user={user} projects={projects} backupDb={backupDb} />}
          {active === "Enterprise Data" && <EnterpriseData api={api} user={user} />}
          {active === "Validation" && <Validation rows={validation} runValidation={runValidation} />}
          {active === "Audit" && <TableCard title="Audit Trail" rows={audit} />}
          {active === "Administration" && <Administration api={api} currentUser={user} employees={employees} />}
          {active === "Database" && <Database
            info={dbInfo}
            safety={dbSafety}
            backups={dbBackups}
            integrity={dbIntegrity}
            verifyDb={verifyDb}
            initDb={initDb}
            clearDb={clearDb}
            uploadExcel={uploadExcel}
            importDemo={importDemo}
            saveCurrentData={saveCurrentData}
            loadFromDatabase={loadFromDatabase}
            backupDb={backupDb}
            restoreDatabaseUpload={restoreDatabaseUpload}
            restoreServerBackup={restoreServerBackup}
            downloadServerBackup={downloadServerBackup}
            checkDbIntegrity={checkDbIntegrity}
            loadDbSafety={loadDbSafety}
            legacyBackupDb={legacyBackupDb}
            showDatabaseLocation={showDatabaseLocation}
            openDatabaseFolder={openDatabaseFolder}
          />}
          {active === "Settings" && <Settings rows={settingsRows} loadSettings={loadSettings} saveSetting={saveSetting} />}
        </div>
      </main>
    </div>
  );
}

function Login({ login, setLogin, doLogin, backendStatus, backendHealth, probeBackend, loginError, loginBusy, onBack }) {
  const online = backendStatus === "online";
  const offline = backendStatus === "offline";

  return <div className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 p-6">
    <div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-white/95 p-8 shadow-2xl">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
        <div>
          <div className="pill mb-4">V3.8.1b Gantt Schedule Synchronization Fix</div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950">Project KPI Manager</h1>
          <p className="mt-4 text-slate-600">Bản chuyên nghiệp dùng React/Next.js, TailwindCSS, Recharts, FastAPI và PostgreSQL. Bản Staff Pilot dùng React/Next.js, FastAPI và PostgreSQL để kiểm thử nhiều người dùng trước khi productization.</p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-sm text-slate-600">
            <Feature>Role-based access</Feature><Feature>Workflow approval</Feature><Feature>PostgreSQL ready</Feature><Feature>Executive dashboard</Feature>
          </div>
        </div>

        <div className="card p-5">
          <div className={classNames(
            "mb-4 rounded-xl border px-3 py-3 text-xs",
            online && "border-green-200 bg-green-50 text-green-800",
            offline && "border-red-200 bg-red-50 text-red-800",
            backendStatus === "checking" && "border-amber-200 bg-amber-50 text-amber-800"
          )}>
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold">
                Backend: {online ? "Online" : offline ? "Offline" : "Checking..."}
              </div>
              <button className="btn" onClick={() => probeBackend(false)}>Retry Connection</button>
            </div>
            {online && (
              <div className="mt-2 leading-5">
                Database: <b>{backendHealth?.database_url_kind || "-"}</b>
                {" · "}Tables: <b>{backendHealth?.tables ?? "-"}</b>
              </div>
            )}
            {offline && (
              <div className="mt-2 leading-5">
                Start the application with <b>START_PROJECT_KPI_MANAGER.bat</b> or start FastAPI on port 8000.
              </div>
            )}
          </div>

          {loginError && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-3 py-3 text-xs leading-5 text-red-800">
              <div className="font-black">{loginError.status ? `Login failed · HTTP ${loginError.status}` : "Login connection error"}</div>
              <div className="mt-1">{loginError.message}</div>
              <button className="btn mt-2" onClick={() => probeBackend(false)}>Retry Backend Check</button>
            </div>
          )}
          <label className="label">Username</label>
          <input className="input mt-1" value={login.username} onChange={e=>setLogin({...login, username:e.target.value})} onKeyDown={e=>{ if(e.key === "Enter" && !loginBusy) doLogin(); }} />
          <label className="label mt-4 block">Password</label>
          <input className="input mt-1" type="password" value={login.password} onChange={e=>setLogin({...login, password:e.target.value})} onKeyDown={e=>{ if(e.key === "Enter" && !loginBusy) doLogin(); }} />
          <button className="btn-primary mt-5 w-full" disabled={loginBusy} onClick={doLogin}>{loginBusy ? "Signing in..." : "Login"}</button>
          {onBack && <button className="btn mt-3 w-full" onClick={onBack}>← Quay lại xem (không cần đăng nhập)</button>}
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">Phần mềm yêu cầu kết nối database với home server. Liên hệ với admin (quynm@portlogistics.vn) để được hướng dẫn truy cập.</div>
        </div>
      </div>
    </div>
  </div>;
}
function Feature({children}) { return <div className="rounded-2xl border border-slate-200 bg-white p-3 font-semibold">{children}</div>; }
function canEditMaster(user) { return ["Admin", "Manager", "Project Manager"].includes(user?.Role); }

function Dashboard({ data }) {
  const c = data.cards || {};
  const kpiData = (data.employeeKpi || []).slice(0, 12).map(x => ({ name: x.EmployeeName || x.EmployeeID, kpi: Number(x.KPI_Total || 0) }));
  const statusData = data.statusData || [];
  const cards = [
    ["Employees", c.employees || 0], ["Projects", c.projects || 0], ["Tasks", c.tasks || 0], ["Average KPI", c.avgKpi || 0],
    ["Completed", c.completed || 0], ["Delayed", c.delayed || 0], ["At risk", c.atRisk || 0], ["Normal", c.normal || 0], ["Avg progress", `${c.avgProgress || 0}%`]
  ];
  return <div className="space-y-6">
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">{cards.map(([l,v])=><div key={l} className="card p-5"><div className="text-3xl font-black text-slate-950">{v}</div><div className="mt-1 text-sm font-medium text-slate-500">{l}</div></div>)}</div>
    <div className="grid gap-6 xl:grid-cols-2">
      <ChartCard title="KPI theo nhân viên"><ResponsiveContainer width="100%" height={300}><BarChart data={kpiData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name" angle={-18} textAnchor="end" height={70}/><YAxis/><Tooltip/><Bar dataKey="kpi" fill="#0b73d9" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></ChartCard>
      <ChartCard title="Cơ cấu trạng thái task"><ResponsiveContainer width="100%" height={300}><PieChart><Pie data={statusData} dataKey="value" nameKey="name" outerRadius={95} label>{statusData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer></ChartCard>
    </div>
  </div>;
}



function planningDate(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const d = new Date(Date.UTC(y, month - 1, day));
  if (
    d.getUTCFullYear() !== y ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) return null;
  return d;
}

function planningDaysBetween(a, b) {
  const x = planningDate(a), y = planningDate(b);
  if (!x || !y) return 0;
  return Math.round((y.getTime() - x.getTime()) / 86400000);
}

function planningIsIsoDate(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = planningDate(s);
  return Boolean(d && d.toISOString().slice(0, 10) === s);
}

function planningAutoFinish(startValue, durationValue, taskTypeValue = "Task") {
  const start = planningDate(startValue);
  if (!start) return "";
  const isMilestone = String(taskTypeValue || "").toLowerCase() === "milestone";
  const durationRaw = Number(durationValue);
  const duration = isMilestone
    ? 0
    : (Number.isFinite(durationRaw) && Number.isInteger(durationRaw) && durationRaw >= 1 ? durationRaw : null);
  if (duration === null) return "";
  const daysToAdd = isMilestone ? 0 : duration - 1;
  const finish = new Date(start.getTime());
  finish.setUTCDate(finish.getUTCDate() + daysToAdd);
  return finish.toISOString().slice(0, 10);
}

function planningRangeError(startValue, finishValue, label) {
  const s = String(startValue || "").trim();
  const f = String(finishValue || "").trim();
  if (s && !planningIsIsoDate(s)) return `${label} start must use YYYY-MM-DD.`;
  if (f && !planningIsIsoDate(f)) return `${label} finish must use YYYY-MM-DD.`;
  if (s && f && planningDate(f) < planningDate(s)) return `${label} finish cannot be earlier than ${label.toLowerCase()} start.`;
  return "";
}

function planningWbsKey(code) {
  return String(code || "").split(".").map(x => {
    const n = Number(x);
    return Number.isFinite(n) ? [0, n] : [1, x];
  });
}

function comparePlanningWbs(a, b) {
  const aa = planningWbsKey(a), bb = planningWbsKey(b);
  const n = Math.max(aa.length, bb.length);
  for (let i = 0; i < n; i++) {
    const x = aa[i] || [0, -1], y = bb[i] || [0, -1];
    if (x[0] !== y[0]) return x[0] - y[0];
    if (x[1] < y[1]) return -1;
    if (x[1] > y[1]) return 1;
  }
  return 0;
}

function Planning({ api, user, projects, tasks }) {
  const availableProjects = useMemo(() => {
    const taskProjects = new Set((tasks || []).map(t => String(t.ProjectID || "")).filter(Boolean));
    return (projects || []).filter(p => taskProjects.has(String(p.ProjectID || "")));
  }, [projects, tasks]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState({ rows: [], dependencies: [], calculate: null, editable: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [planForm, setPlanForm] = useState({});
  const [depForm, setDepForm] = useState({ predecessor_task_id: "", successor_task_id: "", dependency_type: "FS", lag_days: 0, note: "" });
  const planningLoadSeq = useRef(0);

  useEffect(() => {
    if (!projectId && availableProjects.length) setProjectId(String(availableProjects[0].ProjectID));
    if (projectId && availableProjects.length && !availableProjects.some(p => String(p.ProjectID) === String(projectId))) {
      setProjectId(String(availableProjects[0].ProjectID));
    }
  }, [availableProjects, projectId]);

  async function loadPlanning(pid = projectId) {
    if (!pid) return;
    const seq = ++planningLoadSeq.current;
    setLoading(true);
    try {
      const r = await api(`/planning/${encodeURIComponent(pid)}`);
      if (seq !== planningLoadSeq.current) return;
      setData(r);
      setMessage(r.calculate?.ok === false
        ? `Schedule review required for ${pid}: ${r.calculate?.error || "Unknown error"}`
        : `Planning data loaded for ${pid}.`);
      const first = (r.rows || [])[0];
      setPlanForm(first || {});
      const taskIds = (r.rows || []).map(x => String(x.TaskID || ""));
      setDepForm(v => ({
        ...v,
        predecessor_task_id: taskIds.includes(v.predecessor_task_id) ? v.predecessor_task_id : (taskIds[0] || ""),
        successor_task_id: taskIds.includes(v.successor_task_id) ? v.successor_task_id : (taskIds[1] || taskIds[0] || "")
      }));
    } catch (e) {
      if (seq !== planningLoadSeq.current) return;
      setMessage(`Planning error for ${pid}: ${e.message}`);
    } finally {
      if (seq === planningLoadSeq.current) setLoading(false);
    }
  }

  useEffect(() => { if (projectId) loadPlanning(projectId); }, [projectId]);

  async function calculateCpm() {
    if (!projectId) return;
    setLoading(true);
    try {
      const r = await api(`/planning/calculate/${encodeURIComponent(projectId)}`, { method: "POST" });
      setMessage(`CPM calculated. Critical tasks: ${r.summary?.CriticalTaskCount ?? 0}.`);
      await loadPlanning(projectId);
    } catch (e) { alert(`CPM calculation error: ${e.message}`); }
    finally { setLoading(false); }
  }

  async function initializePlanning() {
    const r = await api("/planning/initialize", { method: "POST", body: JSON.stringify({ project_id: projectId }) });
    setMessage(r.message || "Planning initialized.");
    await loadPlanning(projectId);
  }

  async function createDemoChain() {
    if (!confirm("Create a demo Finish-to-Start chain from the current WBS order? This is a demonstration assumption and should be reviewed before real project use.")) return;
    try {
      const r = await api(`/planning/demo-chain/${encodeURIComponent(projectId)}`, { method: "POST" });
      setMessage(`Demo dependencies added: ${r.dependencies_added || 0}`);
      await loadPlanning(projectId);
    } catch (e) { alert(`Demo chain error: ${e.message}`); }
  }

  async function savePlan() {
    if (!planForm.TaskID) return alert("Select a WBS task first.");

    const taskType = String(planForm.TaskType || "Task");
    const isMilestone = taskType.toLowerCase() === "milestone";
    const durationRaw = Number(planForm.DurationDays);
    const duration = isMilestone ? 0 : durationRaw;

    if (!isMilestone && (!Number.isFinite(duration) || !Number.isInteger(duration) || duration < 1)) {
      return alert("DurationDays must be a positive whole number for a Task.");
    }
    if (!planningIsIsoDate(planForm.PlannedStart)) {
      return alert("PlannedStart is required and must use YYYY-MM-DD.");
    }

    const plannedFinish = planningAutoFinish(planForm.PlannedStart, duration, taskType);
    if (!plannedFinish) return alert("Unable to calculate PlannedFinish from PlannedStart and DurationDays.");

    const baselineError = planningRangeError(planForm.BaselineStart, planForm.BaselineFinish, "Baseline");
    if (baselineError) return alert(baselineError);

    const actualError = planningRangeError(planForm.ActualStart, planForm.ActualFinish, "Actual");
    if (actualError) return alert(actualError);

    if (String(planForm.ActualFinish || "").trim() && !String(planForm.ActualStart || "").trim()) {
      return alert("ActualStart is required when ActualFinish is entered.");
    }

    const payload = {
      ...planForm,
      TaskType: taskType,
      DurationDays: duration,
      PlannedStart: String(planForm.PlannedStart).trim(),
      PlannedFinish: plannedFinish
    };

    try {
      await api("/planning/save-task", { method: "POST", body: JSON.stringify({ data: payload }) });
      setPlanForm(payload);
      setMessage(`Planning data saved for ${planForm.TaskID}. PlannedFinish auto-calculated as ${plannedFinish}.`);
      await loadPlanning(projectId);
    } catch (e) { alert(`Save planning task error: ${e.message}`); }
  }

  async function addDependency() {
    if (!depForm.predecessor_task_id || !depForm.successor_task_id) return alert("Select predecessor and successor tasks.");
    try {
      await api("/planning/dependencies", {
        method: "POST",
        body: JSON.stringify({ project_id: projectId, ...depForm, lag_days: Number(depForm.lag_days || 0) })
      });
      setMessage("Dependency added and CPM recalculated.");
      await loadPlanning(projectId);
    } catch (e) { alert(`Add dependency error: ${e.message}`); }
  }

  async function deleteDependency(id) {
    if (!confirm(`Delete dependency ${id}?`)) return;
    try {
      await api(`/planning/dependencies/${encodeURIComponent(id)}`, { method: "DELETE" });
      setMessage(`Dependency ${id} deleted.`);
      await loadPlanning(projectId);
    } catch (e) { alert(`Delete dependency error: ${e.message}`); }
  }

  const rows = useMemo(() => [...(data.rows || [])].sort((a,b) => comparePlanningWbs(a.WBSCode,b.WBSCode)), [data.rows]);
  const taskMap = useMemo(() => new Map(rows.map(r => [String(r.TaskID), r])), [rows]);
  const summary = data.calculate?.summary || {};
  const schedule = data.calculate?.schedule || [];
  const editable = Boolean(data.editable);
  const autoPlannedFinish = planningAutoFinish(planForm.PlannedStart, planForm.DurationDays, planForm.TaskType || "Task");

  const gantt = useMemo(() => {
    const usable = rows.filter(r => r.CPMStart && r.CPMFinish);
    if (!usable.length) return { rows: [], start: null, end: null, total: 1 };
    const dates = [];
    usable.forEach(r => {
      [r.BaselineStart, r.BaselineFinish, r.CPMStart, r.CPMFinish].forEach(v => { const d = planningDate(v); if (d) dates.push(d); });
    });
    if (!dates.length) return { rows: [], start: null, end: null, total: 1 };
    const start = new Date(Math.min(...dates.map(d => d.getTime())));
    const end = new Date(Math.max(...dates.map(d => d.getTime())));
    const total = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
    const withPos = usable.map(r => {
      const baseS = planningDate(r.BaselineStart), baseF = planningDate(r.BaselineFinish);
      const cpmS = planningDate(r.CPMStart), cpmF = planningDate(r.CPMFinish);
      const offset = d => d ? Math.max(0, Math.round((d.getTime() - start.getTime()) / 86400000)) : 0;
      const width = (a,b) => a && b ? Math.max(1, Math.round((b.getTime()-a.getTime())/86400000)+1) : 1;
      return {
        ...r,
        baseLeft: 100 * offset(baseS) / total,
        baseWidth: 100 * width(baseS,baseF) / total,
        cpmLeft: 100 * offset(cpmS) / total,
        cpmWidth: 100 * width(cpmS,cpmF) / total,
      };
    });
    return { rows: withPos, start, end, total };
  }, [rows]);

  const projectName = availableProjects.find(p => String(p.ProjectID) === String(projectId))?.ProjectName || "";
  const cards = [
    ["Tasks", summary.TaskCount ?? rows.length],
    ["Dependencies", summary.DependencyCount ?? (data.dependencies || []).length],
    ["Critical Tasks", summary.CriticalTaskCount ?? 0],
    ["Project Duration", summary.ProjectDurationDays ? `${summary.ProjectDurationDays} d` : "N/A"],
    ["CPM Finish", summary.CPMProjectFinish || "N/A"],
    ["Baseline Finish", summary.BaselineProjectFinish || "N/A"],
    ["Variance", summary.ProjectVarianceDays === "" || summary.ProjectVarianceDays === undefined ? "N/A" : `${summary.ProjectVarianceDays} d`],
    ["Mode", editable ? "Edit" : "Read only"],
  ];

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.3.0d Project Planning</div>
          <h2 className="text-2xl font-black text-slate-950">WBS · Gantt · Dependencies · Critical Path</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">Calendar-day CPM. Supports Finish-to-Start (FS), Start-to-Start (SS), Finish-to-Finish (FF), Start-to-Finish (SF), positive/negative lag, baseline comparison and role-based editing.</p>
        </div>
        <div className="w-full sm:w-[440px]">
          <label className="label">Project</label>
          <select className="input mt-1" value={projectId} onChange={e => {
            const nextProject = e.target.value;
            planningLoadSeq.current += 1;
            setProjectId(nextProject);
            setPlanForm({});
            setData({ rows: [], dependencies: [], calculate: null, editable: false });
            setMessage(`Loading planning data for ${nextProject}...`);
          }}>
            {availableProjects.map(p => <option key={p.ProjectID} value={p.ProjectID}>{p.ProjectID} — {p.ProjectName}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" onClick={calculateCpm} disabled={loading || !projectId}>{loading ? "Working..." : "Calculate CPM"}</button>
        <button className="btn" onClick={() => loadPlanning(projectId)} disabled={loading}>Refresh</button>
        {editable && <button className="btn" onClick={initializePlanning}>Sync Schedule from Tasks</button>}
      </div>
      {message && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">{message}</div>}
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label,value]) => <div key={label} className="card p-5"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-slate-950">{value}</div></div>)}
    </div>

    <div className="card p-5">
      <div className="text-xs font-black uppercase tracking-wide text-red-600">Critical Path — {projectId} {projectName && `· ${projectName}`}</div>
      <div className="mt-2 break-words text-lg font-black text-slate-950">{summary.CriticalPathText || "No connected critical path yet. Add/review dependencies and Calculate CPM."}</div>
      <div className="mt-2 text-xs text-slate-500">A task is critical when Total Float = 0. V3.8.1b uses real TaskDependencies only; legacy demo FS-chain dependencies are removed automatically.</div>
    </div>

    <div className="card overflow-hidden">
      <div className="border-b border-slate-200 p-4">
        <h3 className="text-lg font-black">Gantt — {projectId}{projectName ? ` · ${projectName}` : ""} — Baseline vs CPM Schedule</h3>
        <div className="mt-1 text-xs text-slate-500">Baseline = gray · CPM normal = blue · CPM critical = red. Timeline uses calendar days.</div>
        <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">Project: {projectId || "-"}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">Tasks: {gantt.rows.length ? `${gantt.rows[0].TaskID} → ${gantt.rows[gantt.rows.length - 1].TaskID}` : "-"}</span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">Range: {gantt.start ? gantt.start.toISOString().slice(0,10) : "-"} → {gantt.end ? gantt.end.toISOString().slice(0,10) : "-"}</span>
        </div>
        <div className="mt-2 text-xs text-amber-700">V3.8.1b source synchronization: gray baseline is taken directly from Tasks.StartDate → Tasks.DueDate. CPM bars use the same task duration and are shifted only by real TaskDependencies.</div>
      </div>
      <div className="max-h-[620px] overflow-auto">
        {gantt.rows.length ? <div key={projectId} className="min-w-[1100px]">
          <div className="sticky top-0 z-[1] grid grid-cols-[110px_300px_1fr] border-b bg-slate-50 text-xs font-black text-slate-600">
            <div className="p-3">WBS</div><div className="p-3">Task</div>
            <div className="flex justify-between p-3"><span>{gantt.start?.toISOString().slice(0,10)}</span><span>{gantt.end?.toISOString().slice(0,10)}</span></div>
          </div>
          {gantt.rows.map(r => <div key={r.TaskID} className="grid grid-cols-[110px_300px_1fr] border-b border-slate-100 text-xs">
            <div className="p-3 font-bold">{r.WBSCode}</div>
            <div className="p-3"><div className="font-bold text-slate-900">{r.TaskID} · {r.TaskName}</div><div className="mt-1 text-slate-500">Input {r.BaselineStart || "-"} → {r.BaselineFinish || "-"} · CPM {r.CPMStart || "-"} → {r.CPMFinish || "-"} · TF {r.TotalFloat ?? "-"}</div></div>
            <div className="relative m-3 h-10 rounded-lg bg-slate-100">
              {r.BaselineStart && r.BaselineFinish && <div className="absolute top-1 h-3 rounded bg-slate-400" style={{ left: `${r.baseLeft}%`, width: `${Math.max(r.baseWidth,0.7)}%` }} title={`Baseline ${r.BaselineStart} → ${r.BaselineFinish}`}></div>}
              <div className={classNames("absolute bottom-1 h-4 rounded", Number(r.IsCritical) === 1 ? "bg-red-500" : "bg-blue-600")} style={{ left: `${r.cpmLeft}%`, width: `${Math.max(r.cpmWidth,0.7)}%` }} title={`CPM ${r.CPMStart} → ${r.CPMFinish}`}></div>
            </div>
          </div>)}
        </div> : <div className="p-8 text-sm text-slate-500">No calculated schedule. Click Calculate CPM.</div>}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4"><h3 className="text-lg font-black">WBS / Planning Table</h3><div className="text-xs text-slate-500">Click a row to edit its planning fields.</div></div>
        <div className="max-h-[620px] overflow-auto"><table className="min-w-full"><thead><tr>{["WBS","Task","Type","Duration","Planned","Baseline","CPM","TF","Critical","Status"].map(x=><th key={x} className="th">{x}</th>)}</tr></thead><tbody>
          {rows.map(r => <tr key={r.TaskID} className="cursor-pointer hover:bg-blue-50" onClick={() => setPlanForm(r)}>
            <td className="td font-bold">{r.WBSCode}</td><td className="td"><b>{r.TaskID}</b><div className="max-w-[260px] whitespace-normal text-xs text-slate-500">{r.TaskName}</div></td><td className="td">{r.TaskType}</td><td className="td">{r.DurationDays}</td><td className="td">{r.PlannedStart}<br/>{r.PlannedFinish}</td><td className="td">{r.BaselineStart}<br/>{r.BaselineFinish}</td><td className="td">{r.CPMStart}<br/>{r.CPMFinish}</td><td className="td font-bold">{r.TotalFloat}</td><td className="td">{Number(r.IsCritical) === 1 ? <span className="rounded-full bg-red-100 px-2 py-1 font-bold text-red-700">Critical</span> : <span className="rounded-full bg-green-100 px-2 py-1 font-bold text-green-700">No</span>}</td><td className="td">{r.ScheduleStatus}</td>
          </tr>)}
        </tbody></table></div>
      </div>

      <div className="card p-5">
        <h3 className="text-lg font-black">Planning Task Editor</h3><div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">V3.8.1b: schedule dates are synchronized from Tasks.StartDate and Tasks.DueDate. Edit operational dates in Tasks/Excel, then use Sync Schedule from Tasks. WBS, hierarchy and actual dates remain editable here.</div>
        {!planForm.TaskID ? <div className="mt-4 text-sm text-slate-500">Select a WBS row.</div> : <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="TaskID" value={planForm.TaskID || ""} onChange={()=>{}} />
          <Field label="WBSCode" value={planForm.WBSCode || ""} onChange={v=>setPlanForm({...planForm,WBSCode:v})}/>
          <div><label className="label">TaskType</label><select className="input mt-1" value={planForm.TaskType || "Task"} onChange={e=>{
            const nextType = e.target.value;
            const nextDuration = nextType === "Milestone" ? 0 : Math.max(1, Number(planForm.DurationDays || 1));
            setPlanForm({...planForm, TaskType: nextType, DurationDays: nextDuration});
          }}><option>Task</option><option>Milestone</option></select></div>
          <Field label="ParentTaskID" value={planForm.ParentTaskID || ""} onChange={v=>setPlanForm({...planForm,ParentTaskID:v})}/>
          <div>
            <label className="label">DurationDays</label>
            <input
              className="input mt-1 cursor-not-allowed bg-slate-100"
              type="number"
              readOnly
              value={planForm.DurationDays ?? ""}
            />
            <div className="mt-1 text-[11px] text-slate-500">Synchronized from Tasks.StartDate → Tasks.DueDate using inclusive calendar days.</div>
          </div>
          <div>
            <label className="label">PlannedStart — from Tasks</label>
            <input className="input mt-1 cursor-not-allowed bg-slate-100" type="date" readOnly value={planForm.PlannedStart || ""}/>
            <div className="mt-1 text-[11px] text-slate-500">Synchronized from Tasks.StartDate.</div>
          </div>
          <div>
            <label className="label">PlannedFinish — from Tasks</label>
            <input className="input mt-1 cursor-not-allowed bg-slate-100 font-semibold text-slate-700" readOnly value={planForm.PlannedFinish || autoPlannedFinish || ""}/>
            <div className="mt-1 text-[11px] font-semibold text-blue-700">Synchronized from Tasks.DueDate. Manual editing is disabled here.</div>
          </div>
          <div><label className="label">BaselineStart — from Tasks</label><input className="input mt-1 cursor-not-allowed bg-slate-100" type="date" readOnly value={planForm.BaselineStart || ""}/></div>
          <div><label className="label">BaselineFinish — from Tasks</label><input className="input mt-1 cursor-not-allowed bg-slate-100" type="date" readOnly value={planForm.BaselineFinish || ""}/></div>
          <div><label className="label">ActualStart</label><input className="input mt-1" type="date" value={planForm.ActualStart || ""} onChange={e=>setPlanForm({...planForm,ActualStart:e.target.value})}/></div>
          <div><label className="label">ActualFinish</label><input className="input mt-1" type="date" value={planForm.ActualFinish || ""} onChange={e=>setPlanForm({...planForm,ActualFinish:e.target.value})}/></div>
        </div>}
        {editable && planForm.TaskID && <div className="mt-4"><button className="btn-primary" onClick={savePlan}>Save Planning Task</button></div>}
        {!editable && <div className="mt-4 rounded-xl bg-slate-100 p-3 text-xs font-semibold text-slate-600">Your role has read-only planning access.</div>}
      </div>
    </div>

    <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
      <div className="card p-5">
        <h3 className="text-lg font-black">Add Dependency</h3>
        <div className="mt-4 grid gap-3">
          <div><label className="label">Predecessor</label><select className="input mt-1" value={depForm.predecessor_task_id} onChange={e=>setDepForm({...depForm,predecessor_task_id:e.target.value})}>{rows.map(r=><option key={r.TaskID} value={r.TaskID}>{r.TaskID} — {r.TaskName}</option>)}</select></div>
          <div><label className="label">Successor</label><select className="input mt-1" value={depForm.successor_task_id} onChange={e=>setDepForm({...depForm,successor_task_id:e.target.value})}>{rows.map(r=><option key={r.TaskID} value={r.TaskID}>{r.TaskID} — {r.TaskName}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3"><div><label className="label">Dependency Type</label><select className="input mt-1" value={depForm.dependency_type} onChange={e=>setDepForm({...depForm,dependency_type:e.target.value})}><option value="FS">FS — Finish to Start</option><option value="SS">SS — Start to Start</option><option value="FF">FF — Finish to Finish</option><option value="SF">SF — Start to Finish</option></select></div><Field label="LagDays" value={depForm.lag_days} onChange={v=>setDepForm({...depForm,lag_days:v})}/></div>
          <Field label="Note" value={depForm.note} onChange={v=>setDepForm({...depForm,note:v})}/>
          {editable && <button className="btn-primary" onClick={addDependency}>Add Dependency</button>}
        </div>
      </div>
      <TableCard title={`Dependencies — ${projectId}`} rows={data.dependencies || []} emptyMessage="No real dependencies have been defined for this project." actions={editable ? (r => <button className="btn-danger" onClick={(e)=>{e.stopPropagation(); deleteDependency(r.DependencyID);}}>Delete</button>) : null}/>
    </div>

    <TableCard title={`CPM Results — ${projectId}`} rows={schedule} emptyMessage="No CPM schedule calculated." cellRenderers={{
      IsCritical: v => Number(v) === 1 ? <span className="rounded-full bg-red-100 px-2 py-1 font-bold text-red-700">Critical</span> : <span className="text-slate-500">No</span>,
      TotalFloat: v => <span className={Number(v) === 0 ? "font-black text-red-700" : "font-bold text-slate-800"}>{String(v ?? "")}</span>,
      ScheduleVarianceDays: v => <span className={Number(v) > 0 ? "font-black text-red-700" : Number(v) < 0 ? "font-bold text-green-700" : "font-bold"}>{String(v ?? "")}</span>
    }}/>
  </div>;
}

function analyticsNullableNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function analyticsNumber(value, fallback = 0) {
  const n = analyticsNullableNumber(value);
  return n === null ? fallback : n;
}

function analyticsMeanOrNull(values) {
  const nums = (values || []).map(analyticsNullableNumber).filter(v => v !== null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

function analyticsMean(values) {
  return analyticsMeanOrNull(values) ?? 0;
}

function analyticsFormat(value, digits = 1, suffix = "") {
  const n = analyticsNullableNumber(value);
  return n === null ? "—" : `${n.toFixed(digits)}${suffix}`;
}

function AnalyticsEmpty({ text }) {
  return <div className="flex h-[340px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm font-semibold text-slate-500">{text}</div>;
}

function analyticsDaysOverdue(task) {
  const status = String(task?.Status || "").toLowerCase();
  if (status === "completed" || Number(task?.ProgressPercent || 0) >= 100) return 0;
  const raw = String(task?.DueDate || "").trim();
  if (!raw) return 0;
  const due = new Date(`${raw}T23:59:59`);
  if (Number.isNaN(due.getTime())) return 0;
  const now = new Date();
  if (due >= now) return 0;
  return Math.max(0, Math.floor((now.getTime() - due.getTime()) / 86400000));
}

function Analytics({ tasks, projects, employees, projectKpi, risk }) {
  const [projectFilter, setProjectFilter] = useState("All");

  const projectOptions = useMemo(() => {
    const map = new Map();
    (projects || []).forEach(p => {
      const id = String(p.ProjectID || "").trim();
      if (id) map.set(id, String(p.ProjectName || "").trim());
    });
    (tasks || []).forEach(t => {
      const id = String(t.ProjectID || "").trim();
      if (id && !map.has(id)) map.set(id, "");
    });
    return Array.from(map.entries())
      .map(([ProjectID, ProjectName]) => ({ ProjectID, ProjectName }))
      .sort((a, b) => a.ProjectID.localeCompare(b.ProjectID));
  }, [projects, tasks]);

  useEffect(() => {
    if (projectFilter !== "All" && !projectOptions.some(p => p.ProjectID === projectFilter)) {
      setProjectFilter("All");
    }
  }, [projectFilter, projectOptions]);

  const employeeMap = useMemo(() => {
    const map = new Map();
    (employees || []).forEach(e => map.set(String(e.EmployeeID || ""), e));
    return map;
  }, [employees]);

  const riskMap = useMemo(() => {
    const map = new Map();
    (risk || []).forEach(r => map.set(String(r.TaskID || ""), r));
    return map;
  }, [risk]);

  const selectedTasks = useMemo(() => {
    if (projectFilter === "All") return tasks || [];
    return (tasks || []).filter(t => String(t.ProjectID || "") === String(projectFilter));
  }, [tasks, projectFilter]);

  const selectedRisk = useMemo(() => {
    if (projectFilter === "All") return risk || [];
    return (risk || []).filter(r => String(r.ProjectID || "") === String(projectFilter));
  }, [risk, projectFilter]);

  const selectedProject = projectOptions.find(p => p.ProjectID === projectFilter);
  const projectLabel = projectFilter === "All"
    ? "All Projects"
    : `${projectFilter}${selectedProject?.ProjectName ? ` — ${selectedProject.ProjectName}` : ""}`;

  const projectKpiRow = projectFilter === "All"
    ? null
    : (projectKpi || []).find(r => String(r.ProjectID || "") === String(projectFilter));

  const portfolioKpi = analyticsMeanOrNull((projectKpi || []).map(r => r.ProjectKPI));
  const selectedKpi = projectFilter === "All"
    ? portfolioKpi
    : analyticsNullableNumber(projectKpiRow?.ProjectKPI);
  const kpiVariance = projectFilter === "All" || selectedKpi === null || portfolioKpi === null
    ? null
    : selectedKpi - portfolioKpi;

  const completed = selectedTasks.filter(t =>
    String(t.Status || "").toLowerCase() === "completed" || analyticsNumber(t.ProgressPercent) >= 100
  ).length;
  const delayed = selectedTasks.filter(t =>
    String(t.DeadlineStatus || "").toLowerCase() === "delayed" ||
    String(t.Status || "").toLowerCase() === "delayed" ||
    analyticsDaysOverdue(t) > 0
  ).length;
  const highRisk = selectedRisk.filter(r => ["high", "critical"].includes(String(r.RiskLevel || "").toLowerCase())).length;
  const avgProgress = analyticsMeanOrNull(selectedTasks.map(t => t.ProgressPercent));
  const avgQuality = projectKpiRow
    ? analyticsNullableNumber(projectKpiRow.AverageQuality)
    : analyticsMeanOrNull(selectedTasks.map(t => t.QualityAdjusted ?? t.QualityScore));
  const teamMembers = new Set(selectedTasks.map(t => String(t.AssignedTo || "").trim()).filter(Boolean)).size;

  const coverage = useMemo(() => {
    const selectedTaskIds = new Set(selectedTasks.map(t => String(t.TaskID || "")));
    const risksForSelectedTasks = new Set(selectedRisk.map(r => String(r.TaskID || "")));
    return {
      missingRisk: Array.from(selectedTaskIds).filter(id => id && !risksForSelectedTasks.has(id)).length,
      missingAssignee: selectedTasks.filter(t => !String(t.AssignedTo || "").trim()).length,
      missingDueDate: selectedTasks.filter(t => !String(t.DueDate || "").trim()).length,
      missingProgress: selectedTasks.filter(t => analyticsNullableNumber(t.ProgressPercent) === null).length,
      projectKpiAvailable: projectFilter === "All" ? (projectKpi || []).length > 0 : Boolean(projectKpiRow)
    };
  }, [selectedTasks, selectedRisk, projectFilter, projectKpi, projectKpiRow]);

  const statusData = useMemo(() => {
    const counts = {};
    selectedTasks.forEach(t => {
      const s = String(t.Status || "Unknown").trim() || "Unknown";
      counts[s] = (counts[s] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [selectedTasks]);

  const progressData = useMemo(() => {
    return [...selectedTasks]
      .sort((a, b) => analyticsNumber(a.ProgressPercent) - analyticsNumber(b.ProgressPercent))
      .slice(0, 20)
      .map(t => ({
        task: `${t.TaskID} ${String(t.TaskName || "").slice(0, 24)}`,
        progress: analyticsNumber(t.ProgressPercent)
      }));
  }, [selectedTasks]);

  const riskChartData = useMemo(() => {
    return [...selectedRisk]
      .sort((a, b) => analyticsNumber(b.TaskRiskScore) - analyticsNumber(a.TaskRiskScore))
      .slice(0, 15)
      .map(r => ({
        task: r.TaskID,
        risk: analyticsNumber(r.TaskRiskScore)
      }));
  }, [selectedRisk]);

  const projectComparison = useMemo(() => {
    return [...(projectKpi || [])]
      .filter(r => String(r.ProjectID || "").trim())
      .sort((a, b) => analyticsNumber(b.ProjectKPI, -Infinity) - analyticsNumber(a.ProjectKPI, -Infinity))
      .map(r => ({
        project: r.ProjectID,
        kpi: analyticsNullableNumber(r.ProjectKPI),
        progress: analyticsNullableNumber(r.AverageProgress)
      }));
  }, [projectKpi]);

  const teamRows = useMemo(() => {
    const groups = new Map();
    selectedTasks.forEach(t => {
      const eid = String(t.AssignedTo || "-");
      if (!groups.has(eid)) groups.set(eid, []);
      groups.get(eid).push(t);
    });

    return Array.from(groups.entries()).map(([eid, rows]) => {
      const emp = employeeMap.get(eid) || {};
      const risks = rows.map(t => riskMap.get(String(t.TaskID || ""))).filter(Boolean);
      return {
        EmployeeID: eid,
        EmployeeName: emp.EmployeeName || eid,
        TaskCount: rows.length,
        Completed: rows.filter(t => String(t.Status || "").toLowerCase() === "completed" || analyticsNumber(t.ProgressPercent) >= 100).length,
        Delayed: rows.filter(t => String(t.DeadlineStatus || "").toLowerCase() === "delayed" || analyticsDaysOverdue(t) > 0).length,
        AvgProgress: analyticsFormat(analyticsMeanOrNull(rows.map(t => t.ProgressPercent)), 2),
        AvgRisk: analyticsFormat(analyticsMeanOrNull(risks.map(r => r.TaskRiskScore)), 2)
      };
    }).sort((a, b) => b.TaskCount - a.TaskCount || analyticsNumber(b.AvgRisk, -1) - analyticsNumber(a.AvgRisk, -1));
  }, [selectedTasks, employeeMap, riskMap]);

  const attentionRows = useMemo(() => {
    return selectedTasks.map(t => {
      const rr = riskMap.get(String(t.TaskID || "")) || {};
      const progressValue = analyticsNullableNumber(t.ProgressPercent);
      const progress = progressValue ?? 0;
      const days = analyticsDaysOverdue(t);
      const reasons = [];
      const riskLevel = String(rr.RiskLevel || "").toLowerCase();
      if (days > 0 || String(t.DeadlineStatus || "").toLowerCase() === "delayed") reasons.push("Delayed");
      if (riskLevel === "critical") reasons.push("Critical risk");
      else if (riskLevel === "high") reasons.push("High risk");
      else if (riskLevel === "medium") reasons.push("Medium risk");
      if (progressValue === null) reasons.push("Missing progress");
      else if (progress < 50) reasons.push("Low progress");
      if (String(t.Status || "").toLowerCase() === "need revision") reasons.push("Need revision");

      return {
        TaskID: t.TaskID,
        ProjectID: t.ProjectID,
        TaskName: t.TaskName,
        AssignedTo: t.AssignedTo,
        Status: t.Status,
        ProgressPercent: progress,
        DueDate: t.DueDate,
        DaysOverdue: days,
        RiskLevel: rr.RiskLevel || "",
        TaskRiskScore: analyticsNumber(rr.TaskRiskScore),
        AttentionReason: reasons.join(", ")
      };
    })
    .filter(r => r.AttentionReason)
    .sort((a, b) =>
      (b.DaysOverdue > 0 ? 1 : 0) - (a.DaysOverdue > 0 ? 1 : 0) ||
      b.TaskRiskScore - a.TaskRiskScore ||
      a.ProgressPercent - b.ProgressPercent
    )
    .slice(0, 25);
  }, [selectedTasks, riskMap]);

  const heatmapRows = useMemo(() => {
    return [...selectedRisk]
      .sort((a, b) => analyticsNumber(b.TaskRiskScore) - analyticsNumber(a.TaskRiskScore))
      .slice(0, 25)
      .map(r => {
        const task = selectedTasks.find(t => String(t.TaskID) === String(r.TaskID)) || {};
        return {
          TaskID: r.TaskID,
          TaskName: task.TaskName || "",
          DelayRisk: analyticsNumber(r.DelayRiskScore),
          LowProgressRisk: analyticsNumber(r.LowProgressRiskScore),
          QualityRisk: analyticsNumber(r.QualityRiskScore),
          WorkloadRisk: analyticsNumber(r.WorkloadRiskScore),
          TotalRisk: analyticsNumber(r.TaskRiskScore),
          RiskLevel: r.RiskLevel || ""
        };
      });
  }, [selectedRisk, selectedTasks]);

  function exportAttentionCsv() {
    const rows = attentionRows;
    if (!rows.length) {
      alert("No management-attention rows to export for the selected project.");
      return;
    }
    const cols = Object.keys(rows[0]);
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [cols.join(","), ...rows.map(r => cols.map(c => esc(r[c])).join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = `project_analytics_attention_v330_${projectFilter === "All" ? "portfolio" : projectFilter}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const scoreCell = value => {
    const n = analyticsNullableNumber(value);
    if (n === null) return <span className="inline-flex min-w-[56px] justify-center rounded-full border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">N/A</span>;
    const cls = n >= 60
      ? "bg-red-100 text-red-800 border-red-300"
      : n >= 35
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : "bg-green-100 text-green-800 border-green-300";
    return <span className={`inline-flex min-w-[56px] justify-center rounded-full border px-2 py-1 text-xs font-bold ${cls}`}>{n.toFixed(1)}</span>;
  };

  const riskLevelCell = value => {
    const key = String(value || "").toLowerCase();
    const cls = key === "critical"
      ? "bg-red-200 text-red-950 border-red-500"
      : key === "high"
      ? "bg-red-100 text-red-800 border-red-300"
      : key === "medium"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : key === "low"
      ? "bg-green-100 text-green-800 border-green-300"
      : "bg-slate-100 text-slate-700 border-slate-300";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{String(value || "-")}</span>;
  };

  const cards = [
    ["Tasks", selectedTasks.length],
    ["Completed", completed],
    ["Delayed", delayed],
    ["High/Critical Risk", highRisk],
    ["Avg Progress", analyticsFormat(avgProgress, 1, "%")],
    ["Avg Quality", analyticsFormat(avgQuality, 1)],
    [projectFilter === "All" ? "Portfolio KPI" : "Project KPI", analyticsFormat(selectedKpi, 2)],
    ["Team Members", teamMembers]
  ];

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.2.1 Project Management Analytics</div>
          <h2 className="text-2xl font-black text-slate-950">Project Management Analytics</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            Portfolio and project-level analytics combining schedule, progress, quality, risk, project KPI and team allocation.
          </p>
        </div>

        <div className="w-full sm:w-[420px]">
          <label className="label">Project scope</label>
          <select className="input mt-1" value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="All">All Projects — Portfolio View</option>
            {projectOptions.map(p => (
              <option key={p.ProjectID} value={p.ProjectID}>
                {p.ProjectID}{p.ProjectName ? ` — ${p.ProjectName}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <div>
          Scope: <b className="text-slate-900">{projectLabel}</b>
          {projectFilter !== "All" && (
            <> · KPI variance vs portfolio: {kpiVariance === null
              ? <b className="text-slate-500">N/A</b>
              : <b className={kpiVariance >= 0 ? "text-green-700" : "text-red-700"}>{kpiVariance >= 0 ? "+" : ""}{kpiVariance.toFixed(2)}</b>}
            </>
          )}
        </div>
        <button className="btn" onClick={exportAttentionCsv}>Export Attention CSV</button>
      </div>
    </div>

    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <span className="font-black uppercase tracking-wide text-slate-500">Analytics Data Coverage</span>
        <span>Tasks without risk: <b className={coverage.missingRisk ? "text-amber-700" : "text-green-700"}>{coverage.missingRisk}</b></span>
        <span>Missing assignee: <b className={coverage.missingAssignee ? "text-amber-700" : "text-green-700"}>{coverage.missingAssignee}</b></span>
        <span>Missing due date: <b className={coverage.missingDueDate ? "text-amber-700" : "text-green-700"}>{coverage.missingDueDate}</b></span>
        <span>Missing progress: <b className={coverage.missingProgress ? "text-amber-700" : "text-green-700"}>{coverage.missingProgress}</b></span>
        <span>Project KPI: <b className={coverage.projectKpiAvailable ? "text-green-700" : "text-amber-700"}>{coverage.projectKpiAvailable ? "Available" : "Not calculated"}</b></span>
      </div>
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div className="card p-5" key={label}>
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
        </div>
      ))}
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title={`Task Status Distribution — ${projectLabel}`}>
        {statusData.length ? <ResponsiveContainer width="100%" height={340}>
          <PieChart>
            <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={120} label>
              {statusData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer> : <AnalyticsEmpty text="No task status data for the selected scope." />}
      </ChartCard>

      <ChartCard title="Project KPI Comparison">
        {projectComparison.length ? <ResponsiveContainer width="100%" height={340}>
          <BarChart data={projectComparison}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="project" />
            <YAxis domain={[0, 100]} />
            <Tooltip />
            <Legend />
            <Bar dataKey="kpi" name="Project KPI" fill="#0b73d9" radius={[8,8,0,0]} />
            <Bar dataKey="progress" name="Average Progress" fill="#22c55e" radius={[8,8,0,0]} />
          </BarChart>
        </ResponsiveContainer> : <AnalyticsEmpty text="No Project KPI data. Run Calculate KPI to populate this chart." />}
      </ChartCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title={`Lowest Task Progress — ${projectLabel}`}>
        {progressData.length ? <ResponsiveContainer width="100%" height={Math.max(360, progressData.length * 28)}>
          <BarChart data={progressData} layout="vertical" margin={{ left: 130 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0,100]} />
            <YAxis type="category" dataKey="task" width={190} />
            <Tooltip />
            <Bar dataKey="progress" name="Progress %" fill="#0b73d9" radius={[0,8,8,0]} />
          </BarChart>
        </ResponsiveContainer> : <AnalyticsEmpty text="No task progress data for the selected scope." />}
      </ChartCard>

      <ChartCard title={`Highest Task Risk — ${projectLabel}`}>
        {riskChartData.length ? <ResponsiveContainer width="100%" height={Math.max(360, riskChartData.length * 28)}>
          <BarChart data={riskChartData} layout="vertical" margin={{ left: 60 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0,100]} />
            <YAxis type="category" dataKey="task" width={80} />
            <Tooltip />
            <Bar dataKey="risk" name="Task Risk Score" fill="#ef4444" radius={[0,8,8,0]} />
          </BarChart>
        </ResponsiveContainer> : <AnalyticsEmpty text="No calculated task-risk data for the selected scope." />}
      </ChartCard>
    </div>

    <TableCard
      title={`Management Attention — ${projectLabel} (${attentionRows.length})`}
      rows={attentionRows}
      emptyMessage="No delayed, critical/high/medium-risk, low-progress, missing-progress or revision tasks in the selected scope."
      cellRenderers={{
        Status: value => <TaskStatusBadge status={value} />,
        RiskLevel: riskLevelCell,
        TaskRiskScore: scoreCell,
        DaysOverdue: value => <span className={analyticsNumber(value) > 0 ? "font-black text-red-700" : "text-slate-500"}>{String(value ?? 0)}</span>
      }}
    />

    <TableCard
      title={`Risk Heatmap — ${projectLabel}`}
      rows={heatmapRows}
      emptyMessage="No task-risk data in the selected scope."
      cellRenderers={{
        DelayRisk: scoreCell,
        LowProgressRisk: scoreCell,
        QualityRisk: scoreCell,
        WorkloadRisk: scoreCell,
        TotalRisk: scoreCell,
        RiskLevel: riskLevelCell
      }}
    />

    <TableCard
      title={`Team Allocation — ${projectLabel}`}
      rows={teamRows}
      emptyMessage="No assigned team members in the selected scope."
      cellRenderers={{
        AvgRisk: scoreCell
      }}
    />

    <TableCard
      title={projectFilter === "All" ? "Portfolio Project KPI Summary" : `Project KPI Summary — ${projectLabel}`}
      rows={projectFilter === "All" ? (projectKpi || []) : (projectKpiRow ? [projectKpiRow] : [])}
      emptyMessage="No Project KPI result is available for the selected project. Run Calculate KPI first."
    />
  </div>;
}

function TaskStatusBadge({ status }) {
  const raw = String(status || "").trim();
  const key = raw.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  const styles = {
    "completed": "bg-green-100 text-green-800 border-green-300",
    "approved": "bg-emerald-100 text-emerald-800 border-emerald-300",

    "delayed": "bg-red-100 text-red-800 border-red-300",
    "cancelled": "bg-red-100 text-red-800 border-red-300",
    "canceled": "bg-red-100 text-red-800 border-red-300",

    "at risk": "bg-orange-100 text-orange-800 border-orange-300",
    "need revision": "bg-amber-100 text-amber-800 border-amber-300",

    "normal": "bg-blue-100 text-blue-800 border-blue-300",
    "assigned": "bg-sky-100 text-sky-800 border-sky-300",
    "in progress": "bg-blue-100 text-blue-800 border-blue-300",

    "submitted": "bg-violet-100 text-violet-800 border-violet-300",
    "resubmitted": "bg-purple-100 text-purple-800 border-purple-300",
    "under review": "bg-indigo-100 text-indigo-800 border-indigo-300",

    "on hold": "bg-slate-200 text-slate-700 border-slate-300",
    "pending": "bg-slate-100 text-slate-700 border-slate-300",
    "not started": "bg-slate-100 text-slate-700 border-slate-300"
  };

  const cls = styles[key] || "bg-slate-100 text-slate-700 border-slate-300";

  return (
    <span
      className={`inline-flex min-w-[92px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${cls}`}
      title={raw || "Unknown status"}
    >
      {raw || "-"}
    </span>
  );
}

function Tasks({ tasks, allTasks, projects, employees, filters, setFilters, saveTask, deleteTask, user }) {
  const [form, setForm] = useState({});

  return (
    <div className="space-y-5">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        projects={projects}
        employees={employees}
      />

      {canEditMaster(user) && (
        <div className="card p-4">
          <h3 className="mb-3 text-lg font-black">Add / Edit Task</h3>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {[
              "TaskID",
              "ProjectID",
              "TaskName",
              "AssignedTo",
              "DueDate",
              "ProgressPercent",
              "Status",
              "Weight",
              "Difficulty",
              "QualityScore"
            ].map(k => (
              <Field
                key={k}
                label={k}
                value={form[k] || ""}
                onChange={v => setForm({ ...form, [k]: v })}
              />
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="btn-primary"
              onClick={() => saveTask(form)}
            >
              Save Task
            </button>

            <button
              className="btn"
              onClick={() => setForm({})}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <TableCard
        title={`Tasks (${tasks.length})`}
        rows={tasks}
        onRowClick={setForm}
        cellRenderers={{
          Status: (value) => <TaskStatusBadge status={value} />
        }}
        actions={r =>
          user.Role === "Admin" ? (
            <button
              className="btn-danger"
              onClick={() => deleteTask(r.TaskID)}
            >
              Delete
            </button>
          ) : null
        }
      />
    </div>
  );
}

function Workflow({
  tasks,
  employees,
  workflow,
  setWorkflow,
  runWorkflow,
  history,
  allHistory,
  loadHistory,
  loadAllHistory,
  user
}) {
  const [historyMode, setHistoryMode] = useState("selected");

  const allowed = {
    Admin: WORKFLOW_ACTIONS,
    Manager: WORKFLOW_ACTIONS,
    "Project Manager": WORKFLOW_ACTIONS,
    "Team Leader": WORKFLOW_ACTIONS.filter(x => !["complete","cancel"].includes(x[0])),
    Employee: WORKFLOW_ACTIONS.filter(x => ["update_progress","submit_work","resubmit"].includes(x[0])),
    Viewer: []
  }[user.Role] || [];

  const selectedTask = tasks.find(t => String(t.TaskID) === String(workflow.task_id));
  const selectedTitle = selectedTask
    ? `${selectedTask.TaskID} | ${selectedTask.ProjectID || "-"} | ${selectedTask.TaskName || ""}`
    : (workflow.task_id || "No task selected");

  const selectedRows = history || [];
  const allRows = allHistory || [];
  const displayedRows = historyMode === "all" ? allRows : selectedRows;

  async function showSelectedHistory() {
    setHistoryMode("selected");
    if (workflow.task_id) {
      try { await loadHistory(workflow.task_id); } catch (e) { console.error(e); }
    }
  }

  async function showAllHistory() {
    setHistoryMode("all");
    try { await loadAllHistory(); } catch (e) { console.error(e); }
  }

  return <div className="space-y-5">
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black">Task Workflow</h3>
        <div className="pill">V3.6.0 Management Reporting</div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="label">Task</label>
          <select
            className="input mt-1"
            value={workflow.task_id}
            onChange={e=>setWorkflow({...workflow, task_id:e.target.value})}
          >
            {tasks.map(t=>
              <option key={t.TaskID} value={t.TaskID}>
                {t.TaskID} | {t.ProjectID} | {t.TaskName} | {t.Status}
              </option>
            )}
          </select>
        </div>

        <div>
          <label className="label">Action by</label>
          <select
            className="input mt-1"
            value={workflow.action_by}
            onChange={e=>setWorkflow({...workflow, action_by:e.target.value})}
          >
            {employees.map(e=>
              <option key={e.EmployeeID} value={e.EmployeeID}>
                {e.EmployeeID} - {e.EmployeeName}
              </option>
            )}
          </select>
        </div>

        <Field
          label="Progress"
          value={workflow.progress}
          onChange={v=>setWorkflow({...workflow, progress:v})}
        />

        <Field
          label="Comment"
          value={workflow.comment}
          onChange={v=>setWorkflow({...workflow, comment:v})}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {allowed.map(([a,l])=>
          <button
            key={a}
            className={a === "complete" ? "btn-primary" : a === "cancel" ? "btn-danger" : "btn"}
            onClick={()=>runWorkflow(a)}
          >
            {l}
          </button>
        )}
      </div>
    </div>

    <div className="card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Approval History</h3>
          <p className="mt-1 text-xs text-slate-500">
            Workflow events are stored in the database and now generate collaboration notifications for relevant participants.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className={classNames("btn", historyMode === "selected" && "bg-blue-600 text-white")}
            onClick={showSelectedHistory}
          >
            Selected Task History
          </button>
          <button
            className={classNames("btn", historyMode === "all" && "bg-blue-600 text-white")}
            onClick={showAllHistory}
          >
            All Tasks History
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {historyMode === "selected"
          ? <>Showing history for: <span className="font-bold text-slate-900">{selectedTitle}</span> · {selectedRows.length} event(s)</>
          : <>Showing all workflow history · <span className="font-bold text-slate-900">{allRows.length} event(s)</span></>
        }
      </div>
    </div>

    <TableCard
      title={historyMode === "selected" ? "Selected Task Approval History" : "All Tasks Approval History"}
      rows={displayedRows}
      emptyMessage={
        historyMode === "selected"
          ? "No workflow history for the selected task."
          : "No workflow history is stored in the database yet."
      }
    />
  </div>;
}


function Collaboration({ api, user, tasks, employees, projects, onNotificationCountChange }) {
  const [projectFilter, setProjectFilter] = useState("All");
  const [taskId, setTaskId] = useState(tasks?.[0]?.TaskID || "");
  const [overview, setOverview] = useState({ cards: {} });
  const [notifications, setNotifications] = useState([]);
  const [activity, setActivity] = useState([]);
  const [bundle, setBundle] = useState({ comments: [], evidence: [], escalations: [], watchers: [], watching: false });
  const [commentText, setCommentText] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [escalation, setEscalation] = useState({ level: 1, reason: "", escalated_to: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const visibleTasks = useMemo(() => {
    return (tasks || []).filter(t => projectFilter === "All" || String(t.ProjectID || "") === projectFilter);
  }, [tasks, projectFilter]);

  const selectedTask = visibleTasks.find(t => String(t.TaskID) === String(taskId))
    || visibleTasks[0]
    || null;

  const selectedTaskId = selectedTask?.TaskID || "";

  useEffect(() => {
    if (selectedTaskId && selectedTaskId !== taskId) setTaskId(selectedTaskId);
    if (!selectedTaskId && taskId) setTaskId("");
  }, [projectFilter, tasks]);

  async function loadAll(showMessage = false) {
    setLoading(true);
    try {
      const projectQuery = encodeURIComponent(projectFilter);
      const [o, n, a] = await Promise.all([
        api(`/collaboration/overview?project_id=${projectQuery}`),
        api("/collaboration/notifications?limit=200"),
        api(`/collaboration/activity?project_id=${projectQuery}&limit=150`)
      ]);
      setOverview(o || { cards: {} });
      setNotifications(n.rows || []);
      setActivity(a.rows || []);
      const unread = (n.rows || []).filter(r => !["1","1.0","true","True"].includes(String(r.IsRead))).length;
      onNotificationCountChange?.(unread);
      if (selectedTaskId) {
        const b = await api(`/collaboration/tasks/${encodeURIComponent(selectedTaskId)}`);
        setBundle(b || { comments: [], evidence: [], escalations: [], watchers: [], watching: false });
      } else {
        setBundle({ comments: [], evidence: [], escalations: [], watchers: [], watching: false });
      }
      if (showMessage) setMessage("Collaboration data refreshed.");
    } catch (e) {
      setMessage(`Collaboration error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(false); }, [projectFilter, selectedTaskId]);

  async function addComment() {
    if (!selectedTaskId) return alert("Select a task first.");
    if (!commentText.trim()) return alert("Enter a comment.");
    try {
      await api("/collaboration/comments", {
        method: "POST",
        body: JSON.stringify({ task_id: selectedTaskId, comment_text: commentText.trim() })
      });
      setCommentText("");
      setMessage("Comment added and relevant collaborators notified.");
      await loadAll(false);
    } catch (e) { alert(`Comment error: ${e.message}`); }
  }

  async function toggleWatch() {
    if (!selectedTaskId) return;
    try {
      if (bundle.watching) {
        await api(`/collaboration/tasks/${encodeURIComponent(selectedTaskId)}/watch`, { method: "DELETE" });
      } else {
        await api(`/collaboration/tasks/${encodeURIComponent(selectedTaskId)}/watch`, { method: "POST", body: "{}" });
      }
      await loadAll(false);
    } catch (e) { alert(`Watch task error: ${e.message}`); }
  }

  async function uploadEvidence() {
    if (!selectedTaskId) return alert("Select a task first.");
    if (!evidenceFile) return alert("Choose a file first.");
    const fd = new FormData();
    fd.append("file", evidenceFile);
    fd.append("note", evidenceNote || "");
    try {
      const res = await fetch(`${API}/collaboration/tasks/${encodeURIComponent(selectedTaskId)}/evidence`, {
        method: "POST",
        credentials: "include",
        body: fd
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      setEvidenceFile(null);
      setEvidenceNote("");
      const input = document.getElementById("collab-evidence-file");
      if (input) input.value = "";
      setMessage("Evidence uploaded and collaborators notified.");
      await loadAll(false);
    } catch (e) { alert(`Evidence upload error: ${e.message}`); }
  }

  async function downloadEvidence(row) {
    try {
      const res = await fetch(`${API}/collaboration/evidence/${encodeURIComponent(row.EvidenceID)}/download`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = row.FileName || `${row.EvidenceID}.bin`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) { alert(`Download evidence error: ${e.message}`); }
  }

  async function createEscalation() {
    if (!selectedTaskId) return alert("Select a task first.");
    if (!escalation.reason.trim()) return alert("Enter an escalation reason.");
    try {
      await api("/collaboration/escalations", {
        method: "POST",
        body: JSON.stringify({
          task_id: selectedTaskId,
          level: Number(escalation.level || 1),
          reason: escalation.reason.trim(),
          escalated_to: escalation.escalated_to || ""
        })
      });
      setEscalation(v => ({ ...v, reason: "" }));
      setMessage("Approval escalation created.");
      await loadAll(false);
    } catch (e) { alert(`Escalation error: ${e.message}`); }
  }

  async function resolveEscalation(row) {
    const note = prompt(`Resolution note for ${row.EscalationID}:`, "");
    if (note === null) return;
    try {
      await api(`/collaboration/escalations/${encodeURIComponent(row.EscalationID)}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution_note: note })
      });
      await loadAll(false);
    } catch (e) { alert(`Resolve escalation error: ${e.message}`); }
  }

  async function markRead(row) {
    try {
      await api(`/collaboration/notifications/${encodeURIComponent(row.NotificationID)}/read`, {
        method: "POST", body: "{}"
      });
      await loadAll(false);
    } catch (e) { alert(`Notification error: ${e.message}`); }
  }

  async function markAllRead() {
    try {
      await api("/collaboration/notifications/read-all", { method: "POST", body: "{}" });
      await loadAll(false);
    } catch (e) { alert(`Notification error: ${e.message}`); }
  }

  async function runDeadlineReminders() {
    try {
      const r = await api("/collaboration/reminders/generate?days=3", { method: "POST", body: "{}" });
      setMessage(`Deadline reminders: ${r.matched_tasks || 0} task(s) matched, ${r.notifications_created || 0} new notification(s).`);
      await loadAll(false);
    } catch (e) { alert(`Reminder error: ${e.message}`); }
  }

  async function runAutoEscalation() {
    try {
      const r = await api("/collaboration/escalations/auto?threshold_hours=24", { method: "POST", body: "{}" });
      setMessage(`Auto escalation created ${r.created || 0} escalation(s).`);
      await loadAll(false);
    } catch (e) { alert(`Auto escalation error: ${e.message}`); }
  }

  const cards = overview.cards || {};
  const managerRole = ["Admin","Director","Manager","Project Manager","Team Leader"].includes(user?.Role);
  const editable = user?.Role !== "Viewer";

  const notificationRenderer = {
    Severity: value => {
      const v = String(value || "");
      const cls = v === "Critical" ? "bg-red-100 text-red-800 border-red-300"
        : v === "Warning" ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-blue-100 text-blue-800 border-blue-300";
      return <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${cls}`}>{v || "Info"}</span>;
    },
    IsRead: value => <span className={["1","1.0","true","True"].includes(String(value)) ? "text-slate-500" : "font-black text-blue-700"}>
      {["1","1.0","true","True"].includes(String(value)) ? "Read" : "Unread"}
    </span>
  };

  return <div className="space-y-5">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.5.0 Workflow & Collaboration</div>
          <h2 className="text-2xl font-black text-slate-950">Collaboration Center</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Multi-user task collaboration with notifications, comments, evidence, approval escalation, activity feed and deadline reminders.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => loadAll(true)}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="btn" onClick={markAllRead}>Mark All Read</button>
          {managerRole && <button className="btn" onClick={runAutoEscalation}>Run Auto Escalation</button>}
          <button className="btn-primary" onClick={runDeadlineReminders}>Generate Deadline Reminders</button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><label className="label">Project</label><select className="input mt-1" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}>
          <option value="All">All Projects</option>
          {(projects || []).map(p => <option key={p.ProjectID} value={p.ProjectID}>{p.ProjectID} — {p.ProjectName}</option>)}
        </select></div>
        <div className="xl:col-span-2"><label className="label">Task</label><select className="input mt-1" value={selectedTaskId} onChange={e=>setTaskId(e.target.value)}>
          {visibleTasks.map(t => <option key={t.TaskID} value={t.TaskID}>{t.TaskID} | {t.ProjectID} | {t.TaskName} | {t.Status}</option>)}
        </select></div>
        <div className="flex items-end">
          {editable && selectedTaskId && user?.EmployeeID
            ? <button className="btn w-full" onClick={toggleWatch}>{bundle.watching ? "Unwatch Task" : "Watch Task"}</button>
            : <div className="text-xs text-slate-500">Task watching requires an EmployeeID-linked account.</div>}
        </div>
      </div>
      {message && <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{message}</div>}
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {[
        ["Unread Notifications", cards.UnreadNotifications || 0],
        ["Open Escalations", cards.OpenEscalations || 0],
        ["Due Soon", cards.DueSoon || 0],
        ["Overdue", cards.Overdue || 0],
        ["Comments", cards.Comments || 0],
        ["Evidence", cards.Evidence || 0],
        ["Watchers", cards.Watchers || 0],
        ["Visible Tasks", cards.VisibleTasks || 0]
      ].map(([label,value]) => <div className="card p-4" key={label}>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-2 text-3xl font-black">{value}</div>
      </div>)}
    </div>

    {editable && <div className="grid gap-5 xl:grid-cols-3">
      <div className="card p-4">
        <h3 className="text-lg font-black">Comment</h3>
        <p className="mt-1 text-xs text-slate-500">Use @username or @EmployeeID to notify a specific collaborator.</p>
        <textarea className="input mt-3 min-h-[110px]" value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Add task comment..." />
        <button className="btn-primary mt-3" onClick={addComment}>Post Comment</button>
      </div>

      <div className="card p-4">
        <h3 className="text-lg font-black">Attachment / Evidence</h3>
        <input id="collab-evidence-file" className="input mt-3" type="file" onChange={e=>setEvidenceFile(e.target.files?.[0] || null)} />
        <textarea className="input mt-3 min-h-[72px]" value={evidenceNote} onChange={e=>setEvidenceNote(e.target.value)} placeholder="Evidence note..." />
        <button className="btn-primary mt-3" onClick={uploadEvidence}>Upload Evidence</button>
      </div>

      <div className="card p-4">
        <h3 className="text-lg font-black">Approval Escalation</h3>
        <div className="mt-3 grid gap-3">
          <div><label className="label">Level</label><select className="input mt-1" value={escalation.level} onChange={e=>setEscalation({...escalation,level:Number(e.target.value)})}>
            <option value={1}>Level 1 — Attention</option>
            <option value={2}>Level 2 — Urgent</option>
            <option value={3}>Level 3 — Critical</option>
          </select></div>
          <div><label className="label">Escalate to</label><select className="input mt-1" value={escalation.escalated_to} onChange={e=>setEscalation({...escalation,escalated_to:e.target.value})}>
            <option value="">Auto — task manager / project management</option>
            {(employees || []).map(e => <option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeID} — {e.EmployeeName}</option>)}
          </select></div>
          <textarea className="input min-h-[72px]" value={escalation.reason} onChange={e=>setEscalation({...escalation,reason:e.target.value})} placeholder="Reason for escalation..." />
          <button className="btn-danger" onClick={createEscalation}>Create Escalation</button>
        </div>
      </div>
    </div>}

    <TableCard
      title={`Notifications (${notifications.length})`}
      rows={notifications}
      emptyMessage="No notifications for the current user."
      cellRenderers={notificationRenderer}
      actions={r => !["1","1.0","true","True"].includes(String(r.IsRead))
        ? <button className="btn" onClick={()=>markRead(r)}>Mark Read</button>
        : null}
    />

    <div className="grid gap-5 xl:grid-cols-2">
      <TableCard
        title={`Comments — ${selectedTaskId || "No task"} (${(bundle.comments || []).length})`}
        rows={bundle.comments || []}
        emptyMessage="No comments for the selected task."
      />
      <TableCard
        title={`Evidence — ${selectedTaskId || "No task"} (${(bundle.evidence || []).length})`}
        rows={bundle.evidence || []}
        emptyMessage="No evidence files for the selected task."
        actions={r => <button className="btn" onClick={()=>downloadEvidence(r)}>Download</button>}
      />
    </div>

    <TableCard
      title={`Approval Escalations — ${selectedTaskId || "No task"} (${(bundle.escalations || []).length})`}
      rows={bundle.escalations || []}
      emptyMessage="No escalations for the selected task."
      actions={r => managerRole && String(r.Status || "").toLowerCase() === "open"
        ? <button className="btn-primary" onClick={()=>resolveEscalation(r)}>Resolve</button>
        : null}
    />

    <TableCard
      title={`Activity Feed — ${projectFilter === "All" ? "All Projects" : projectFilter} (${activity.length})`}
      rows={activity}
      emptyMessage="No collaboration activity in the selected scope."
    />
  </div>;
}


function Progress({ rows, projects, employees, filters, setFilters }) {
  const data = rows.map(r => ({ name: `${r.TaskID} ${r.ProjectID}`, progress: Number(r.ProgressPercent || 0), status: r.DeadlineStatus || r.Status }));
  return <div className="space-y-5"><FilterBar filters={filters} setFilters={setFilters} projects={projects} employees={employees} />
    <ChartCard title="Horizontal task progress"><ResponsiveContainer width="100%" height={Math.max(360, data.length*24)}><BarChart data={data} layout="vertical" margin={{ left: 90 }}><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" domain={[0,100]}/><YAxis type="category" dataKey="name" width={150}/><Tooltip/><Bar dataKey="progress" fill="#0b73d9" radius={[0,8,8,0]}/></BarChart></ResponsiveContainer></ChartCard>
  </div>;
}

function Quality({ rows }) {
  const byProject = Object.values(rows.reduce((acc,r)=>{ const p=r.ProjectID||"-"; acc[p]=acc[p]||{project:p,n:0,q:0}; acc[p].n++; acc[p].q+=Number(r.QualityAdjusted||r.QualityScore||0); return acc;},{})).map(x=>({project:x.project, quality: x.n? +(x.q/x.n).toFixed(2):0}));
  return <ChartCard title="Average quality by project"><ResponsiveContainer width="100%" height={360}><BarChart data={byProject}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="project"/><YAxis domain={[0,100]}/><Tooltip/><Bar dataKey="quality" fill="#0b73d9" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer></ChartCard>;
}
function Workload({ rows, api, projects, employees, tasks, user }) {
  const [projectFilter, setProjectFilter] = useState("All");
  const [employeeFilter, setEmployeeFilter] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState({ cards: {}, employee_summary: [], timeline: [], assignments: [], capacity: [], suggestions: [], editable: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [capacityForm, setCapacityForm] = useState({ EmployeeID: "", CapacityHoursPerDay: 8, TargetUtilizationPercent: 85, MaxUtilizationPercent: 100, EffectiveFrom: "", EffectiveTo: "" });
  const [assignmentForm, setAssignmentForm] = useState({ AssignmentID: "", TaskID: "", EmployeeID: "", AllocationPercent: 50, PlannedHours: 0, StartDate: "", FinishDate: "", RoleOnTask: "Contributor", Note: "" });
  const resourceLoadSeq = useRef(0);

  const editable = Boolean(data.editable);
  const projectOptions = useMemo(() => (projects || []).map(p => ({ id: String(p.ProjectID || ""), name: String(p.ProjectName || "") })).filter(x => x.id), [projects]);
  const employeeOptions = useMemo(() => (employees || []).map(e => ({ id: String(e.EmployeeID || ""), name: String(e.EmployeeName || ""), department: String(e.Department || "") })).filter(x => x.id), [employees]);
  const taskOptions = useMemo(() => (tasks || []).filter(t => projectFilter === "All" || String(t.ProjectID || "") === projectFilter), [tasks, projectFilter]);
  const selectedProject = projectOptions.find(p => p.id === projectFilter);
  const projectLabel = projectFilter === "All" ? "All Projects" : `${projectFilter}${selectedProject?.name ? ` — ${selectedProject.name}` : ""}`;
  const timelineStart = (data.timeline || [])[0]?.Date || "-";
  const timelineEnd = (data.timeline || []).length ? (data.timeline || [])[data.timeline.length - 1]?.Date || "-" : "-";
  const assignmentTaskIds = (data.assignments || []).map(a => String(a.TaskID || "")).filter(Boolean);
  const taskSignature = assignmentTaskIds.length ? `${assignmentTaskIds[0]} → ${assignmentTaskIds[assignmentTaskIds.length - 1]}` : "-";

  async function loadOverview() {
    const seq = ++resourceLoadSeq.current;
    const requestedProject = projectFilter || "All";
    const requestedEmployee = employeeFilter || "All";
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("project_id", requestedProject);
      qs.set("employee_id", requestedEmployee);
      if (startDate) qs.set("start_date", startDate);
      if (endDate) qs.set("end_date", endDate);
      const r = await api(`/resources/overview?${qs.toString()}`);
      if (seq !== resourceLoadSeq.current) return;
      setData(r);
      setMessage(`Resource analytics loaded for ${requestedProject}: ${r.cards?.Assignments || 0} assignment(s).`);
      const cap = (r.capacity || []).find(x => String(x.EmployeeID) === String(capacityForm.EmployeeID)) || (r.capacity || [])[0];
      if (cap && !capacityForm.EmployeeID) setCapacityForm({ ...cap });
      const ass = (r.assignments || []).find(x => String(x.AssignmentID) === String(assignmentForm.AssignmentID)) || (r.assignments || [])[0];
      if (ass && !assignmentForm.AssignmentID) setAssignmentForm({ ...ass });
    } catch (e) {
      if (seq !== resourceLoadSeq.current) return;
      setMessage(`Resource analytics error for ${requestedProject}: ${e.message}`);
    } finally {
      if (seq === resourceLoadSeq.current) setLoading(false);
    }
  }

  useEffect(() => { loadOverview(); }, [projectFilter, employeeFilter, startDate, endDate]);

  async function syncResources() {
    try { const r = await api("/resources/sync", { method: "POST" }); setMessage(r.message || "Resources synchronized."); await loadOverview(); }
    catch (e) { alert(`Resource sync error: ${e.message}`); }
  }

  function selectCapacity(eid) {
    const cap = (data.capacity || []).find(x => String(x.EmployeeID) === String(eid));
    if (cap) setCapacityForm({ ...cap });
    else setCapacityForm({ EmployeeID: eid, CapacityHoursPerDay: 8, TargetUtilizationPercent: 85, MaxUtilizationPercent: 100, EffectiveFrom: "", EffectiveTo: "" });
  }

  async function saveCapacity() {
    try {
      const r = await api("/resources/capacity", { method: "POST", body: JSON.stringify({ data: capacityForm }) });
      setMessage(r.message || "Capacity saved."); await loadOverview();
    } catch (e) { alert(`Save capacity error: ${e.message}`); }
  }

  function selectAssignment(aid) {
    const a = (data.assignments || []).find(x => String(x.AssignmentID) === String(aid));
    if (a) setAssignmentForm({ ...a });
  }

  function newAssignment() {
    const t = taskOptions[0] || {};
    const eid = employeeFilter !== "All" ? employeeFilter : (employeeOptions[0]?.id || "");
    setAssignmentForm({ AssignmentID: "", TaskID: t.TaskID || "", EmployeeID: eid, AllocationPercent: 50, PlannedHours: 0, StartDate: t.StartDate || "", FinishDate: t.DueDate || t.StartDate || "", RoleOnTask: "Contributor", Note: "" });
  }

  async function saveAssignment() {
    try {
      const r = await api("/resources/assignment", { method: "POST", body: JSON.stringify({ data: assignmentForm }) });
      setMessage(r.message || "Assignment saved."); setAssignmentForm({ ...r.assignment }); await loadOverview();
    } catch (e) { alert(`Save assignment error: ${e.message}`); }
  }

  async function deleteAssignment() {
    if (!assignmentForm.AssignmentID) return;
    if (!confirm(`Delete assignment ${assignmentForm.AssignmentID}?`)) return;
    try { const r = await api(`/resources/assignment/${encodeURIComponent(assignmentForm.AssignmentID)}`, { method: "DELETE" }); setMessage(r.message || "Assignment deleted."); newAssignment(); await loadOverview(); }
    catch (e) { alert(`Delete assignment error: ${e.message}`); }
  }

  const cards = data.cards || {};
  const cardRows = [
    ["Employees", cards.EmployeesInScope ?? 0], ["Assignments", cards.Assignments ?? 0],
    ["Avg Utilization", `${Number(cards.AverageUtilizationPercent || 0).toFixed(1)}%`], ["Peak Utilization", `${Number(cards.PeakUtilizationPercent || 0).toFixed(1)}%`],
    ["Overallocated Employees", cards.OverallocatedEmployees ?? 0], ["Overallocated Days", cards.OverallocatedDays ?? 0],
    ["Planned Hours", Number(cards.TotalPlannedHours || 0).toFixed(1)]
  ];

  const statusBadge = (value) => {
    const k = String(value || "").toLowerCase();
    const cls = k === "overallocated" ? "bg-red-100 text-red-800 border-red-300" : k === "high" ? "bg-amber-100 text-amber-800 border-amber-300" : k === "balanced" ? "bg-green-100 text-green-800 border-green-300" : "bg-slate-100 text-slate-700 border-slate-300";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{String(value || "-")}</span>;
  };

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pill">V3.4.0a Resource & Workload Management</div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">Resource Capacity, Allocation & Leveling</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">Temporal workload forecast from Planning dates + resource assignments. Over-allocation is detected by employee/day; leveling suggestions are advisory and never modify assignments automatically.</p><p className="mt-2 max-w-4xl text-xs font-semibold text-amber-700">V3.5.0: untouched auto assignments are profiled from Weight + Difficulty + Priority, so demo projects no longer share the same utilization pattern. Manual allocation edits are preserved.</p>
        </div>
        <div className="flex gap-2"><button className="btn" onClick={loadOverview}>{loading ? "Loading..." : "Refresh"}</button>{editable && <button className="btn-primary" onClick={syncResources}>Sync from Tasks & Planning</button>}</div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div><label className="label">Project</label><select className="input mt-1" value={projectFilter} onChange={e=>{ const next=e.target.value; resourceLoadSeq.current += 1; setProjectFilter(next); setData({ cards: {}, employee_summary: [], timeline: [], assignments: [], capacity: [], suggestions: [], editable: false }); setAssignmentForm({ AssignmentID: "", TaskID: "", EmployeeID: "", AllocationPercent: 50, PlannedHours: 0, StartDate: "", FinishDate: "", RoleOnTask: "Contributor", Note: "" }); setMessage(`Loading resource analytics for ${next}...`); }}><option value="All">All Projects</option>{projectOptions.map(p=><option key={p.id} value={p.id}>{p.id} — {p.name}</option>)}</select></div>
        <div><label className="label">Employee</label><select className="input mt-1" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}><option value="All">All Employees</option>{employeeOptions.map(e=><option key={e.id} value={e.id}>{e.id} — {e.name}</option>)}</select></div>
        <div><label className="label">From</label><input className="input mt-1" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></div>
        <div><label className="label">To</label><input className="input mt-1" type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-800">Scope: {projectLabel}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">Tasks: {taskSignature}</span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">Timeline: {timelineStart} → {timelineEnd}</span>
      </div>
      {message && <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{message}</div>}
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{cardRows.map(([label,value])=><div className="card p-4" key={label}><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-slate-950">{value}</div></div>)}</div>

    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title={`Peak utilization by employee — ${projectLabel}`}>
        <ResponsiveContainer width="100%" height={360}><BarChart data={(data.employee_summary || []).slice(0,20)}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="EmployeeID"/><YAxis domain={[0, Math.max(120, Math.ceil(Number(cards.PeakUtilizationPercent || 100)/20)*20)]}/><Tooltip/><Legend/><Bar dataKey="PeakUtilizationPercent" name="Peak %" fill="#ef4444" radius={[8,8,0,0]}/><Bar dataKey="AverageUtilizationPercent" name="Average %" fill="#0b73d9" radius={[8,8,0,0]}/></BarChart></ResponsiveContainer>
      </ChartCard>
      <ChartCard title={employeeFilter === "All" ? `Utilization timeline — ${projectLabel}` : `Utilization timeline — ${projectLabel} · ${employeeFilter}`}>
        <ResponsiveContainer width="100%" height={360}><LineChart data={data.timeline || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="Date"/><YAxis/><Tooltip/><Legend/><Line type="monotone" dataKey="UtilizationPercent" name="Utilization %" stroke="#0b73d9" strokeWidth={2} dot={false}/><Line type="monotone" dataKey="MaxUtilizationPercent" name="Max %" stroke="#ef4444" strokeDasharray="5 5" dot={false}/></LineChart></ResponsiveContainer>
      </ChartCard>
    </div>

    <TableCard title="Resource Utilization Summary" rows={data.employee_summary || []} emptyMessage="No resource utilization data for the selected scope." cellRenderers={{ Status: statusBadge }}/>
    <TableCard title="Resource Leveling Suggestions — Advisory" rows={data.suggestions || []} emptyMessage="No over-allocation requiring a leveling suggestion in the selected scope."/>

    {editable && <div className="grid gap-5 xl:grid-cols-2">
      <div className="card p-5">
        <h3 className="text-lg font-black">Capacity Editor</h3>
        <p className="mt-1 text-xs text-slate-500">Capacity is expressed as productive hours/day. Target is the preferred utilization; Max is the over-allocation threshold.</p>
        <label className="label mt-4 block">Employee</label><select className="input mt-1" value={capacityForm.EmployeeID || ""} onChange={e=>selectCapacity(e.target.value)}><option value="">Select employee</option>{employeeOptions.map(e=><option key={e.id} value={e.id}>{e.id} — {e.name}</option>)}</select>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Field label="Hours / Day" value={capacityForm.CapacityHoursPerDay ?? ""} onChange={v=>setCapacityForm({...capacityForm,CapacityHoursPerDay:v})}/><Field label="Target %" value={capacityForm.TargetUtilizationPercent ?? ""} onChange={v=>setCapacityForm({...capacityForm,TargetUtilizationPercent:v})}/><Field label="Max %" value={capacityForm.MaxUtilizationPercent ?? ""} onChange={v=>setCapacityForm({...capacityForm,MaxUtilizationPercent:v})}/></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="label">Effective From</label><input className="input mt-1" type="date" value={capacityForm.EffectiveFrom || ""} onChange={e=>setCapacityForm({...capacityForm,EffectiveFrom:e.target.value})}/></div><div><label className="label">Effective To</label><input className="input mt-1" type="date" value={capacityForm.EffectiveTo || ""} onChange={e=>setCapacityForm({...capacityForm,EffectiveTo:e.target.value})}/></div></div>
        <button className="btn-primary mt-4" onClick={saveCapacity}>Save Capacity</button>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-lg font-black">Resource Assignment Editor</h3><p className="mt-1 text-xs text-slate-500">Create or edit task-resource allocation. Manual rows are preserved by Sync.</p></div><button className="btn" onClick={newAssignment}>New</button></div>
        <label className="label mt-4 block">Existing Assignment</label><select className="input mt-1" value={assignmentForm.AssignmentID || ""} onChange={e=>selectAssignment(e.target.value)}><option value="">New assignment</option>{(data.assignments || []).map(a=><option key={a.AssignmentID} value={a.AssignmentID}>{a.AssignmentID} · {a.TaskID} · {a.EmployeeID}</option>)}</select>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="label">Task</label><select className="input mt-1" value={assignmentForm.TaskID || ""} onChange={e=>setAssignmentForm({...assignmentForm,TaskID:e.target.value})}><option value="">Select task</option>{taskOptions.map(t=><option key={t.TaskID} value={t.TaskID}>{t.TaskID} — {t.TaskName}</option>)}</select></div><div><label className="label">Employee</label><select className="input mt-1" value={assignmentForm.EmployeeID || ""} onChange={e=>setAssignmentForm({...assignmentForm,EmployeeID:e.target.value})}><option value="">Select employee</option>{employeeOptions.map(e=><option key={e.id} value={e.id}>{e.id} — {e.name}</option>)}</select></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Allocation %" value={assignmentForm.AllocationPercent ?? ""} onChange={v=>setAssignmentForm({...assignmentForm,AllocationPercent:v})}/><Field label="Planned Hours" value={assignmentForm.PlannedHours ?? ""} onChange={v=>setAssignmentForm({...assignmentForm,PlannedHours:v})}/></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><div><label className="label">Start Date</label><input className="input mt-1" type="date" value={assignmentForm.StartDate || ""} onChange={e=>setAssignmentForm({...assignmentForm,StartDate:e.target.value})}/></div><div><label className="label">Finish Date</label><input className="input mt-1" type="date" value={assignmentForm.FinishDate || ""} onChange={e=>setAssignmentForm({...assignmentForm,FinishDate:e.target.value})}/></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Role on Task" value={assignmentForm.RoleOnTask || ""} onChange={v=>setAssignmentForm({...assignmentForm,RoleOnTask:v})}/><Field label="Note" value={assignmentForm.Note || ""} onChange={v=>setAssignmentForm({...assignmentForm,Note:v})}/></div>
        <div className="mt-4 flex gap-2"><button className="btn-primary" onClick={saveAssignment}>Save Assignment</button>{assignmentForm.AssignmentID && <button className="btn-danger" onClick={deleteAssignment}>Delete</button>}</div>
      </div>
    </div>}

    <TableCard title={`Resource Assignments (${(data.assignments || []).length})`} rows={data.assignments || []} emptyMessage="No assignments in the selected scope."/>
    <TableCard title="Legacy Aggregate Workload Balance" rows={rows || []} emptyMessage="No aggregate workload data." cellRenderers={{ WorkloadStatus: statusBadge }}/>
  </div>;
}
function Risk({ rows, projectRisk, projects }) {
  const [projectFilter, setProjectFilter] = useState("All");

  const projectOptions = useMemo(() => {
    const map = new Map();

    (projects || []).forEach(p => {
      const id = String(p.ProjectID || "").trim();
      if (id) map.set(id, String(p.ProjectName || "").trim());
    });

    (rows || []).forEach(r => {
      const id = String(r.ProjectID || "").trim();
      if (id && !map.has(id)) map.set(id, "");
    });

    return Array.from(map.entries())
      .map(([ProjectID, ProjectName]) => ({ ProjectID, ProjectName }))
      .sort((a, b) => a.ProjectID.localeCompare(b.ProjectID));
  }, [rows, projects]);

  const filteredRows = useMemo(() => {
    if (projectFilter === "All") return rows || [];
    return (rows || []).filter(r => String(r.ProjectID || "") === String(projectFilter));
  }, [rows, projectFilter]);

  const chartRows = useMemo(() => {
    return [...filteredRows]
      .sort((a, b) => Number(b.TaskRiskScore || 0) - Number(a.TaskRiskScore || 0))
      .slice(0, 20);
  }, [filteredRows]);

  const selectedProject = projectOptions.find(p => p.ProjectID === projectFilter);
  const projectLabel = projectFilter === "All"
    ? "All Projects"
    : `${projectFilter}${selectedProject?.ProjectName ? ` — ${selectedProject.ProjectName}` : ""}`;

  return <div className="space-y-5">
    <div className="card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-black">Task Risk by Project</h3>
          <p className="mt-1 text-xs text-slate-500">
            Chọn dự án để xem riêng biểu đồ và bảng Task Risk của dự án đó.
          </p>
        </div>

        <div className="w-full sm:w-[360px]">
          <label className="label">Project</label>
          <select
            className="input mt-1"
            value={projectFilter}
            onChange={e => setProjectFilter(e.target.value)}
          >
            <option value="All">All Projects</option>
            {projectOptions.map(p => (
              <option key={p.ProjectID} value={p.ProjectID}>
                {p.ProjectID}{p.ProjectName ? ` — ${p.ProjectName}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3 text-xs text-slate-600">
        Showing <b>{filteredRows.length}</b> task risk record(s) for <b>{projectLabel}</b>.
      </div>
    </div>

    <ChartCard title={`Top task risk — ${projectLabel}`}>
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3"/>
          <XAxis dataKey="TaskID"/>
          <YAxis/>
          <Tooltip/>
          <Bar dataKey="TaskRiskScore" fill="#ef4444" radius={[8,8,0,0]}/>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>

    <TableCard
      title={`Task Risk — ${projectLabel} (${filteredRows.length})`}
      rows={filteredRows}
      emptyMessage="No Task Risk data for the selected project."
      cellRenderers={{
        RiskLevel: (value) => {
          const key = String(value || "").toLowerCase();
          const cls =
            key === "high" ? "bg-red-100 text-red-800 border-red-300" :
            key === "medium" ? "bg-amber-100 text-amber-800 border-amber-300" :
            key === "low" ? "bg-green-100 text-green-800 border-green-300" :
            "bg-slate-100 text-slate-700 border-slate-300";
          return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${cls}`}>{String(value || "-")}</span>;
        }
      }}
    />
  </div>;
}




function PilotFeedback({ api, user, activeTab }) {
  const blank = { Module: "General", IssueType: "Bug", Priority: "Medium", Title: "", Description: "", ExpectedResult: "", ActualResult: "", CurrentPage: activeTab || "Feedback" };
  const [form, setForm] = useState(blank);
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const canManage = ["Admin", "Manager"].includes(user?.AccessRole || user?.Role);

  async function load(showMessage = false) {
    setLoading(true); setError("");
    try {
      const [s, f] = await Promise.all([api("/pilot/status"), api("/pilot/feedback")]);
      setStatus(s); setRows(f.rows || []);
      if (showMessage) setMessage("Pilot feedback refreshed.");
    } catch (e) { setError(e.message || "Unable to load pilot feedback."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(false); }, []);

  async function submit() {
    setMessage(""); setError("");
    if (!form.Title.trim() || !form.Description.trim()) { setError("Title and Description are required."); return; }
    try {
      const r = await api("/pilot/feedback", { method: "POST", body: JSON.stringify({ ...form, CurrentPage: form.CurrentPage || "Feedback" }) });
      setRows(prev => [r.row, ...prev.filter(x => x.FeedbackID !== r.row.FeedbackID)]);
      setForm(blank);
      setMessage(`Feedback ${r.row.FeedbackID} submitted. Thank you.`);
      load(false);
    } catch (e) { setError(e.message || "Feedback submission failed."); }
  }

  async function updateRow(row, nextStatus) {
    const note = prompt("Admin/Manager note (optional):", row.AdminNote || "");
    if (note === null) return;
    try {
      const r = await api(`/pilot/feedback/${row.FeedbackID}`, { method: "PUT", body: JSON.stringify({ Status: nextStatus, AdminNote: note }) });
      setRows(prev => prev.map(x => x.FeedbackID === row.FeedbackID ? r.row : x));
      setMessage(`${row.FeedbackID} updated to ${nextStatus}.`);
    } catch (e) { setError(e.message || "Unable to update feedback."); }
  }

  return <div className="space-y-5">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="pill mb-2">V3.8.1b STAFF PILOT</div><h2 className="text-2xl font-black text-slate-950">Feedback & Validation</h2><p className="mt-2 text-sm text-slate-600">Report bugs, difficult-to-use steps, data issues, and improvement suggestions directly from the pilot system.</p></div>
        <button className="btn" onClick={()=>load(true)}>Refresh</button>
      </div>
      {message && <div className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{message}</div>}
      {error && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[['Feedback', status?.feedback_total ?? '—'], ['Open', status?.feedback_open ?? '—'], ['Active Users', status?.active_users ?? '—'], ['Sessions', status?.active_sessions ?? '—']].map(([a,b])=><div key={a} className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold uppercase text-slate-500">{a}</div><div className="mt-1 text-xl font-black">{b}</div></div>)}
      </div>
    </div>

    <div className="card p-5">
      <h3 className="text-lg font-black">Report Issue / Suggestion</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="text-xs font-bold text-slate-600">Module<input className="input mt-1" value={form.Module} onChange={e=>setForm({...form, Module:e.target.value})} /></label>
        <label className="text-xs font-bold text-slate-600">Issue type<select className="input mt-1" value={form.IssueType} onChange={e=>setForm({...form, IssueType:e.target.value})}><option>Bug</option><option>Difficult to use</option><option>Suggestion</option><option>Data issue</option><option>Other</option></select></label>
        <label className="text-xs font-bold text-slate-600">Priority<select className="input mt-1" value={form.Priority} onChange={e=>setForm({...form, Priority:e.target.value})}><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></label>
        <label className="text-xs font-bold text-slate-600 md:col-span-3">Title<input className="input mt-1" value={form.Title} onChange={e=>setForm({...form, Title:e.target.value})} /></label>
        <label className="text-xs font-bold text-slate-600 md:col-span-3">Description<textarea className="input mt-1 min-h-24" value={form.Description} onChange={e=>setForm({...form, Description:e.target.value})} /></label>
        <label className="text-xs font-bold text-slate-600">Expected result<textarea className="input mt-1 min-h-20" value={form.ExpectedResult} onChange={e=>setForm({...form, ExpectedResult:e.target.value})} /></label>
        <label className="text-xs font-bold text-slate-600">Actual result<textarea className="input mt-1 min-h-20" value={form.ActualResult} onChange={e=>setForm({...form, ActualResult:e.target.value})} /></label>
        <label className="text-xs font-bold text-slate-600">Page / Screen<input className="input mt-1" value={form.CurrentPage} onChange={e=>setForm({...form, CurrentPage:e.target.value})} /></label>
      </div>
      <button className="btn-primary mt-4" onClick={submit}>Submit Feedback</button>
    </div>

    <div className="card overflow-x-auto p-5">
      <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black">Pilot Feedback Log</h3><span className="text-xs text-slate-500">{loading ? 'Loading…' : `${rows.length} record(s)`}</span></div>
      <table className="mt-4 min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2">ID</th><th className="p-2">Time</th><th className="p-2">User</th><th className="p-2">Module</th><th className="p-2">Type</th><th className="p-2">Priority</th><th className="p-2">Title</th><th className="p-2">Status</th>{canManage && <th className="p-2">Action</th>}</tr></thead><tbody>
        {rows.map(r=><tr key={r.FeedbackID} className="border-b align-top"><td className="p-2 font-semibold">{r.FeedbackID}</td><td className="p-2 text-xs">{r.CreatedAt}</td><td className="p-2">{r.Username}</td><td className="p-2">{r.Module}</td><td className="p-2">{r.IssueType}</td><td className="p-2">{r.Priority}</td><td className="p-2"><div className="font-semibold">{r.Title}</div><div className="mt-1 max-w-md text-xs text-slate-500">{r.Description}</div>{r.AdminNote && <div className="mt-1 text-xs text-blue-700">Note: {r.AdminNote}</div>}</td><td className="p-2">{r.Status || 'Open'}</td>{canManage && <td className="p-2"><select className="input min-w-28" value={r.Status || 'Open'} onChange={e=>updateRow(r,e.target.value)}><option>Open</option><option>In Review</option><option>Planned</option><option>Resolved</option><option>Closed</option></select></td>}</tr>)}
        {rows.length===0 && <tr><td colSpan={canManage?9:8} className="p-4 text-center text-slate-500">No pilot feedback yet.</td></tr>}
      </tbody></table>
    </div>
  </div>;
}

function Administration({ api, currentUser, employees = [] }) {
  const blank = { UserID: "", Username: "", FullName: "", Email: "", AccessRole: "User", EmployeeID: "", ProjectScope: "", Active: 1, Password: "" };
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState("");
  const [lastSavedId, setLastSavedId] = useState("");
  const [loadState, setLoadState] = useState({ status: "idle", users: "idle", events: "idle" });
  const [errors, setErrors] = useState({ status: "", users: "", events: "" });

  function setSectionState(section, value) {
    setLoadState(v => ({ ...v, [section]: value }));
  }
  function setSectionError(section, value) {
    setErrors(v => ({ ...v, [section]: value }));
  }

  async function loadStatus() {
    setSectionState("status", "loading");
    setSectionError("status", "");
    try {
      const s = await api("/admin/security/status");
      setStatus(s);
      setSectionState("status", "ready");
      return true;
    } catch (err) {
      setSectionState("status", "error");
      setSectionError("status", err.message || "Unable to load security status.");
      return false;
    }
  }

  async function loadUsers() {
    setSectionState("users", "loading");
    setSectionError("users", "");
    try {
      const u = await api("/admin/users");
      setRows(u.rows || []);
      setSectionState("users", "ready");
      return true;
    } catch (err) {
      // Preserve any already displayed/optimistically added rows if refresh fails.
      setSectionState("users", "error");
      setSectionError("users", err.message || "Unable to load users.");
      return false;
    }
  }

  async function loadEvents() {
    setSectionState("events", "loading");
    setSectionError("events", "");
    try {
      const e = await api("/admin/security/events?limit=200");
      setEvents(e.rows || []);
      setSectionState("events", "ready");
      return true;
    } catch (err) {
      setSectionState("events", "error");
      setSectionError("events", err.message || "Unable to load security events.");
      return false;
    }
  }

  async function load(showMessage = false) {
    const result = await Promise.all([loadStatus(), loadUsers(), loadEvents()]);
    if (showMessage) {
      const ok = result.filter(Boolean).length;
      setMessage(ok === 3 ? "Administration data refreshed." : `Administration partially refreshed (${ok}/3 endpoints available).`);
    }
  }
  useEffect(() => { load(false); }, []);

  function edit(row) {
    setForm({
      UserID: row.UserID || "", Username: row.Username || "", FullName: row.FullName || "",
      Email: row.Email || "", AccessRole: row.AccessRole || "User", EmployeeID: row.EmployeeID || "",
      ProjectScope: row.ProjectScope || "", Active: Number(row.Active ?? 1), Password: ""
    });
  }

  async function save() {
    if (!form.Username.trim()) return alert("Username is required.");
    if (!form.UserID && (!form.Password || form.Password.length < 8)) return alert("New users require a password of at least 8 characters.");
    const isNew = !form.UserID;
    try {
      const result = await api("/admin/users", { method: "POST", body: JSON.stringify(form) });
      const saved = result.user || { ...form, Password: undefined };
      // Show the saved user immediately. A background refresh reconciles with the database afterward.
      setRows(prev => {
        const key = String(saved.UserID || "");
        const uname = String(saved.Username || "").toLowerCase();
        const idx = prev.findIndex(r => (key && String(r.UserID || "") === key) || String(r.Username || "").toLowerCase() === uname);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...prev[idx], ...saved };
          return next;
        }
        return [saved, ...prev];
      });
      setLastSavedId(String(saved.UserID || saved.Username || ""));
      setSectionState("users", "ready");
      setSectionError("users", "");
      setMessage(`${isNew ? "User created" : "User updated"}: ${saved.Username || form.Username}. The Users table was updated immediately.`);
      setForm(blank);
      // Reconcile counts/logs independently; failures do not remove the user already shown.
      void loadStatus();
      void loadEvents();
      void loadUsers();
    } catch (e) {
      setMessage(`Save user failed: ${e.message}`);
      alert(`Save user error: ${e.message}`);
    }
  }

  async function resetPassword(row) {
    const pw = prompt(`New password for ${row.Username} (minimum 8 characters):`);
    if (!pw) return;
    try {
      await api(`/admin/users/${encodeURIComponent(row.UserID)}/reset-password`, { method: "POST", body: JSON.stringify({ new_password: pw }) });
      setMessage(`Password reset for ${row.Username}. Existing sessions were revoked.`);
      void loadStatus();
      void loadEvents();
      void loadUsers();
    } catch (e) { alert(`Reset password error: ${e.message}`); }
  }

  async function toggleActive(row) {
    const action = Number(row.Active) ? "disable" : "enable";
    if (!confirm(`${action === "disable" ? "Disable" : "Enable"} ${row.Username}?`)) return;
    try {
      const result = await api(`/admin/users/${encodeURIComponent(row.UserID)}/toggle-active`, { method: "POST", body: "{}" });
      setRows(prev => prev.map(r => String(r.UserID) === String(row.UserID) ? { ...r, Active: result.active } : r));
      setMessage(`${row.Username} ${action}d.`);
      void loadStatus();
      void loadEvents();
      void loadUsers();
    } catch (e) { alert(`User status error: ${e.message}`); }
  }

  const statusReady = loadState.status === "ready" && !errors.status;
  const metric = (key) => statusReady ? (status?.[key] ?? "—") : "—";

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.8.1b Gantt Schedule Synchronization Fix</div>
          <h2 className="text-2xl font-black text-slate-950">Administration</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">Administration endpoints load independently. A temporary failure in Security Status, Users, or Security Log no longer blanks the entire page.</p>
        </div>
        <button className="btn" onClick={() => load(true)}>Refresh All</button>
      </div>
      {message && <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{message}</div>}
      {(errors.status || errors.users || errors.events) && (
        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-900">
          <div className="font-black">Partial connectivity issue</div>
          <div className="mt-1">Only the affected Administration section is unavailable; successfully loaded sections remain visible.</div>
        </div>
      )}
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      {[
        ["Password", statusReady ? (status?.password_hashing || "—") : "—"], ["Users", metric("users")], ["Active Users", metric("active_users")],
        ["Locked", metric("locked_users")], ["Sessions", metric("active_sessions")], ["Failed Today", metric("failed_logins_today")]
      ].map(([label,value]) => <div key={label} className="card p-4"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-2 text-xl font-black text-slate-950">{String(value)}</div></div>)}
    </div>

    {loadState.status === "loading" && (
      <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">Loading security status...</div>
    )}
    {errors.status && (
      <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
        <div className="font-black">Security Status API unavailable</div>
        <div className="mt-1 text-xs">{errors.status}</div>
        <button className="btn mt-2" onClick={loadStatus}>Retry Security Status</button>
      </div>
    )}
    {statusReady && (
      <div className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${Number(status?.plaintext_passwords || 0) === 0 ? "border-green-300 bg-green-50 text-green-800" : "border-red-300 bg-red-50 text-red-800"}`}>
        {Number(status?.plaintext_passwords || 0) === 0 ? "SECURITY OK — No plaintext passwords are stored." : `ATTENTION — ${status?.plaintext_passwords} plaintext password(s) remain.`}
      </div>
    )}

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="card p-5">
        <h3 className="text-lg font-black">Create / Edit User</h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Username<input className="input mt-1" disabled={Boolean(form.UserID)} value={form.Username} onChange={e=>setForm({...form, Username:e.target.value})} /></label>
          <label className="text-xs font-bold text-slate-600">Full name<input className="input mt-1" value={form.FullName} onChange={e=>setForm({...form, FullName:e.target.value})} /></label>
          <label className="text-xs font-bold text-slate-600">Email<input className="input mt-1" value={form.Email} onChange={e=>setForm({...form, Email:e.target.value})} /></label>
          <label className="text-xs font-bold text-slate-600">Access role<select className="input mt-1" value={form.AccessRole} onChange={e=>setForm({...form, AccessRole:e.target.value})}><option>Admin</option><option>Manager</option><option>User</option></select></label>
          <label className="text-xs font-bold text-slate-600">Employee ID
            <select className="input mt-1" value={form.EmployeeID} onChange={e=>setForm({...form, EmployeeID:e.target.value})}>
              <option value="">Not linked</option>
              {(employees || []).map(e=><option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeID} — {e.EmployeeName}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Project scope<input className="input mt-1" placeholder="* or P001,P002" value={form.ProjectScope} onChange={e=>setForm({...form, ProjectScope:e.target.value})} /></label>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">{form.UserID ? "Optional new password" : "Initial password"}<input className="input mt-1" type="password" value={form.Password} onChange={e=>setForm({...form, Password:e.target.value})} /></label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(Number(form.Active))} onChange={e=>setForm({...form, Active:e.target.checked ? 1 : 0})} /> Active</label>
        <div className="mt-4 flex gap-2"><button className="btn-primary" onClick={save}>{form.UserID ? "Save Changes" : "Create User"}</button><button className="btn" onClick={()=>setForm(blank)}>Clear</button></div>
        <div className="mt-3 text-xs text-slate-500">After Create User/Save Changes succeeds, the saved user is inserted into the Users table immediately, then reconciled with the backend in the background.</div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-black">Security Policy</h3>{errors.status && <button className="btn" onClick={loadStatus}>Retry</button>}</div>
        {statusReady ? <div className="mt-4 space-y-2 text-sm text-slate-700">
          <div><b>Password hashing:</b> {status?.password_hashing || "Argon2id"}</div><div><b>Minimum password:</b> 8 characters</div>
          <div><b>Failed login limit:</b> {status?.max_failed_logins ?? 5}</div><div><b>Lockout:</b> {status?.lockout_minutes ?? 15} minutes</div>
          <div><b>Session lifetime:</b> {status?.session_hours ?? 8} hours</div><div><b>Cookie:</b> HttpOnly · SameSite=Lax</div>
        </div> : <div className="mt-4 text-sm text-slate-500">{loadState.status === "loading" ? "Loading security policy..." : "Security policy data unavailable."}</div>}
      </div>
    </div>

    <div className="card overflow-x-auto p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">Users</h3><button className="btn" onClick={loadUsers}>Retry / Refresh Users</button></div>
      {errors.users && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800"><b>Users API error:</b> {errors.users}. Existing rows are kept on screen.</div>}
      <table className="mt-4 min-w-full text-sm"><thead><tr className="border-b text-left text-xs uppercase text-slate-500"><th className="p-2">Username</th><th className="p-2">Name</th><th className="p-2">Access</th><th className="p-2">Status</th><th className="p-2">Last Login</th><th className="p-2">Actions</th></tr></thead><tbody>
        {rows.map(r=><tr key={r.UserID || r.Username} className={classNames("border-b", String(lastSavedId) === String(r.UserID || r.Username) && "bg-green-50")}><td className="p-2 font-semibold">{r.Username}</td><td className="p-2">{r.FullName || "-"}</td><td className="p-2">{r.AccessRole || "User"}</td><td className="p-2">{Number(r.Active) ? "Active" : "Disabled"}</td><td className="p-2 text-xs">{r.LastLoginAt || "-"}</td><td className="p-2"><div className="flex flex-wrap gap-1"><button className="btn" onClick={()=>edit(r)}>Edit</button><button className="btn" onClick={()=>resetPassword(r)}>Reset Password</button><button className="btn" disabled={r.UserID===currentUser?.UserID} onClick={()=>toggleActive(r)}>{Number(r.Active) ? "Disable" : "Enable"}</button></div></td></tr>)}
        {rows.length === 0 && <tr><td colSpan="6" className="p-4 text-center text-sm text-slate-500">{loadState.users === "loading" ? "Loading users..." : errors.users ? "Users could not be loaded. Use Retry / Refresh Users." : loadState.users === "ready" ? "No users found." : "Users have not been loaded yet."}</td></tr>}
      </tbody></table>
    </div>

    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-black">Security Log</h3><button className="btn" onClick={loadEvents}>Retry / Refresh Log</button></div>
      {errors.events && <div className="mt-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800"><b>Security Events API error:</b> {errors.events}</div>}
      <div className="mt-4">{loadState.events === "loading" && events.length === 0 ? <div className="text-sm text-slate-500">Loading security events...</div> : <TableCard title="Recent Security Events" rows={events} />}</div>
    </div>
  </div>;
}

function EnterpriseData({ api, user }) {
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [importFile, setImportFile] = useState(null);

  async function loadEnterprise(showMessage = false) {
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        api("/enterprise/status"),
        api("/enterprise/backups")
      ]);
      setStatus(s);
      setBackups(b.rows || []);
      if (showMessage) setMessage("Enterprise Data status refreshed.");
    } catch (e) {
      setMessage(`Enterprise Data error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadEnterprise(false); }, []);

  async function createBackup() {
    try {
      const r = await api("/enterprise/backup", { method: "POST", body: "{}" });
      setMessage(`Backup created: ${r.backup?.Filename || ""}`);
      await loadEnterprise(false);
    } catch (e) { alert(`Enterprise backup error: ${e.message}`); }
  }

  async function downloadPackage() {
    try {
      const res = await fetch(`${API}/enterprise/export-package`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const filename = m?.[1] || "Project_KPI_Data_Package_V381.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(`Portable data package exported: ${filename}`);
    } catch (e) { alert(`Export package error: ${e.message}`); }
  }

  async function importPackage() {
    if (!importFile) return alert("Choose a V3.8 portable data package first.");
    const confirmText = prompt("Type IMPORT DATA PACKAGE exactly to replace package tables:");
    if (confirmText !== "IMPORT DATA PACKAGE") return;
    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("confirm_text", confirmText);
    try {
      const res = await fetch(`${API}/enterprise/import-package`, {
        method: "POST",
        credentials: "include",
        body: fd
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const r = await res.json();
      setMessage(`Data package imported: ${r.table_count || 0} tables, ${r.record_count || 0} records.`);
      setImportFile(null);
      const input = document.getElementById("enterprise-package-file");
      if (input) input.value = "";
      await loadEnterprise(false);
    } catch (e) { alert(`Import package error: ${e.message}`); }
  }

  async function restoreBackup(row) {
    const confirmText = prompt(`Restore ${row.Filename}?\nType RESTORE ENTERPRISE DATABASE exactly:`);
    if (confirmText !== "RESTORE ENTERPRISE DATABASE") return;
    try {
      const r = await api(`/enterprise/restore/${encodeURIComponent(row.Filename)}`, {
        method: "POST",
        body: JSON.stringify({ confirm_text: confirmText })
      });
      setMessage(`Restore completed. Pre-restore backup: ${r.pre_restore_backup?.Filename || ""}`);
      await loadEnterprise(false);
    } catch (e) { alert(`Restore error: ${e.message}`); }
  }

  async function runAuditRetention() {
    const confirmText = prompt("Archive audit records older than the configured retention period?\nType RUN AUDIT RETENTION exactly:");
    if (confirmText !== "RUN AUDIT RETENTION") return;
    try {
      const r = await api("/enterprise/audit-retention/run", {
        method: "POST",
        body: JSON.stringify({ confirm_text: confirmText })
      });
      setMessage(`Audit retention complete: ${r.archived || 0} archived, ${r.remaining || 0} active audit rows.`);
      await loadEnterprise(false);
    } catch (e) { alert(`Audit retention error: ${e.message}`); }
  }

  async function runBackupRetention() {
    try {
      const r = await api("/enterprise/backup-retention/run", { method: "POST", body: "{}" });
      setMessage(`Backup retention complete: ${r.deleted || 0} old backup(s) removed.`);
      await loadEnterprise(false);
    } catch (e) { alert(`Backup retention error: ${e.message}`); }
  }

  const production = Boolean(status?.production_ready);
  const dialect = String(status?.dialect || "-");
  const mode = String(status?.database_mode || "-");

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.8.1b Enterprise Data & PostgreSQL</div>
          <h2 className="text-2xl font-black text-slate-950">Enterprise Data Center</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            PostgreSQL production readiness, portable data exchange, enterprise backup/restore,
            migration support and audit retention for organizational deployment.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => loadEnterprise(true)}>{loading ? "Loading..." : "Refresh"}</button>
          <button className="btn-primary" onClick={createBackup}>Create Enterprise Backup</button>
          <button className="btn" onClick={downloadPackage}>Export Standard Data Package</button>
        </div>
      </div>

      <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${production ? "border-green-300 bg-green-50 text-green-800" : "border-amber-300 bg-amber-50 text-amber-800"}`}>
        {production
          ? "PRODUCTION READY — PostgreSQL is active and pg_dump / pg_restore are available."
          : dialect === "postgresql"
          ? "PostgreSQL is active, but production backup tools or another readiness requirement is missing."
          : "LOCAL / DEVELOPMENT MODE — SQLite is active. Configure PostgreSQL before organizational production deployment."}
      </div>
      {message && <div className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">{message}</div>}
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {[
        ["Database Engine", dialect],
        ["Database Mode", mode],
        ["Tables", status?.tables || 0],
        ["Enterprise Backups", status?.backup_count || 0],
        ["Audit Rows", status?.audit_rows || 0],
        ["Archived Audit Rows", status?.audit_archive_rows || 0],
        ["Audit Retention", `${status?.audit_retention_days || 365} days`],
        ["Backup Retention", `${status?.backup_retention_days || 30} days`],
        ["pg_dump", status?.pg_dump_available ? "Available" : "Not found"],
        ["pg_restore", status?.pg_restore_available ? "Available" : "Not found"]
      ].map(([label,value]) => <div key={label} className="card p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-2 break-words text-xl font-black text-slate-950">{String(value)}</div>
      </div>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <div className="card p-5">
        <h3 className="text-lg font-black">PostgreSQL Production Diagnostics</h3>
        <div className="mt-4 space-y-2 text-sm">
          <div><b>Connection:</b> {status?.ok ? "OK" : "ERROR"}</div>
          <div><b>Safe DATABASE_URL:</b> <span className="font-mono text-xs">{status?.database_url || "-"}</span></div>
          <div><b>Require PostgreSQL:</b> {String(Boolean(status?.require_postgresql))}</div>
          <div><b>PostgreSQL:</b> <span className="text-xs">{status?.postgresql_version || "Not active"}</span></div>
          <div><b>Portable package:</b> {status?.portable_package_format || "PKM_DATA_PACKAGE_V1"}</div>
        </div>
        {status?.connection_error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{status.connection_error}</div>}
        <div className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          Production setup files are included in the V3.8 project root:
          <b> .env.postgresql.example</b>, <b>docker-compose.postgresql.yml</b>,
          <b> MIGRATE_FROM_V370_POSTGRES_V380.ps1</b> and automated backup scripts.
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-lg font-black">Standard Import / Export</h3>
        <p className="mt-2 text-sm text-slate-600">
          PKM_DATA_PACKAGE_V1 contains table CSV files, SHA256 manifest metadata and task attachments.
          Treat exported packages as sensitive organizational data.
        </p>
        <input id="enterprise-package-file" type="file" accept=".zip" className="input mt-4" onChange={e=>setImportFile(e.target.files?.[0] || null)} />
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={importPackage}>Import Standard Data Package</button>
          <button className="btn" onClick={runAuditRetention}>Run Audit Retention</button>
          <button className="btn" onClick={runBackupRetention}>Run Backup Retention</button>
        </div>
        <div className="mt-3 text-xs font-semibold text-amber-700">
          Import and restore automatically create a safety backup first and require typed confirmation.
        </div>
      </div>
    </div>

    <TableCard
      title={`Enterprise Backup History (${backups.length})`}
      rows={backups}
      emptyMessage="No enterprise backup history yet."
      actions={r => String(r.Status || "") === "OK" && r.Filename
        ? <button className="btn" onClick={()=>restoreBackup(r)}>Restore</button>
        : null}
    />

    <div className="card p-5">
      <h3 className="text-lg font-black">Deployment Path</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
        {[
          ["1", "Provision PostgreSQL", "Use organization PostgreSQL or the included Docker Compose for testing."],
          ["2", "Configure .env", "Set DATABASE_MODE=postgresql, DATABASE_URL and REQUIRE_POSTGRESQL=true."],
          ["3", "Migrate data", "Run MIGRATE_FROM_V370_POSTGRES_V380.ps1 to clone V3.7 into an independent V3.8 PostgreSQL database."],
          ["4", "Automate protection", "Install daily backup task, retention policy and periodic restore tests."]
        ].map(([n,t,d]) => <div key={n} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-black text-blue-700">STEP {n}</div>
          <div className="mt-1 font-black">{t}</div>
          <div className="mt-2 text-xs text-slate-600">{d}</div>
        </div>)}
      </div>
    </div>
  </div>;
}


function Reports({ api, user, projects, backupDb }) {
  function localIsoToday() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  const [periodType, setPeriodType] = useState("weekly");
  const [referenceDate, setReferenceDate] = useState(localIsoToday());
  const [projectId, setProjectId] = useState("All");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadReport() {
    setLoading(true);
    try {
      const q = new URLSearchParams({
        period_type: periodType,
        reference_date: referenceDate,
        project_id: projectId
      });
      const r = await api(`/management/executive?${q.toString()}`);
      setReport(r);
      setMessage(`Management view refreshed · ${r.period?.label || ""}`);
    } catch (e) {
      setMessage(`Management reporting error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, [periodType, referenceDate, projectId]);

  async function downloadReport(format) {
    try {
      const q = new URLSearchParams({
        period_type: periodType,
        reference_date: referenceDate,
        project_id: projectId
      });
      const res = await fetch(`${API}/management/report/${format}?${q.toString()}`, {
        credentials: "include"
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const m = /filename="?([^"]+)"?/i.exec(cd);
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const filename = m?.[1] || `Management_Report_V360_${projectId}_${periodType}.${ext}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage(`${format.toUpperCase()} management report generated.`);
    } catch (e) {
      alert(`Report download error: ${e.message}`);
    }
  }

  const cards = report?.cards || {};
  const health = report?.project_health || [];
  const attention = report?.attention || [];
  const activityCards = report?.period_activity?.cards || {};

  const HEALTH_COLORS = {
    Green: "#22C55E",
    Amber: "#F59E0B",
    Red: "#EF4444"
  };
  const PROGRESS_COLOR = "#2563EB";
  const KPI_COLOR = "#7C3AED";

  const healthChart = health.map(r => ({
    project: r.ProjectID,
    health: Number(r.HealthScore || 0),
    progress: Number(r.ProgressPercent || 0),
    kpi: Number(r.ProjectKPI || 0),
    healthStatus: String(r.HealthStatus || ""),
    healthColor: HEALTH_COLORS[String(r.HealthStatus || "")] || "#64748B"
  }));

  const statusCounts = [
    { name: "Green", value: Number(cards.GreenProjects || 0), color: HEALTH_COLORS.Green },
    { name: "Amber", value: Number(cards.AmberProjects || 0), color: HEALTH_COLORS.Amber },
    { name: "Red", value: Number(cards.RedProjects || 0), color: HEALTH_COLORS.Red }
  ];
  const visibleStatusCounts = statusCounts.filter(r => r.value > 0);
  const singleProjectHealth = projectId !== "All" && health.length === 1 ? health[0] : null;

  const healthBadge = value => {
    const v = String(value || "");
    const cls = v === "Green"
      ? "bg-green-100 text-green-800 border-green-300"
      : v === "Amber"
      ? "bg-amber-100 text-amber-800 border-amber-300"
      : v === "Red"
      ? "bg-red-100 text-red-800 border-red-300"
      : "bg-slate-100 text-slate-700 border-slate-300";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${cls}`}>{v || "-"}</span>;
  };

  const priorityBadge = value => {
    const v = String(value || "");
    const cls = v === "Critical"
      ? "bg-red-100 text-red-800 border-red-300"
      : v === "High"
      ? "bg-orange-100 text-orange-800 border-orange-300"
      : "bg-amber-100 text-amber-800 border-amber-300";
    return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${cls}`}>{v || "-"}</span>;
  };

  return <div className="space-y-6">
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="pill mb-2">V3.6.0 Management Reporting</div>
          <h2 className="text-2xl font-black text-slate-950">Executive Dashboard & Management Reporting</h2>
          <p className="mt-2 max-w-4xl text-sm text-slate-600">
            Executive portfolio view combining project health, schedule, quality, risk, resource utilization, workflow escalation and period activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={loadReport}>{loading ? "Loading..." : "Refresh Executive View"}</button>
          <button className="btn-primary" onClick={() => downloadReport("excel")}>Export Management Excel</button>
          <button className="btn" onClick={() => downloadReport("pdf")}>Export Management PDF</button>
          {user?.Role === "Admin" && <button className="btn" onClick={backupDb}>Backup Database</button>}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div>
          <label className="label">Report period</label>
          <select className="input mt-1" value={periodType} onChange={e=>setPeriodType(e.target.value)}>
            <option value="weekly">Weekly — trailing 7 days</option>
            <option value="monthly">Monthly — month to date</option>
          </select>
        </div>
        <div>
          <label className="label">Reference date</label>
          <input className="input mt-1" type="date" value={referenceDate} onChange={e=>setReferenceDate(e.target.value)} />
        </div>
        <div>
          <label className="label">Project scope</label>
          <select className="input mt-1" value={projectId} onChange={e=>setProjectId(e.target.value)}>
            <option value="All">All Projects — Portfolio</option>
            {(projects || []).map(p => <option key={p.ProjectID} value={p.ProjectID}>{p.ProjectID} — {p.ProjectName}</option>)}
          </select>
        </div>
      </div>

      {report?.period?.label && <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
        {report.period.label} · Generated {report.generated_at} · {report.generated_by}
      </div>}
      {message && <div className="mt-2 text-xs font-semibold text-slate-600">{message}</div>}
    </div>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
      {[
        [projectId === "All" ? "Portfolio Health" : "Project Health", `${Number(cards.PortfolioHealthScore || 0).toFixed(1)} · ${cards.PortfolioHealthStatus || "-"}`],
        ["Projects", cards.ProjectsInScope || 0],
        ["Green / Amber / Red", `${cards.GreenProjects || 0} / ${cards.AmberProjects || 0} / ${cards.RedProjects || 0}`],
        ["Avg Progress", `${Number(cards.AverageProgress || 0).toFixed(1)}%`],
        ["Avg Project KPI", Number(cards.AverageProjectKPI || 0).toFixed(1)],
        ["Overdue Tasks", cards.OverdueTasks || 0],
        ["High/Critical Risk", cards.HighCriticalRiskTasks || 0],
        ["Open Escalations", cards.OpenEscalations || 0],
        ["Overallocated Employees", cards.OverallocatedEmployees || 0],
        ["Period Completed", activityCards.TasksCompleted || 0]
      ].map(([label,value]) => <div className="card p-4" key={label}>
        <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
        <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      </div>)}
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <ChartCard title="Project Health, Progress & KPI">
        <ResponsiveContainer width="100%" height={360}>
          <BarChart data={healthChart}>
            <CartesianGrid strokeDasharray="3 3"/>
            <XAxis dataKey="project"/>
            <YAxis domain={[0,100]}/>
            <Tooltip/>
            <Legend/>
            <Bar dataKey="health" name="Health Score" radius={[6,6,0,0]}>
              {healthChart.map((row, i) => <Cell key={`health-${row.project}-${i}`} fill={row.healthColor}/>)}
            </Bar>
            <Bar dataKey="progress" name="Progress %" fill={PROGRESS_COLOR} radius={[6,6,0,0]}/>
            <Bar dataKey="kpi" name="Project KPI" fill={KPI_COLOR} radius={[6,6,0,0]}/>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-xs font-semibold">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-500"></span>Health Green ≥ 75</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-500"></span>Health Amber 55–74.99</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-500"></span>Health Red &lt; 55</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-blue-600"></span>Progress</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-violet-600"></span>Project KPI</span>
        </div>
      </ChartCard>

      {singleProjectHealth ? (
        <div className="card p-5">
          <h3 className="text-lg font-black">Project Health Indicator — {singleProjectHealth.ProjectID}</h3>
          <div className="mt-2 text-sm text-slate-600">{singleProjectHealth.ProjectName}</div>

          <div className="mt-8 flex flex-col items-center">
            <div
              className="flex h-40 w-40 items-center justify-center rounded-full border-[14px]"
              style={{ borderColor: HEALTH_COLORS[singleProjectHealth.HealthStatus] || "#64748B" }}
            >
              <div className="text-center">
                <div className="text-4xl font-black text-slate-950">{Number(singleProjectHealth.HealthScore || 0).toFixed(1)}</div>
                <div
                  className="mt-1 text-sm font-black uppercase"
                  style={{ color: HEALTH_COLORS[singleProjectHealth.HealthStatus] || "#64748B" }}
                >
                  {singleProjectHealth.HealthStatus}
                </div>
              </div>
            </div>

            <div className="mt-6 w-full">
              <div className="h-4 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.max(0, Math.min(100, Number(singleProjectHealth.HealthScore || 0)))}%`,
                    backgroundColor: HEALTH_COLORS[singleProjectHealth.HealthStatus] || "#64748B"
                  }}
                ></div>
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-semibold text-slate-500">
                <span>0</span><span>Red &lt; 55</span><span>Amber 55–74.99</span><span>Green ≥ 75</span><span>100</span>
              </div>
            </div>

            <div className="mt-6 grid w-full grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ["Progress", singleProjectHealth.ProgressPercent],
                ["Deadline", singleProjectHealth.DeadlineHealth],
                ["Quality", singleProjectHealth.QualityHealth],
                ["Risk", singleProjectHealth.RiskHealth],
                ["Resource", singleProjectHealth.ResourceHealth]
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
                  <div className="mt-1 text-xl font-black text-slate-950">{Number(value || 0).toFixed(1)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <ChartCard title="Portfolio Health Status — Green / Amber / Red">
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie data={visibleStatusCounts} dataKey="value" nameKey="name" outerRadius={115} label>
                {visibleStatusCounts.map((row, i)=><Cell key={`${row.name}-${i}`} fill={row.color}/>)}
              </Pie>
              <Tooltip/>
              <Legend/>
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-5 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-green-500"></span>Green</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-amber-500"></span>Amber</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-red-500"></span>Red</span>
          </div>
        </ChartCard>
      )}
    </div>

    <TableCard
      title={`Project Health & Portfolio View (${health.length})`}
      rows={health}
      emptyMessage="No project health data in the selected scope."
      cellRenderers={{ HealthStatus: healthBadge }}
    />

    <TableCard
      title={`Management Attention (${attention.length})`}
      rows={attention}
      emptyMessage="No major management exception detected."
      cellRenderers={{ Priority: priorityBadge }}
    />

    <div className="card p-5">
      <h3 className="text-xl font-black">Weekly / Monthly Period Activity</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Object.entries(activityCards).map(([label,value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-black">{String(value)}</div>
        </div>)}
      </div>
    </div>

    <div className="card p-5">
      <h3 className="text-xl font-black">Project Health Methodology</h3>
      <p className="mt-2 text-sm text-slate-600">
        Health Score = 25% Progress + 20% Deadline Health + 20% Quality Health + 20% Risk Health + 15% Resource Health.
        Green ≥ 75; Amber 55–74.99; Red &lt; 55. The score is a management decision-support indicator, not a replacement for project-manager judgment.
      </p>
    </div>
  </div>;
}
function Validation({ rows, runValidation }) { return <div className="space-y-5"><div className="card p-5"><h3 className="text-xl font-black">Data Validation</h3><button className="btn-primary mt-3" onClick={runValidation}>Run Data Validation</button></div><TableCard title="Validation Issues" rows={rows}/></div>; }
function Database({
  info,
  safety,
  backups,
  integrity,
  verifyDb,
  initDb,
  clearDb,
  uploadExcel,
  importDemo,
  saveCurrentData,
  loadFromDatabase,
  backupDb,
  restoreDatabaseUpload,
  restoreServerBackup,
  downloadServerBackup,
  checkDbIntegrity,
  loadDbSafety,
  legacyBackupDb,
  showDatabaseLocation,
  openDatabaseFolder
}) {
  const ButtonTile = ({ title, subtitle, onClick, danger = false, primary = false, children }) => (
    <button
      className={classNames(
        "rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
        danger
          ? "border-red-200 bg-red-50 text-red-800 hover:bg-red-100"
          : primary
          ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-blue-50/40"
      )}
      onClick={onClick}
    >
      <div className="text-sm font-black">{title}</div>
      <div className={classNames("mt-1 text-xs leading-5", primary ? "text-blue-100" : danger ? "text-red-600" : "text-slate-500")}>
        {subtitle}
      </div>
      {children}
    </button>
  );

  const formatBytes = (n) => {
    const v = Number(n || 0);
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    return `${(v / (1024 * 1024)).toFixed(2)} MB`;
  };

  const statusCards = [
    ["Database", safety?.dialect || "-"],
    ["Size", safety ? formatBytes(safety.size_bytes) : "-"],
    ["Tables", safety?.tables ?? "-"],
    ["Integrity", safety?.integrity || "-"],
    ["Safety Backups", safety?.backup_count ?? backups?.length ?? 0],
    ["Last Modified", safety?.last_modified || "-"]
  ];

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="pill">V3.5.0 Database Backup & Restore Safety</div>
            <h3 className="mt-3 text-xl font-black text-slate-950">Database Management</h3>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">
              Safety-first SQLite management: consistent snapshots, restore validation, automatic pre-restore/pre-clear backup,
              data-integrity checks and destructive-action confirmation.
            </p>
          </div>
          <button className="btn" onClick={loadDbSafety}>Refresh Safety Status</button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {statusCards.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</div>
              <div className="mt-1 break-all text-sm font-black text-slate-900">{String(value)}</div>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <ButtonTile
            title="Initialize Database Safely"
            subtitle="Creates a safety snapshot first, then initializes the schema. Requires typed confirmation."
            onClick={initDb}
          />

          <label className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-md cursor-pointer">
            <div className="text-sm font-black text-slate-800">Import Excel to Database</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Select an .xlsx or .xlsm file and import it through the existing backend importer.
            </div>
            <input className="hidden" type="file" accept=".xlsx,.xlsm" onChange={uploadExcel} />
          </label>

          <ButtonTile
            title="Save Current Data"
            subtitle="Commit/checkpoint the current persisted database state."
            onClick={saveCurrentData}
          />

          <ButtonTile
            title="Load from Database"
            subtitle="Reload dashboard, tasks, projects, KPI, workload and risk from the active database."
            onClick={loadFromDatabase}
          />

          <ButtonTile
            title="Verify Database Structure"
            subtitle="Run the existing structure/table-count verification."
            onClick={verifyDb}
          />

          <ButtonTile
            title="Create & Download Safety Snapshot"
            subtitle="Creates a consistent .sqlite snapshot with timestamp and downloads it."
            onClick={backupDb}
            primary
          />

          <label className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-md cursor-pointer">
            <div className="text-sm font-black text-emerald-900">Restore Snapshot from File</div>
            <div className="mt-1 text-xs leading-5 text-emerald-700">
              Validates SQLite integrity and core tables, automatically backs up the current DB, then restores.
            </div>
            <input className="hidden" type="file" accept=".sqlite,.sqlite3,.db" onChange={restoreDatabaseUpload} />
          </label>

          <ButtonTile
            title="Run Data Integrity Check"
            subtitle="Checks SQLite integrity, orphan relationships and duplicate key IDs."
            onClick={checkDbIntegrity}
          />

          <ButtonTile
            title="Open Database Folder"
            subtitle="Local Windows mode: open the active SQLite database folder."
            onClick={openDatabaseFolder}
          />

          <ButtonTile
            title="Clear Database Safely"
            subtitle="Automatically backs up first, then clears data only after two-step confirmation."
            onClick={clearDb}
            danger
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Compatibility tools</span>
          <button className="btn" onClick={importDemo}>Import Demo Excel</button>
          <button className="btn" onClick={showDatabaseLocation}>Show Database Location</button>
          <button className="btn" onClick={legacyBackupDb}>Legacy CSV ZIP Backup</button>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-black">Recent Safety Snapshots</h3>
            <p className="mt-1 text-xs text-slate-500">Stored in the project backups folder. Restore always creates another pre-restore backup first.</p>
          </div>
          <button className="btn" onClick={loadDbSafety}>Refresh List</button>
        </div>
      </div>

      <TableCard
        title={`Safety Snapshots (${backups?.length || 0})`}
        rows={backups || []}
        emptyMessage="No safety snapshots have been created yet."
        actions={r => (
          <div className="flex flex-wrap gap-2" onClick={e => e.stopPropagation()}>
            <button className="btn" onClick={() => downloadServerBackup(r.Filename)}>Download</button>
            <button className="btn-danger" onClick={() => restoreServerBackup(r.Filename)}>Restore</button>
          </div>
        )}
      />

      {integrity && (
        <div className="space-y-3">
          <div className={classNames(
            "card border p-4",
            integrity.ok ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          )}>
            <div className={classNames("text-lg font-black", integrity.ok ? "text-green-800" : "text-red-800")}>
              {integrity.ok ? "Integrity Check: PASS" : "Integrity Check: REVIEW REQUIRED"}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              SQLite integrity: <b>{integrity.sqlite_integrity}</b> · Issue checks: <b>{integrity.issue_checks}</b> · Issue records: <b>{integrity.issue_records}</b>
            </div>
          </div>
          <TableCard title="Data Integrity Details" rows={integrity.checks || []} emptyMessage="No integrity checks returned." />
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <h3 className="text-lg font-black">Database Operation Details</h3>
          <p className="mt-1 text-xs text-slate-500">
            Detailed result from the latest Verify / Save / Load / Backup / Restore / Integrity operation.
          </p>
        </div>
        <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap p-4 text-xs leading-5 text-slate-700">
          {info ? JSON.stringify(info, null, 2) : "No database status loaded yet."}
        </pre>
      </div>
    </div>
  );
}

function Settings({ rows, loadSettings, saveSetting }) {
  const [form, setForm] = useState({});
  const [selectedKey, setSelectedKey] = useState("");

  const columns = useMemo(() => {
    const out = [];
    for (const r of (rows || [])) {
      for (const k of Object.keys(r || {})) {
        if (!out.includes(k)) out.push(k);
      }
    }
    return out;
  }, [rows]);

  const keyColumn = useMemo(() => {
    const preferred = ["SettingKey", "Key", "SettingID", "SettingName", "Name", "Parameter", "ParameterName"];
    return preferred.find(k => columns.includes(k)) || columns[0] || "";
  }, [columns]);

  useEffect(() => {
    if (!rows?.length) {
      setForm({});
      setSelectedKey("");
      return;
    }
    const stillExists = keyColumn && rows.some(r => String(r[keyColumn] ?? "") === String(selectedKey));
    if (!stillExists) {
      setForm({ ...rows[0] });
      setSelectedKey(keyColumn ? String(rows[0][keyColumn] ?? "") : "");
    }
  }, [rows, keyColumn]);

  function selectRow(r) {
    setForm({ ...r });
    setSelectedKey(keyColumn ? String(r[keyColumn] ?? "") : "");
  }

  async function doSave() {
    if (!Object.keys(form || {}).length) return;
    await saveSetting(form);
  }

  return <div className="space-y-5">
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-black">Settings</h3>
          <p className="mt-2 text-slate-600">
            Cấu hình hệ thống được đọc trực tiếp từ bảng <b>settings</b> trong database.
            Chọn một dòng trong bảng để xem và chỉnh sửa giá trị.
          </p>
        </div>
        <button className="btn" onClick={loadSettings}>Refresh Settings</button>
      </div>
    </div>

    <TableCard
      title={`Settings Table (${rows?.length || 0})`}
      rows={rows || []}
      onRowClick={selectRow}
      emptyMessage="The settings table is empty."
      actions={r =>
        <button
          className="btn"
          onClick={(e) => { e.stopPropagation(); selectRow(r); }}
        >
          Edit
        </button>
      }
    />

    {rows?.length > 0 && Object.keys(form || {}).length > 0 && (
      <div className="card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-black">Edit Setting</h3>
            <p className="mt-1 text-xs text-slate-500">
              {keyColumn
                ? <>Selected: <b>{keyColumn}</b> = <b>{String(form[keyColumn] ?? "")}</b></>
                : "Edit the selected database row."}
            </p>
          </div>
          <button className="btn-primary" onClick={doSave}>Save Setting</button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {columns.map(c => (
            <div key={c}>
              <label className="label">{c}</label>
              <input
                className="input mt-1"
                value={String(form[c] ?? "")}
                readOnly={c === keyColumn}
                onChange={e => setForm(v => ({ ...v, [c]: e.target.value }))}
              />
              {c === keyColumn && (
                <div className="mt-1 text-[11px] text-slate-400">Key field is protected while editing.</div>
              )}
            </div>
          ))}
        </div>
      </div>
    )}
  </div>;
}

function Crud({ title, rows, columns, onSave, readOnly, onLoad }) {
  const [form, setForm] = useState({});
  useEffect(()=>{ if(onLoad) onLoad(); }, []);
  return <div className="space-y-5">
    {!readOnly && <div className="card p-4"><h3 className="mb-3 text-lg font-black">{title} form</h3><div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">{columns.map(c=><Field key={c} label={c} value={form[c] || ""} onChange={v=>setForm({...form,[c]:v})}/>)}</div><div className="mt-3 flex gap-2"><button className="btn-primary" onClick={()=>onSave(form)}>Save</button><button className="btn" onClick={()=>setForm({})}>Clear</button></div></div>}
    <TableCard title={title} rows={rows} onRowClick={setForm}/>
  </div>;
}
function FilterBar({ filters, setFilters, projects, employees }) { return <div className="card grid gap-3 p-4 md:grid-cols-3"><div><label className="label">Project</label><select className="input mt-1" value={filters.project} onChange={e=>setFilters({...filters, project:e.target.value})}><option>All</option>{projects.map(p=><option key={p.ProjectID}>{p.ProjectID}</option>)}</select></div><div><label className="label">Employee</label><select className="input mt-1" value={filters.employee} onChange={e=>setFilters({...filters, employee:e.target.value})}><option>All</option>{employees.map(e=><option key={e.EmployeeID}>{e.EmployeeID}</option>)}</select></div><div><label className="label">Status</label><select className="input mt-1" value={filters.status} onChange={e=>setFilters({...filters, status:e.target.value})}><option>All</option><option>Completed</option><option>Delayed</option><option>At risk</option><option>Normal</option><option>Assigned</option><option>In Progress</option><option>Submitted</option><option>Under Review</option><option>Need Revision</option><option>Resubmitted</option><option>Approved</option><option>On Hold</option><option>Cancelled</option></select></div></div>; }
function Field({ label, value, onChange }) { return <div><label className="label">{label}</label><input className="input mt-1" value={value ?? ""} onChange={e=>onChange(e.target.value)} /></div>; }
function ChartCard({ title, children }) { return <div className="card p-5"><h3 className="mb-4 text-lg font-black text-slate-900">{title}</h3>{children}</div>; }
function TableCard({ title, rows, onRowClick, actions, emptyMessage = "No data. Initialize DB and import demo Excel first.", cellRenderers = {} }) {
  const cols = rows?.length ? Object.keys(rows[0]) : [];
  return <div className="card overflow-hidden"><div className="border-b border-slate-200 p-4"><h3 className="text-lg font-black">{title}</h3></div><div className="max-h-[560px] overflow-auto"><table className="min-w-full"><thead><tr>{cols.map(c=><th key={c} className="th">{c}</th>)}{actions && <th className="th">Action</th>}</tr></thead><tbody>{rows?.length ? rows.map((r,i)=><tr key={i} className="hover:bg-blue-50" onClick={()=>onRowClick && onRowClick(r)}>{cols.map(c=><td key={c} className="td">{cellRenderers[c] ? cellRenderers[c](r[c], r) : String(r[c] ?? "")}</td>)}{actions && <td className="td">{actions(r)}</td>}</tr>) : <tr><td className="td" colSpan="20">{emptyMessage}</td></tr>}</tbody></table></div></div>;
}
