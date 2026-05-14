import {
  BadgeDollarSign,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  FileText,
  Headphones,
  Home,
  KeyRound,
  Laptop,
  ListChecks,
  LogOut,
  Map,
  MessageSquareText,
  Percent,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Tag,
  TrendingUp,
  UserPlus,
  Users,
  WalletCards,
  Wrench
} from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, login, setToken, signup } from "../api/client";
import { StatCard } from "../components/StatCard";

type Summary = {
  customers: number;
  openJobs: number;
  invoices: number;
  revenueCents: number;
  totalJobs: number;
  completedJobs: number;
  canceledJobs: number;
  leadJobs: number;
  bookedJobs: number;
  salesCents: number;
  collectedCents: number;
  averageJobSizeCents: number;
  cancellationRate: number;
  bookingRate: number;
  closeRate: number;
  estimateWinRatio: { won: number; total: number };
  jobsByType: Array<{ label: string; count: number; percent: number }>;
  jobsBySource: Array<{ label: string; count: number; percent: number }>;
};

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  source?: string;
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  street1: string;
  city: string;
  state: string;
  postalCode: string;
};

type Job = {
  id: string;
  jobNumber: number;
  title: string;
  jobType: string;
  status: string;
  scheduledStart?: string;
  customer: Customer;
  technician?: { name: string; color: string };
};

type Invoice = {
  id: string;
  invoiceNumber: number;
  status: string;
  total: number;
  customer: Customer;
};

type LocationAccess = {
  role: string;
  organization: { id: string; name: string };
  location: { id: string; name: string };
};

type ApiKey = {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
};

type View = "dispatch" | "schedule" | "customers" | "jobs" | "invoices" | "api";
type CalendarMode = "employees" | "day" | "week" | "month";
type SlotPrompt = { date: Date; hour: number } | null;

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const calendarHours = Array.from({ length: 24 }, (_item, hour) => hour);

function startOfWeek(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatHour(hour: number) {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sourceColor(index: number) {
  return ["green", "navy", "purple", "yellow", "red"][index % 5];
}

export function App() {
  const [token, updateToken] = useState(getToken());
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [identifier, setIdentifier] = useState("owner");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [locationName, setLocationName] = useState("El Centro");
  const [password, setPassword] = useState("ChangeMe123!");
  const [locations, setLocations] = useState<LocationAccess[]>([]);
  const [activeLocationId, setActiveLocationId] = useState("");
  const [activeView, setActiveView] = useState<View>("dispatch");
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [slotPrompt, setSlotPrompt] = useState<SlotPrompt>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("Partner API");
  const [newApiToken, setNewApiToken] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [customerForm, setCustomerForm] = useState<CustomerForm>({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    source: "",
    street1: "",
    city: "",
    state: "CA",
    postalCode: ""
  });
  const [jobForm, setJobForm] = useState({
    customerId: "",
    title: "",
    jobType: "Lockout",
    scheduledStart: "",
    scheduledEnd: "",
    description: ""
  });
  const [invoiceForm, setInvoiceForm] = useState({
    customerId: "",
    jobId: "",
    itemName: "Locksmith service",
    quantity: "1",
    unitPrice: "",
    tax: "0"
  });
  const [error, setError] = useState("");

  const scheduledJobs = useMemo(() => jobs.filter((job) => job.status !== "COMPLETED" && job.status !== "CANCELED"), [jobs]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_item, index) => addDays(weekStart, index)), [weekStart]);

  async function loadDashboard() {
    const [summaryResult, customersResult, jobsResult, invoicesResult] = await Promise.all([
      api<Summary>("/api/settings/summary"),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ jobs: Job[] }>("/api/jobs"),
      api<{ invoices: Invoice[] }>("/api/invoices")
    ]);

    setSummary(summaryResult);
    setCustomers(customersResult.customers);
    setJobs(jobsResult.jobs);
    setInvoices(invoicesResult.invoices);

    const [locationResult, apiKeyResult] = await Promise.all([
      api<{ activeLocationId: string; locations: LocationAccess[] }>("/api/locations"),
      api<{ apiKeys: ApiKey[] }>("/api/location-api-keys")
    ]);
    setLocations(locationResult.locations);
    setActiveLocationId(locationResult.activeLocationId);
    setApiKeys(apiKeyResult.apiKeys);
  }

  useEffect(() => {
    if (!token) return;
    loadDashboard().catch((err: Error) => setError(err.message));
  }, [token]);

  async function handleLogin(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = authMode === "login"
        ? await login(identifier, password)
        : await signup({ name, email, username, password, companyName, locationName });
      setToken(result.token);
      updateToken(result.token);
      if (result.locations) setLocations(result.locations);
      if (result.location) setActiveLocationId(result.location.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  async function switchLocation(locationId: string) {
    setError("");
    const result = await api<{ token: string; location: { id: string; name: string } }>("/api/auth/switch-location", {
      method: "POST",
      body: JSON.stringify({ locationId })
    });
    setToken(result.token);
    updateToken(result.token);
    setActiveLocationId(result.location.id);
    await loadDashboard();
  }

  async function createApiKey() {
    setError("");
    const result = await api<{ apiKey: ApiKey; token: string; warning: string }>("/api/location-api-keys", {
      method: "POST",
      body: JSON.stringify({
        name: apiKeyName,
        scopes: ["customers:read", "jobs:read"]
      })
    });
    setApiKeys((current) => [result.apiKey, ...current]);
    setNewApiToken(result.token);
  }

  async function revokeApiKey(id: string) {
    setError("");
    await api(`/api/location-api-keys/${id}/revoke`, { method: "POST" });
    setApiKeys((current) => current.map((item) => item.id === id ? { ...item, active: false, revokedAt: new Date().toISOString() } : item));
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    setError("");
    await api("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        firstName: customerForm.firstName,
        lastName: customerForm.lastName,
        phone: customerForm.phone,
        email: customerForm.email,
        source: customerForm.source,
        address: customerForm.street1 ? {
          street1: customerForm.street1,
          city: customerForm.city,
          state: customerForm.state,
          postalCode: customerForm.postalCode
        } : undefined
      })
    });
    setCustomerForm({ firstName: "", lastName: "", phone: "", email: "", source: "", street1: "", city: "", state: "CA", postalCode: "" });
    await loadDashboard();
  }

  async function removeCustomer(id: string) {
    setError("");
    await api(`/api/customers/${id}`, { method: "DELETE" });
    await loadDashboard();
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    setError("");
    await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        customerId: jobForm.customerId || customers[0]?.id,
        title: jobForm.title,
        jobType: jobForm.jobType,
        scheduledStart: jobForm.scheduledStart ? new Date(jobForm.scheduledStart).toISOString() : undefined,
        scheduledEnd: jobForm.scheduledEnd ? new Date(jobForm.scheduledEnd).toISOString() : undefined,
        description: jobForm.description
      })
    });
    setJobForm({ customerId: "", title: "", jobType: "Lockout", scheduledStart: "", scheduledEnd: "", description: "" });
    await loadDashboard();
    setActiveView("dispatch");
  }

  async function createInvoice(event: FormEvent) {
    event.preventDefault();
    setError("");
    await api("/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        customerId: invoiceForm.customerId,
        jobId: invoiceForm.jobId || undefined,
        tax: Math.round(Number(invoiceForm.tax || "0") * 100),
        items: [{
          name: invoiceForm.itemName,
          quantity: Number(invoiceForm.quantity || "1"),
          unitPrice: Math.round(Number(invoiceForm.unitPrice || "0") * 100),
          taxable: true
        }]
      })
    });
    setInvoiceForm({ customerId: "", jobId: "", itemName: "Locksmith service", quantity: "1", unitPrice: "", tax: "0" });
    await loadDashboard();
  }

  function openJobFromSlot(slot: { date: Date; hour: number }) {
    const start = new Date(slot.date);
    start.setHours(slot.hour, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setJobForm((current) => ({
      ...current,
      scheduledStart: toDateTimeLocal(start),
      scheduledEnd: toDateTimeLocal(end)
    }));
    setSlotPrompt(null);
    setActiveView("jobs");
  }

  if (!token) {
    return (
      <main className="login-screen">
        <form className="login-panel" onSubmit={handleLogin}>
          <div className="brand-mark"><Wrench size={26} /></div>
          <h1>{authMode === "login" ? "Locksmith CRM" : "Create your CRM"}</h1>
          <p>Dispatch, customers, jobs, invoices, payments, locations, and messaging in one place.</p>
          <div className="segmented">
            <button type="button" className={authMode === "login" ? "selected" : ""} onClick={() => setAuthMode("login")}>Sign in</button>
            <button type="button" className={authMode === "signup" ? "selected" : ""} onClick={() => setAuthMode("signup")}>Sign up</button>
          </div>
          {authMode === "login" ? (
            <label>
              Username or email
              <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
            </label>
          ) : (
            <>
              <label>
                Your name
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                Email
                <input value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <label>
                Username
                <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="letters, numbers, dots, dashes, underscores" />
              </label>
              <label>
                Company
                <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </label>
              <label>
                First location
                <input value={locationName} onChange={(event) => setLocationName(event.target.value)} />
              </label>
            </>
          )}
          <label>
            Password
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" />
          </label>
          {error && <div className="error">{error}</div>}
          <button type="submit">{authMode === "login" ? "Sign in" : "Create account"}</button>
        </form>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">A</div>
          <div>
            <strong>affordable</strong>
            <span>service CRM</span>
          </div>
        </div>
        <nav>
          <span className="nav-section">Main Menu</span>
          <button className={activeView === "dispatch" ? "active" : ""} onClick={() => setActiveView("dispatch")}><Home size={18} /> Dashboard</button>
          <button className={activeView === "schedule" ? "active" : ""} onClick={() => setActiveView("schedule")}><CalendarDays size={18} /> Schedule</button>
          <button><Map size={18} /> Map</button>

          <span className="nav-section">Communication</span>
          <button><MessageSquareText size={18} /> Messages</button>
          <button><Phone size={18} /> Phone</button>
          <button><TrendingUp size={18} /> Marketing</button>

          <span className="nav-section">Operations</span>
          <button className={activeView === "jobs" ? "active" : ""} onClick={() => setActiveView("jobs")}><Wrench size={18} /> Jobs</button>
          <button className={activeView === "customers" ? "active" : ""} onClick={() => setActiveView("customers")}><Users size={18} /> Clients & Leads</button>
          <button><UserPlus size={18} /> Employees</button>
          <button className={activeView === "invoices" ? "active" : ""} onClick={() => setActiveView("invoices")}><ReceiptText size={18} /> Invoices</button>
          <button><FileText size={18} /> Estimates</button>
          <button><WalletCards size={18} /> Payments</button>
          <button><CalendarDays size={18} /> Events</button>
          <button><Clock3 size={18} /> Time Clock</button>
          <button><Laptop size={18} /> Online Booking</button>
          <button><Tag size={18} /> Pricebook</button>

          <span className="nav-section">More</span>
          <button><ListChecks size={18} /> Reports</button>
          <button><Settings size={18} /> Settings</button>
          <button className={activeView === "api" ? "active" : ""} onClick={() => setActiveView("api")}><KeyRound size={18} /> API Access</button>
          <button><Headphones size={18} /> Support</button>
          <button><BookOpen size={18} /> Training</button>
        </nav>
        <button className="ghost" onClick={() => { clearToken(); updateToken(null); }}>
          <LogOut size={18} /> Sign out
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="search-box">
            <Search size={18} />
            <input aria-label="Search" placeholder="Type to search" />
          </div>
          <div className="add-menu-wrap">
            <button className="primary add-button" onClick={() => setAddMenuOpen((open) => !open)}><Plus size={18} /> Add New</button>
            <div className={`quick-add-menu ${addMenuOpen ? "open" : ""}`}>
              <button onClick={() => setAddMenuOpen(false)}><MessageSquareText size={16} /> Message</button>
              <button onClick={() => { setActiveView("customers"); setAddMenuOpen(false); }}><Users size={16} /> Client or Lead</button>
              <button><UserPlus size={16} /> Employee</button>
              <button onClick={() => { setActiveView("jobs"); setAddMenuOpen(false); }}><Wrench size={16} /> Job</button>
              <button onClick={() => { setActiveView("invoices"); setAddMenuOpen(false); }}><ReceiptText size={16} /> Invoice</button>
              <button><FileText size={16} /> Estimate</button>
              <button onClick={() => { setActiveView("schedule"); setAddMenuOpen(false); }}><CalendarDays size={16} /> Event</button>
            </div>
          </div>
          <div className="topbar-spacer" />
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="profile-button" aria-label="Profile"><span>BW</span><ChevronDown size={16} /></button>
        </header>

        <div className="page-titlebar">
          <div className="breadcrumb"><Home size={17} /> {activeView === "dispatch" ? "Dashboard" : activeView[0].toUpperCase() + activeView.slice(1)}</div>
          <div className="topbar-actions">
            <select value={activeLocationId} onChange={(event) => switchLocation(event.target.value)}>
              {locations.map((item) => (
                <option key={item.location.id} value={item.location.id}>
                  {item.location.name}
                </option>
              ))}
            </select>
            <div className="date-pill">05/13/2026 <CalendarDays size={16} /></div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {activeView !== "schedule" && <div className="stats-grid">
          <StatCard label="Sales" value={money.format((summary?.salesCents ?? 0) / 100)} icon={CircleDollarSign} />
          <StatCard label="Collected Payments" value={money.format((summary?.collectedCents ?? 0) / 100)} icon={BadgeDollarSign} />
          <StatCard label="Jobs Completed" value={String(summary?.completedJobs ?? 0)} icon={CheckCheck} />
          <StatCard label="Cancellation Rate" value={percent.format(summary?.cancellationRate ?? 0)} icon={Percent} />
          <StatCard label="Average Job Size" value={money.format((summary?.averageJobSizeCents ?? 0) / 100)} icon={TrendingUp} />
          <StatCard label="New Clients" value={String(summary?.customers ?? 0)} icon={Users} />
          <StatCard label="New Leads" value={String(summary?.leadJobs ?? 0)} icon={UserPlus} />
          <StatCard label="Booking Rate" value={percent.format(summary?.bookingRate ?? 0)} icon={Percent} />
        </div>}

        {activeView === "dispatch" && <div className="content-grid">
          <section className="panel wide">
            <div className="panel-header">
              <h2>Scheduled Work</h2>
              <button className="icon-button" aria-label="Add job"><Plus size={18} /></button>
            </div>
            <div className="job-list">
              {scheduledJobs.map((job) => (
                <article className="job-row" key={job.id}>
                  <div className="job-time">
                    <strong>#{job.jobNumber}</strong>
                    <span>{job.scheduledStart ? new Date(job.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</span>
                  </div>
                  <div>
                    <h3>{job.title}</h3>
                    <p>{job.customer.firstName} {job.customer.lastName} / {job.jobType}</p>
                  </div>
                  <span className="status-pill">{job.status.replace(/_/g, " ")}</span>
                </article>
              ))}
              {scheduledJobs.length === 0 && <p className="empty">No scheduled jobs yet.</p>}
            </div>
          </section>

          <section className="panel chart-panel">
            <div className="panel-header">
              <h2>Jobs by Type</h2>
            </div>
            {summary?.jobsByType.length ? (
              <div className="metric-list">
                {summary.jobsByType.map((item) => (
                  <div className="metric-row" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                    <em>{percent.format(item.percent)}</em>
                  </div>
                ))}
              </div>
            ) : <div className="empty-chart"><span>!</span> No data available</div>}
          </section>

          <section className="panel chart-panel">
            <div className="panel-header">
              <h2>Jobs by Source</h2>
              <button className="link-button">View All</button>
            </div>
            <div className="source-chart">
              <div className="pie-chart" />
              <div className="legend-list">
                {(summary?.jobsBySource.length ? summary.jobsBySource : [{ label: "Unknown", count: 0, percent: 0 }]).map((item, index) => (
                  <span key={item.label}><i className={sourceColor(index)} /> {item.label} <b>{item.count} ({percent.format(item.percent)})</b></span>
                ))}
              </div>
            </div>
          </section>
        </div>}

        {activeView === "schedule" && (
          <section className="schedule-shell">
            <div className="schedule-toolbar">
              <button className="schedule-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
              <div className="schedule-range">
                <button className="icon-button" onClick={() => setWeekStart((current) => addDays(current, -7))} aria-label="Previous week"><ChevronLeft size={18} /></button>
                <strong>{formatWeekRange(weekStart)}</strong>
                <button className="icon-button" onClick={() => setWeekStart((current) => addDays(current, 7))} aria-label="Next week"><ChevronRight size={18} /></button>
              </div>
              <div className="calendar-tabs">
                {(["employees", "day", "week", "month"] as CalendarMode[]).map((mode) => (
                  <button key={mode} className={calendarMode === mode ? "active" : ""} onClick={() => setCalendarMode(mode)}>
                    {mode === "employees" ? "Employees" : mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="calendar-grid">
              <div className="calendar-corner" />
              {weekDays.map((day) => (
                <div className="calendar-day-head" key={day.toISOString()}>
                  <span>{dayLabels[day.getDay()]}</span>
                  <strong>{day.getDate()}</strong>
                </div>
              ))}
              <div className="calendar-time all-day">All Day</div>
              {weekDays.map((day) => <button className="calendar-cell all-day-cell" key={`all-${day.toISOString()}`} onClick={() => setSlotPrompt({ date: day, hour: 9 })} />)}
              {calendarHours.map((hour) => (
                <Fragment key={`row-${hour}`}>
                  <div className="calendar-time" key={`label-${hour}`}>{formatHour(hour)}</div>
                  {weekDays.map((day) => {
                    const slotJobs = scheduledJobs.filter((job) => {
                      if (!job.scheduledStart) return false;
                      const start = new Date(job.scheduledStart);
                      return sameCalendarDay(start, day) && start.getHours() === hour;
                    });
                    return (
                      <button className="calendar-cell" key={`${day.toISOString()}-${hour}`} onClick={() => setSlotPrompt({ date: day, hour })}>
                        {slotJobs.map((job) => (
                          <span className="calendar-job" key={job.id}>
                            <strong>{job.customer.firstName} {job.customer.lastName}</strong>
                            <em>{job.title}</em>
                            <small>#{job.jobNumber}</small>
                          </span>
                        ))}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </section>
        )}

        {slotPrompt && (
          <div className="modal-backdrop" onClick={() => setSlotPrompt(null)}>
            <div className="create-modal" onClick={(event) => event.stopPropagation()}>
              <h2>What would you like to create?</h2>
              <p>{slotPrompt.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} at {formatHour(slotPrompt.hour)}</p>
              <div className="create-options">
                <button onClick={() => openJobFromSlot(slotPrompt)}><Wrench size={18} /> Job</button>
                <button onClick={() => setSlotPrompt(null)}><CalendarDays size={18} /> Event</button>
              </div>
            </div>
          </div>
        )}

        {activeView === "customers" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Add Customer</h2><Users size={18} /></div>
              <form className="record-form" onSubmit={createCustomer}>
                <input placeholder="First name" value={customerForm.firstName} onChange={(event) => setCustomerForm({ ...customerForm, firstName: event.target.value })} required />
                <input placeholder="Last name" value={customerForm.lastName} onChange={(event) => setCustomerForm({ ...customerForm, lastName: event.target.value })} required />
                <input placeholder="Phone" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} required />
                <input placeholder="Email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
                <input placeholder="Source" value={customerForm.source} onChange={(event) => setCustomerForm({ ...customerForm, source: event.target.value })} />
                <input placeholder="Street" value={customerForm.street1} onChange={(event) => setCustomerForm({ ...customerForm, street1: event.target.value })} />
                <input placeholder="City" value={customerForm.city} onChange={(event) => setCustomerForm({ ...customerForm, city: event.target.value })} />
                <input placeholder="State" value={customerForm.state} onChange={(event) => setCustomerForm({ ...customerForm, state: event.target.value })} />
                <input placeholder="Postal code" value={customerForm.postalCode} onChange={(event) => setCustomerForm({ ...customerForm, postalCode: event.target.value })} />
                <button className="primary" type="submit">Add customer</button>
              </form>
            </section>
            <section className="panel wide">
              <div className="panel-header"><h2>Customer List</h2><Users size={18} /></div>
              <div className="table-list">
                {customers.map((customer) => (
                  <article key={customer.id}>
                    <div>
                      <strong>{customer.firstName} {customer.lastName}</strong>
                      <span>{customer.phone} {customer.email ? `/ ${customer.email}` : ""}</span>
                    </div>
                    <button className="text-button" onClick={() => removeCustomer(customer.id)}>Remove</button>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "jobs" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Add Job</h2><Wrench size={18} /></div>
              <form className="record-form" onSubmit={createJob}>
                <select value={jobForm.customerId} onChange={(event) => setJobForm({ ...jobForm, customerId: event.target.value })} required>
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}
                </select>
                <input placeholder="Job title" value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} required />
                <select value={jobForm.jobType} onChange={(event) => setJobForm({ ...jobForm, jobType: event.target.value })}>
                  <option>Lockout</option>
                  <option>Rekey</option>
                  <option>Lock install</option>
                  <option>Car key</option>
                  <option>Ignition</option>
                  <option>Safe</option>
                  <option>Access control</option>
                </select>
                <input type="datetime-local" value={jobForm.scheduledStart} onChange={(event) => setJobForm({ ...jobForm, scheduledStart: event.target.value })} />
                <input type="datetime-local" value={jobForm.scheduledEnd} onChange={(event) => setJobForm({ ...jobForm, scheduledEnd: event.target.value })} />
                <input placeholder="Description" value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} />
                <button className="primary" type="submit">Create job</button>
              </form>
            </section>
            <section className="panel wide">
              <div className="panel-header"><h2>All Jobs</h2><CalendarDays size={18} /></div>
              <div className="job-list">
                {jobs.map((job) => (
                  <article className="job-row" key={job.id}>
                    <div className="job-time"><strong>#{job.jobNumber}</strong><span>{job.status}</span></div>
                    <div><h3>{job.title}</h3><p>{job.customer.firstName} {job.customer.lastName} / {job.jobType}</p></div>
                    <span className="status-pill">{job.scheduledStart ? new Date(job.scheduledStart).toLocaleDateString() : "Unscheduled"}</span>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeView === "invoices" && (
          <div className="content-grid">
            <section className="panel">
              <div className="panel-header"><h2>Create Invoice</h2><CreditCard size={18} /></div>
              <form className="record-form" onSubmit={createInvoice}>
                <select value={invoiceForm.customerId} onChange={(event) => setInvoiceForm({ ...invoiceForm, customerId: event.target.value })} required>
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.firstName} {customer.lastName}</option>)}
                </select>
                <select value={invoiceForm.jobId} onChange={(event) => setInvoiceForm({ ...invoiceForm, jobId: event.target.value })}>
                  <option value="">No job attached</option>
                  {jobs.filter((job) => !invoiceForm.customerId || job.customer.id === invoiceForm.customerId).map((job) => <option key={job.id} value={job.id}>#{job.jobNumber} {job.title}</option>)}
                </select>
                <input placeholder="Line item" value={invoiceForm.itemName} onChange={(event) => setInvoiceForm({ ...invoiceForm, itemName: event.target.value })} required />
                <input placeholder="Quantity" value={invoiceForm.quantity} onChange={(event) => setInvoiceForm({ ...invoiceForm, quantity: event.target.value })} required />
                <input placeholder="Unit price, dollars" value={invoiceForm.unitPrice} onChange={(event) => setInvoiceForm({ ...invoiceForm, unitPrice: event.target.value })} required />
                <input placeholder="Tax, dollars" value={invoiceForm.tax} onChange={(event) => setInvoiceForm({ ...invoiceForm, tax: event.target.value })} />
                <button className="primary" type="submit">Create invoice</button>
              </form>
            </section>
            <section className="panel wide">
              <div className="panel-header"><h2>Invoices</h2><CreditCard size={18} /></div>
              <div className="table-list">
                {invoices.map((invoice) => (
                  <article key={invoice.id}>
                    <div>
                      <strong>Invoice #{invoice.invoiceNumber}</strong>
                      <span>{invoice.customer.firstName} {invoice.customer.lastName} / {money.format(invoice.total / 100)} / {invoice.status}</span>
                    </div>
                  </article>
                ))}
                {invoices.length === 0 && <p className="empty">No invoices yet.</p>}
              </div>
            </section>
          </div>
        )}

        {activeView === "api" && (
          <section className="panel">
            <div className="panel-header"><h2>API Access</h2><KeyRound size={18} /></div>
            <div className="api-key-form">
              <input value={apiKeyName} onChange={(event) => setApiKeyName(event.target.value)} aria-label="API key name" />
              <button className="primary" type="button" onClick={createApiKey}>Generate key</button>
            </div>
            {newApiToken && (
              <div className="token-box">
                <strong>One-time token</strong>
                <code>{newApiToken}</code>
              </div>
            )}
            <div className="compact-list">
              {apiKeys.slice(0, 6).map((item) => (
                <article key={item.id}>
                  <strong>{item.name}</strong>
                  <span>{item.tokenPrefix} / {item.active ? "active" : "revoked"}</span>
                  {item.active && <button className="text-button" type="button" onClick={() => revokeApiKey(item.id)}>Revoke</button>}
                </article>
              ))}
              {apiKeys.length === 0 && <p className="empty">No API keys for this location.</p>}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
