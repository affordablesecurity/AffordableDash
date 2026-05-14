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
  FolderOpen,
  Headphones,
  Home,
  KeyRound,
  Laptop,
  ListChecks,
  LogOut,
  Map,
  MessageSquareText,
  MoreHorizontal,
  Navigation,
  Percent,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  UserPlus,
  Users,
  WalletCards,
  Wrench
} from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  addresses?: Address[];
};

type Address = {
  id: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
};

type Technician = {
  id: string;
  name: string;
  email?: string;
  phone: string;
  color: string;
};

type JobLineDraft = {
  id: string;
  category: "service" | "material";
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

type JobTemplate = {
  id: string;
  name: string;
  title: string;
  jobType: string;
  leadSource?: string;
  tags: string[];
  privateNotes: string;
  lineItems: Omit<JobLineDraft, "id">[];
};

type PriceBookCategory = {
  id: string;
  name: string;
  description?: string;
};

type PriceBookItem = {
  id: string;
  name: string;
  modelNumber?: string;
  itemType: "service" | "material";
  description?: string;
  price: number;
  cost: number;
  taxable: boolean;
  onlineBooking: boolean;
  imageName?: string;
  categoryId?: string;
  category?: PriceBookCategory;
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
  leadSource?: string;
  tags?: string[];
  status: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  description?: string;
  internalNotes?: string;
  attachments?: string[];
  customer: Customer;
  address?: Address;
  technician?: Technician;
  lineItems?: Array<{ id: string; category: string; name: string; quantity: string; unitPrice: number }>;
  invoices?: Invoice[];
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
  location: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    phone?: string;
    street1?: string;
    street2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    timezone?: string;
    companyColor?: string;
    website?: string;
    industry?: string;
    description?: string;
    termsOfService?: string;
    logoName?: string;
  };
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

type View = "dispatch" | "schedule" | "customers" | "jobs" | "invoices" | "reports" | "pricebook" | "settings" | "api";
type CalendarMode = "employees" | "day" | "week" | "month";
type SlotPrompt = { date: Date; hour: number } | null;
type CrmOptionKind = "leadSource" | "tag" | "jobType" | "jobField" | "checklist" | "servicePlan";
type SettingsSection = "overview" | "company" | "tags" | "leadSources" | "jobTypes" | "jobFields" | "checklists" | "servicePlans";
type CrmOptions = {
  leadSources: string[];
  tags: string[];
  jobTypes: string[];
  jobFields: string[];
  checklists: string[];
  servicePlans: string[];
};

type ReportRow = { label: string; value: string; detail?: string };
type ReportItem = { id: string; label: string; value: string; detail: string; rows: ReportRow[] };
type ReportSection = { title: string; items: ReportItem[] };
type ReportChart = {
  id: string;
  title: string;
  metricLabel: string;
  metricValue: string;
  format: "money" | "number";
  bars: Array<{ label: string; value: number; previousValue?: number }>;
};
type ReportsPayload = {
  overview: {
    jobs: number;
    completedJobs: number;
    invoices: number;
    revenue: string;
    paidRevenue: string;
    paidRate: string;
  };
  dashboards: {
    businessOwner: ReportChart[];
    leads: ReportChart[];
  };
  sections: ReportSection[];
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const percent = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dayLabels = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const calendarHours = Array.from({ length: 24 }, (_item, hour) => hour);
const reportDateRanges = [
  { value: "today", label: "Today" },
  { value: "weekToDate", label: "Week to date" },
  { value: "monthToDate", label: "Month to date" },
  { value: "quarterToDate", label: "Quarter to date" },
  { value: "yearToDate", label: "Year to date" },
  { value: "lastWeek", label: "Last week" },
  { value: "lastMonth", label: "Last month" },
  { value: "lastYear", label: "Last year" }
];
const reportGroupings = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" }
];
const jobTemplates: JobTemplate[] = [
  {
    id: "residential-repair-lock",
    name: "Residential repair lock",
    title: "Residential lock repair",
    jobType: "Residential Lock Repair",
    leadSource: "Phone Call",
    tags: ["residential", "repair"],
    privateNotes: "Confirm lock condition, door alignment, and whether hardware can be repaired before replacing.",
    lineItems: [
      { category: "service", name: "Service call", description: "Dispatch and diagnosis", quantity: "1", unitPrice: "85" },
      { category: "service", name: "Residential lock labor", description: "Repair or adjust lock hardware", quantity: "1", unitPrice: "95" }
    ]
  },
  {
    id: "car-lockout",
    name: "Car lockout",
    title: "Car lockout service",
    jobType: "Car Lockout Service",
    leadSource: "Phone Call",
    tags: ["automotive", "lockout"],
    privateNotes: "Verify vehicle make, model, year, location, and proof of ownership before opening.",
    lineItems: [
      { category: "service", name: "Vehicle lockout", description: "Non-destructive vehicle entry", quantity: "1", unitPrice: "85" }
    ]
  },
  {
    id: "commercial-rekey",
    name: "Commercial rekey",
    title: "Commercial rekey",
    jobType: "Rekey",
    leadSource: "Referral",
    tags: ["commercial", "rekey"],
    privateNotes: "Confirm key count, lock count, restricted keyway needs, and site contact.",
    lineItems: [
      { category: "service", name: "Commercial service call", description: "Dispatch and site assessment", quantity: "1", unitPrice: "95" },
      { category: "service", name: "Rekey labor", description: "Per cylinder", quantity: "1", unitPrice: "25" },
      { category: "material", name: "Duplicate key", description: "Standard key copy", quantity: "2", unitPrice: "4" }
    ]
  }
];

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

function statusLabel(status: string) {
  return status.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

function addressLine(address?: Address) {
  if (!address) return "No address selected";
  return [address.street1, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
}

function jobInvoiceTotal(job: Job) {
  return (job.invoices ?? []).reduce((sum, invoice) => sum + invoice.total, 0);
}

function jobPaymentStatus(job: Job) {
  const invoices = job.invoices ?? [];
  if (!invoices.length) return "Unpaid";
  if (invoices.some((invoice) => invoice.status === "PAID")) return "Paid";
  if (invoices.some((invoice) => invoice.status === "SENT" || invoice.status === "DRAFT")) return "Unpaid";
  return invoices[0].status;
}

function splitTags(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function dollarsToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

function lineDraft(category: "service" | "material", name = "", unitPrice = ""): JobLineDraft {
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category,
    name,
    description: "",
    quantity: "1",
    unitPrice
  };
}

function formatChartValue(value: number, format: "money" | "number") {
  return format === "money" ? money.format(value / 100) : new Intl.NumberFormat("en-US").format(value);
}

function shortLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 16)}...` : value;
}

const optionKeyByKind: Record<CrmOptionKind, keyof CrmOptions> = {
  leadSource: "leadSources",
  tag: "tags",
  jobType: "jobTypes",
  jobField: "jobFields",
  checklist: "checklists",
  servicePlan: "servicePlans"
};

const settingsSections: Array<{
  id: Exclude<SettingsSection, "overview">;
  kind: CrmOptionKind;
  title: string;
  description: string;
  placeholder: string;
}> = [
  { id: "tags", kind: "tag", title: "Tags", description: "Labels you can attach to jobs and customers for filtering and automation.", placeholder: "commercial, emergency, rekey" },
  { id: "leadSources", kind: "leadSource", title: "Lead Sources", description: "Where jobs and customers came from so reports can show booking performance.", placeholder: "Google Ads, Referral, Phone Call" },
  { id: "jobTypes", kind: "jobType", title: "Job Types", description: "Standard locksmith job categories used on jobs, schedules, invoices, and reports.", placeholder: "Residential lock repair" },
  { id: "jobFields", kind: "jobField", title: "Job Fields", description: "Custom internal prompts your team can track on jobs.", placeholder: "Gate code, Lock brand, Key count" },
  { id: "checklists", kind: "checklist", title: "Checklists", description: "Reusable task lists for technicians and office workflows.", placeholder: "Arrival checklist" },
  { id: "servicePlans", kind: "servicePlan", title: "Service Plans", description: "Plans for recurring maintenance, priority customers, and contract work.", placeholder: "Commercial priority" }
];

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
  const [jobPageMode, setJobPageMode] = useState<"list" | "create">("list");
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [createClientInline, setCreateClientInline] = useState(false);
  const [jobClientSearch, setJobClientSearch] = useState("");
  const [jobAddressSearch, setJobAddressSearch] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [jobTemplateId, setJobTemplateId] = useState("");
  const [jobLines, setJobLines] = useState<JobLineDraft[]>([]);
  const [jobAttachments, setJobAttachments] = useState<string[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [priceBookCategories, setPriceBookCategories] = useState<PriceBookCategory[]>([]);
  const [priceBookSearch, setPriceBookSearch] = useState("");
  const [priceBookTab, setPriceBookTab] = useState<"items" | "categories">("items");
  const [priceBookModal, setPriceBookModal] = useState<"item" | "category" | null>(null);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("overview");
  const [settingsDraft, setSettingsDraft] = useState("");
  const [companySettingsForm, setCompanySettingsForm] = useState({
    companyName: "",
    phone: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    postalCode: "",
    timezone: "America/Phoenix",
    companyColor: "#26aef2",
    website: "",
    industry: "Locksmith",
    description: "",
    termsOfService: "",
    logoName: ""
  });
  const [reports, setReports] = useState<ReportsPayload | null>(null);
  const [selectedReportId, setSelectedReportId] = useState("job-revenue-earned");
  const [reportDashboard, setReportDashboard] = useState<"businessOwner" | "leads" | "jobs">("businessOwner");
  const [reportDateRange, setReportDateRange] = useState("monthToDate");
  const [reportShowBy, setReportShowBy] = useState("year");
  const [priceBookItemForm, setPriceBookItemForm] = useState({
    name: "",
    modelNumber: "",
    itemType: "service" as "service" | "material",
    description: "",
    price: "",
    cost: "",
    categoryId: "",
    taxable: true,
    onlineBooking: false,
    imageName: ""
  });
  const [priceBookCategoryForm, setPriceBookCategoryForm] = useState({ name: "", description: "" });
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeyName, setApiKeyName] = useState("Partner API");
  const [newApiToken, setNewApiToken] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [crmOptions, setCrmOptions] = useState<CrmOptions>({
    leadSources: ["Unknown", "Online Booking", "Google Ads", "Facebook Ads", "Yelp Ads", "Referral", "Phone Call"],
    tags: [],
    jobTypes: ["Car Lockout Service", "House Lockout Service", "Rekey", "Lock Install", "Car Key", "Ignition", "Safe", "Access Control"],
    jobFields: ["Gate code", "Lock brand", "Key count", "Door condition", "Vehicle year/make/model"],
    checklists: ["Arrival checklist", "Vehicle lockout checklist", "Rekey checklist", "Invoice review"],
    servicePlans: ["Residential maintenance", "Commercial priority", "Property manager"]
  });
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
    addressId: "",
    technicianId: "",
    title: "",
    jobType: "Car Lockout Service",
    scheduledStart: "",
    scheduledEnd: "",
    description: "",
    internalNotes: "",
    leadSource: "Unknown",
    tags: ""
  });
  const [jobClientForm, setJobClientForm] = useState<CustomerForm>({
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
  const selectedJobCustomer = customers.find((customer) => customer.id === jobForm.customerId);
  const selectedJobAddresses = selectedJobCustomer?.addresses ?? [];
  const clientMatches = useMemo(() => {
    const query = jobClientSearch.trim().toLowerCase();
    if (!query) return customers.slice(0, 8);
    return customers.filter((customer) => [
      customer.firstName,
      customer.lastName,
      customer.phone,
      customer.email ?? "",
      ...(customer.addresses ?? []).map(addressLine)
    ].some((value) => value.toLowerCase().includes(query))).slice(0, 8);
  }, [customers, jobClientSearch]);
  const addressMatches = useMemo(() => {
    const query = jobAddressSearch.trim().toLowerCase();
    if (!query) return selectedJobAddresses;
    return selectedJobAddresses.filter((address) => addressLine(address).toLowerCase().includes(query));
  }, [jobAddressSearch, selectedJobAddresses]);
  const filteredJobs = useMemo(() => {
    const query = jobSearch.trim().toLowerCase();
    return jobs.filter((job) => {
      const matchesStatus = jobStatusFilter === "all" || (jobStatusFilter === "open" ? job.status === "LEAD" || job.status === "SCHEDULED" : job.status === jobStatusFilter);
      const matchesQuery = !query || [
        String(job.jobNumber),
        job.title,
        job.jobType,
        job.leadSource ?? "",
        ...(job.tags ?? []),
        job.customer.firstName,
        job.customer.lastName,
        addressLine(job.address ?? job.customer.addresses?.[0])
      ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [jobSearch, jobStatusFilter, jobs]);
  const jobCounts = useMemo(() => ({
    open: jobs.filter((job) => job.status === "LEAD" || job.status === "SCHEDULED").length,
    dispatched: jobs.filter((job) => job.status === "DISPATCHED").length,
    inProgress: jobs.filter((job) => job.status === "IN_PROGRESS").length,
    completed: jobs.filter((job) => job.status === "COMPLETED").length,
    canceled: jobs.filter((job) => job.status === "CANCELED").length
  }), [jobs]);
  const jobLineSubtotal = useMemo(() => jobLines.reduce((sum, item) => sum + (Number(item.quantity || "0") * dollarsToCents(item.unitPrice)), 0), [jobLines]);
  const jobLineTax = Math.round(jobLineSubtotal * 0.094);
  const jobLineTotal = jobLineSubtotal + jobLineTax;
  const filteredPriceBookItems = useMemo(() => {
    const query = priceBookSearch.trim().toLowerCase();
    if (!query) return priceBookItems;
    return priceBookItems.filter((item) => [
      item.name,
      item.description ?? "",
      item.modelNumber ?? "",
      item.category?.name ?? "",
      item.itemType
    ].some((value) => value.toLowerCase().includes(query)));
  }, [priceBookItems, priceBookSearch]);
  const selectedSettings = settingsSections.find((section) => section.id === settingsSection);
  const selectedSettingsValues = selectedSettings ? crmOptions[optionKeyByKind[selectedSettings.kind]] : [];
  const activeLocationAccess = locations.find((item) => item.location.id === activeLocationId) ?? locations[0];
  const reportItems = reports?.sections.flatMap((section) => section.items) ?? [];
  const selectedReport = reportItems.find((item) => item.id === selectedReportId) ?? reportItems[0];
  const activeCharts = reportDashboard === "leads"
    ? reports?.dashboards.leads ?? []
    : reports?.dashboards.businessOwner ?? [];
  const reportTitle = reportDashboard === "leads" ? "Leads" : reportDashboard === "jobs" ? "Jobs" : "Business Owner";
  const companyAddressPreview = [
    activeLocationAccess?.location.street1,
    activeLocationAccess?.location.city,
    activeLocationAccess?.location.state,
    activeLocationAccess?.location.postalCode
  ].filter(Boolean).join(", ") || "No company address saved yet";

  async function loadDashboard() {
    const [summaryResult, customersResult, jobsResult, invoicesResult, techniciansResult, optionsResult, priceBookResult] = await Promise.all([
      api<Summary>("/api/settings/summary"),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ jobs: Job[] }>("/api/jobs"),
      api<{ invoices: Invoice[] }>("/api/invoices"),
      api<{ technicians: Technician[] }>("/api/technicians"),
      api<CrmOptions>("/api/settings/options"),
      api<{ categories: PriceBookCategory[]; items: PriceBookItem[] }>("/api/pricebook")
    ]);

    setSummary(summaryResult);
    setCustomers(customersResult.customers);
    setJobs(jobsResult.jobs);
    setInvoices(invoicesResult.invoices);
    setTechnicians(techniciansResult.technicians);
    setCrmOptions((current) => ({ ...current, ...optionsResult }));
    setPriceBookCategories(priceBookResult.categories);
    setPriceBookItems(priceBookResult.items);

    const [locationResult, apiKeyResult] = await Promise.all([
      api<{ activeLocationId: string; locations: LocationAccess[] }>("/api/locations"),
      api<{ apiKeys: ApiKey[] }>("/api/location-api-keys")
    ]);
    setLocations(locationResult.locations);
    setActiveLocationId(locationResult.activeLocationId);
    setApiKeys(apiKeyResult.apiKeys);
  }

  async function loadReports() {
    const query = new URLSearchParams({ dateRange: reportDateRange, showBy: reportShowBy });
    const result = await api<ReportsPayload>(`/api/reports/jobs?${query.toString()}`);
    setReports(result);
  }

  useEffect(() => {
    if (!token) return;
    loadDashboard().catch((err: Error) => setError(err.message));
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadReports().catch((err: Error) => setError(err.message));
  }, [token, reportDateRange, reportShowBy]);

  useEffect(() => {
    if (!activeLocationAccess) return;
    setCompanySettingsForm({
      companyName: activeLocationAccess.organization.name || activeLocationAccess.location.name || "",
      phone: activeLocationAccess.location.phone ?? "",
      street1: activeLocationAccess.location.street1 ?? "",
      street2: activeLocationAccess.location.street2 ?? "",
      city: activeLocationAccess.location.city ?? "",
      state: activeLocationAccess.location.state ?? "",
      postalCode: activeLocationAccess.location.postalCode ?? "",
      timezone: activeLocationAccess.location.timezone ?? "America/Phoenix",
      companyColor: activeLocationAccess.location.companyColor ?? "#26aef2",
      website: activeLocationAccess.location.website ?? "",
      industry: activeLocationAccess.location.industry ?? "Locksmith",
      description: activeLocationAccess.location.description ?? "",
      termsOfService: activeLocationAccess.location.termsOfService ?? "",
      logoName: activeLocationAccess.location.logoName ?? ""
    });
  }, [activeLocationAccess]);

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

  async function saveJobOption(kind: CrmOptionKind, name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    await api("/api/settings/options", {
      method: "POST",
      body: JSON.stringify({ kind, name: cleanName })
    });
    setCrmOptions((current) => {
      const key = optionKeyByKind[kind];
      return { ...current, [key]: [...new Set([...current[key], cleanName])].sort() };
    });
  }

  async function createSettingsOption(event: FormEvent) {
    event.preventDefault();
    if (!selectedSettings) return;
    setError("");
    await saveJobOption(selectedSettings.kind, settingsDraft);
    setSettingsDraft("");
  }

  async function removeSettingsOption(kind: CrmOptionKind, name: string) {
    setError("");
    await api("/api/settings/options", {
      method: "DELETE",
      body: JSON.stringify({ kind, name })
    });
    setCrmOptions((current) => {
      const key = optionKeyByKind[kind];
      return { ...current, [key]: current[key].filter((item) => item !== name) };
    });
  }

  async function saveCompanySettings(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = await api<{ organization: LocationAccess["organization"]; location: LocationAccess["location"] }>("/api/locations/active/company-settings", {
      method: "PATCH",
      body: JSON.stringify(companySettingsForm)
    });
    setLocations((current) => current.map((item) => item.location.id === result.location.id
      ? { ...item, organization: result.organization, location: result.location }
      : item));
  }

  async function saveInlineJobClient() {
    setError("");
    const customerResult = await api<{ customer: Customer }>("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        firstName: jobClientForm.firstName,
        lastName: jobClientForm.lastName,
        phone: jobClientForm.phone,
        email: jobClientForm.email,
        source: jobForm.leadSource || jobClientForm.source,
        address: jobClientForm.street1 ? {
          street1: jobClientForm.street1,
          city: jobClientForm.city,
          state: jobClientForm.state,
          postalCode: jobClientForm.postalCode
        } : undefined
      })
    });
    const customer = customerResult.customer;
    setCustomers((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
    setJobForm((current) => ({ ...current, customerId: customer.id, addressId: customer.addresses?.[0]?.id ?? "" }));
    setJobClientSearch(`${customer.firstName} ${customer.lastName} / ${customer.phone}`);
    setJobAddressSearch(customer.addresses?.[0] ? addressLine(customer.addresses[0]) : "");
    setCreateClientInline(false);
    setJobClientForm({ firstName: "", lastName: "", phone: "", email: "", source: "", street1: "", city: "", state: "CA", postalCode: "" });
  }

  async function addJobTag(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const nextTags = [...new Set([...splitTags(jobForm.tags), cleanName])];
    setJobForm((current) => ({ ...current, tags: nextTags.join(", ") }));
    setTagDraft("");
    await saveJobOption("tag", cleanName);
  }

  function selectJobCustomer(customer: Customer) {
    setCreateClientInline(false);
    setJobForm((current) => ({ ...current, customerId: customer.id, addressId: customer.addresses?.[0]?.id ?? "" }));
    setJobClientSearch(`${customer.firstName} ${customer.lastName} / ${customer.phone}`);
    setJobAddressSearch(customer.addresses?.[0] ? addressLine(customer.addresses[0]) : "");
  }

  function selectJobAddress(address: Address) {
    setJobForm((current) => ({ ...current, addressId: address.id }));
    setJobAddressSearch(addressLine(address));
  }

  function updateJobLine(id: string, patch: Partial<JobLineDraft>) {
    setJobLines((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addJobLine(category: "service" | "material") {
    setJobLines((current) => [...current, lineDraft(category, category === "service" ? "Service call" : "Material")]);
  }

  function addPriceBookItemToJob(itemId: string) {
    const item = priceBookItems.find((entry) => entry.id === itemId);
    if (!item) return;
    setJobLines((current) => [...current, {
      id: `pricebook-${item.id}-${Date.now()}`,
      category: item.itemType,
      name: item.name,
      description: item.description ?? "",
      quantity: "1",
      unitPrice: String((item.price / 100).toFixed(2))
    }]);
  }

  async function createPriceBookCategory(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = await api<{ category: PriceBookCategory }>("/api/pricebook/categories", {
      method: "POST",
      body: JSON.stringify(priceBookCategoryForm)
    });
    setPriceBookCategories((current) => [...current.filter((item) => item.id !== result.category.id), result.category].sort((a, b) => a.name.localeCompare(b.name)));
    setPriceBookCategoryForm({ name: "", description: "" });
    setPriceBookModal(null);
  }

  async function createPriceBookItem(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = await api<{ item: PriceBookItem }>("/api/pricebook/items", {
      method: "POST",
      body: JSON.stringify({
        ...priceBookItemForm,
        categoryId: priceBookItemForm.categoryId || undefined,
        modelNumber: priceBookItemForm.modelNumber || undefined,
        description: priceBookItemForm.description || undefined,
        imageName: priceBookItemForm.imageName || undefined,
        price: dollarsToCents(priceBookItemForm.price),
        cost: dollarsToCents(priceBookItemForm.cost)
      })
    });
    setPriceBookItems((current) => [result.item, ...current]);
    setPriceBookItemForm({ name: "", modelNumber: "", itemType: "service", description: "", price: "", cost: "", categoryId: "", taxable: true, onlineBooking: false, imageName: "" });
    setPriceBookModal(null);
  }

  async function deletePriceBookItem(id: string) {
    setError("");
    await api(`/api/pricebook/items/${id}`, { method: "DELETE" });
    setPriceBookItems((current) => current.filter((item) => item.id !== id));
  }

  function applyJobTemplate(templateId: string) {
    setJobTemplateId(templateId);
    const template = jobTemplates.find((item) => item.id === templateId);
    if (!template) return;
    setJobForm((current) => ({
      ...current,
      title: template.title,
      jobType: template.jobType,
      leadSource: template.leadSource ?? current.leadSource,
      tags: [...new Set([...splitTags(current.tags), ...template.tags])].join(", "),
      internalNotes: current.internalNotes ? `${current.internalNotes}\n${template.privateNotes}` : template.privateNotes
    }));
    setJobLines(template.lineItems.map((item) => ({ ...item, id: `${item.category}-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
    template.tags.forEach((tag) => saveJobOption("tag", tag).catch(() => undefined));
    saveJobOption("jobType", template.jobType).catch(() => undefined);
    if (template.leadSource) saveJobOption("leadSource", template.leadSource).catch(() => undefined);
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    setError("");
    let customerId = jobForm.customerId;
    let addressId = jobForm.addressId || undefined;

    if (!customerId && createClientInline) {
      const customerResult = await api<{ customer: Customer }>("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          firstName: jobClientForm.firstName,
          lastName: jobClientForm.lastName,
          phone: jobClientForm.phone,
          email: jobClientForm.email,
          source: jobForm.leadSource || jobClientForm.source,
          address: jobClientForm.street1 ? {
            street1: jobClientForm.street1,
            city: jobClientForm.city,
            state: jobClientForm.state,
            postalCode: jobClientForm.postalCode
          } : undefined
        })
      });
      customerId = customerResult.customer.id;
      addressId = customerResult.customer.addresses?.[0]?.id;
    }

    if (!customerId) {
      setError("Select an existing client or create a new client before creating the job.");
      return;
    }

    const tagText = splitTags(jobForm.tags).length ? `Tags: ${splitTags(jobForm.tags).join(", ")}` : "";
    const noteText = [jobForm.internalNotes, tagText].filter(Boolean).join("\n");

    await api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        addressId,
        technicianId: jobForm.technicianId || undefined,
        title: jobForm.title || jobForm.jobType,
        jobType: jobForm.jobType,
        leadSource: jobForm.leadSource,
        tags: splitTags(jobForm.tags),
        status: "SCHEDULED",
        scheduledStart: jobForm.scheduledStart ? new Date(jobForm.scheduledStart).toISOString() : undefined,
        scheduledEnd: jobForm.scheduledEnd ? new Date(jobForm.scheduledEnd).toISOString() : undefined,
        description: jobForm.description,
        internalNotes: noteText || undefined,
        attachments: jobAttachments,
        lineItems: jobLines.filter((item) => item.name.trim()).map((item) => ({
          category: item.category,
          name: item.name,
          description: item.description || undefined,
          quantity: Number(item.quantity || "1"),
          unitPrice: dollarsToCents(item.unitPrice),
          taxable: true
        }))
      })
    });
    setJobForm({
      customerId: "",
      addressId: "",
      technicianId: "",
      title: "",
      jobType: "Car Lockout Service",
      scheduledStart: "",
      scheduledEnd: "",
      description: "",
      internalNotes: "",
      leadSource: "Unknown",
      tags: ""
    });
    setJobClientForm({ firstName: "", lastName: "", phone: "", email: "", source: "", street1: "", city: "", state: "CA", postalCode: "" });
    setCreateClientInline(false);
    setJobClientSearch("");
    setJobAddressSearch("");
    setTagDraft("");
    setJobTemplateId("");
    setJobLines([]);
    setJobAttachments([]);
    await loadDashboard();
    setJobPageMode("list");
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
    setJobPageMode("create");
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
          <button className={activeView === "pricebook" ? "active" : ""} onClick={() => setActiveView("pricebook")}><Tag size={18} /> Pricebook</button>

          <span className="nav-section">More</span>
          <button className={activeView === "reports" ? "active" : ""} onClick={() => setActiveView("reports")}><ListChecks size={18} /> Reports</button>
          <button className={activeView === "settings" ? "active" : ""} onClick={() => setActiveView("settings")}><Settings size={18} /> Settings</button>
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
              <button onClick={() => { setActiveView("jobs"); setJobPageMode("create"); setAddMenuOpen(false); }}><Wrench size={16} /> Job</button>
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

        {activeView === "dispatch" && <div className="stats-grid">
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
          jobPageMode === "list" ? (
            <section className="jobs-page">
              <div className="section-actions">
                <div className="breadcrumb"><Wrench size={17} /> Jobs</div>
                <div className="action-buttons">
                  <button className="outline-button"><Upload size={17} /> Import Jobs</button>
                  <button className="primary" onClick={() => setJobPageMode("create")}><Plus size={18} /> Create Job</button>
                </div>
              </div>

              <div className="job-summary-panel">
                <button onClick={() => setJobStatusFilter("open")} className={jobStatusFilter === "open" ? "selected" : ""}>
                  <FolderOpen size={21} />
                  <strong>{jobCounts.open}</strong>
                  <span>Open</span>
                </button>
                <button onClick={() => setJobStatusFilter("DISPATCHED")} className={jobStatusFilter === "DISPATCHED" ? "selected" : ""}>
                  <Navigation size={21} />
                  <strong>{jobCounts.dispatched}</strong>
                  <span>On My Way</span>
                </button>
                <button onClick={() => setJobStatusFilter("IN_PROGRESS")} className={jobStatusFilter === "IN_PROGRESS" ? "selected" : ""}>
                  <Clock3 size={21} />
                  <strong>{jobCounts.inProgress}</strong>
                  <span>In Progress</span>
                </button>
                <button onClick={() => setJobStatusFilter("COMPLETED")} className={jobStatusFilter === "COMPLETED" ? "selected" : ""}>
                  <CheckCheck size={21} />
                  <strong>{jobCounts.completed}</strong>
                  <span>Completed</span>
                </button>
                <button onClick={() => setJobStatusFilter("CANCELED")} className={jobStatusFilter === "CANCELED" ? "selected" : ""}>
                  <Trash2 size={21} />
                  <strong>{jobCounts.canceled}</strong>
                  <span>Canceled</span>
                </button>
              </div>

              <div className="jobs-table-panel">
                <div className="jobs-tools">
                  <div className="search-box table-search">
                    <Search size={18} />
                    <input placeholder="Search jobs, clients, addresses" value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} />
                  </div>
                  <select aria-label="Tags">
                    <option>Tags</option>
                  </select>
                  <select aria-label="Page size">
                    <option>10</option>
                    <option>25</option>
                    <option>50</option>
                  </select>
                  <button className="icon-button" aria-label="More actions"><MoreHorizontal size={18} /></button>
                </div>

                <div className="job-tabs">
                  {[
                    ["all", "All"],
                    ["open", "Open"],
                    ["DISPATCHED", "On My Way"],
                    ["IN_PROGRESS", "In Progress"],
                    ["COMPLETED", "Completed"],
                    ["CANCELED", "Canceled"]
                  ].map(([value, label]) => (
                    <button key={value} className={jobStatusFilter === value ? "active" : ""} onClick={() => setJobStatusFilter(value)}>{label}</button>
                  ))}
                </div>

                <div className="jobs-table">
                  <div className="jobs-table-row jobs-table-head">
                    <span><input type="checkbox" aria-label="Select all jobs" /></span>
                    <span>ID</span>
                    <span>Client</span>
                    <span>Scheduled</span>
                    <span>Address</span>
                    <span>Status</span>
                    <span>Payment Status</span>
                    <span>Total</span>
                    <span>Actions</span>
                  </div>
                  {filteredJobs.map((job) => {
                    const paymentStatus = jobPaymentStatus(job);
                    return (
                      <div className="jobs-table-row" key={job.id}>
                        <span><input type="checkbox" aria-label={`Select job ${job.jobNumber}`} /></span>
                        <strong>{job.jobNumber}</strong>
                        <span>{job.customer.firstName} {job.customer.lastName}</span>
                        <span>{job.scheduledStart ? new Date(job.scheduledStart).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</span>
                        <span>{addressLine(job.address ?? job.customer.addresses?.[0])}</span>
                        <span className={`status-pill job-status-${job.status.toLowerCase()}`}>{job.status === "DISPATCHED" ? "On My Way" : statusLabel(job.status)}</span>
                        <span className={`payment-pill ${paymentStatus.toLowerCase()}`}>{statusLabel(paymentStatus.toUpperCase())}</span>
                        <strong>{money.format(jobInvoiceTotal(job) / 100)}</strong>
                        <button className="text-button" aria-label={`Delete job ${job.jobNumber}`}><Trash2 size={16} /></button>
                      </div>
                    );
                  })}
                  {filteredJobs.length === 0 && <p className="empty table-empty">No jobs match this search.</p>}
                </div>
              </div>
            </section>
          ) : (
            <section className="jobs-page">
              <div className="section-actions">
                <div className="breadcrumb"><Wrench size={17} /> Jobs / New Job</div>
                <div className="action-buttons">
                  <select value={jobTemplateId} onChange={(event) => applyJobTemplate(event.target.value)} aria-label="Job template">
                    <option value="">Job Template</option>
                    {jobTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                  <button className="outline-button" type="button" onClick={() => setJobPageMode("list")}>Back to Jobs</button>
                  <button className="primary" type="submit" form="create-job-form">Save Job</button>
                </div>
              </div>

              <form id="create-job-form" className="job-create-layout" onSubmit={createJob}>
                <div className="job-create-column">
                  <section className="panel sms-toggle">
                    <strong>Send "Scheduled" SMS</strong>
                    <label className="switch">
                      <input type="checkbox" defaultChecked />
                      <span />
                    </label>
                  </section>

                  <section className="panel">
                    <div className="panel-header"><h2>Client</h2></div>
                    {!createClientInline && (
                      <div className="record-form">
                        <div className="typeahead">
                          <input
                            placeholder="Name, email, phone or address"
                            value={jobClientSearch}
                            onChange={(event) => {
                              setJobClientSearch(event.target.value);
                              setJobForm({ ...jobForm, customerId: "", addressId: "" });
                              setJobAddressSearch("");
                            }}
                          />
                          {jobClientSearch && !jobForm.customerId && (
                            <div className="typeahead-results">
                              {clientMatches.map((customer) => (
                                <button type="button" key={customer.id} onClick={() => selectJobCustomer(customer)}>
                                  <strong>{customer.firstName} {customer.lastName}</strong>
                                  <span>{customer.phone}{customer.email ? ` / ${customer.email}` : ""}</span>
                                </button>
                              ))}
                              {clientMatches.length === 0 && <span className="typeahead-empty">No matching clients yet.</span>}
                            </div>
                          )}
                        </div>
                        <div className="typeahead">
                          <input
                            placeholder="Select address details"
                            value={jobAddressSearch}
                            disabled={!selectedJobAddresses.length}
                            onChange={(event) => {
                              setJobAddressSearch(event.target.value);
                              setJobForm({ ...jobForm, addressId: "" });
                            }}
                          />
                          {jobAddressSearch && selectedJobAddresses.length > 0 && !jobForm.addressId && (
                            <div className="typeahead-results">
                              {addressMatches.map((address) => (
                                <button type="button" key={address.id} onClick={() => selectJobAddress(address)}>
                                  <strong>{addressLine(address)}</strong>
                                </button>
                              ))}
                              {addressMatches.length === 0 && <span className="typeahead-empty">No matching addresses.</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {createClientInline && (
                      <div className="new-client-grid">
                        <input placeholder="First name" value={jobClientForm.firstName} onChange={(event) => setJobClientForm({ ...jobClientForm, firstName: event.target.value })} required />
                        <input placeholder="Last name" value={jobClientForm.lastName} onChange={(event) => setJobClientForm({ ...jobClientForm, lastName: event.target.value })} required />
                        <input placeholder="Phone" value={jobClientForm.phone} onChange={(event) => setJobClientForm({ ...jobClientForm, phone: event.target.value })} required />
                        <input placeholder="Email" value={jobClientForm.email} onChange={(event) => setJobClientForm({ ...jobClientForm, email: event.target.value })} />
                        <input className="span-2" placeholder="Street address" value={jobClientForm.street1} onChange={(event) => setJobClientForm({ ...jobClientForm, street1: event.target.value })} required />
                        <input placeholder="City" value={jobClientForm.city} onChange={(event) => setJobClientForm({ ...jobClientForm, city: event.target.value })} required />
                        <input placeholder="State" value={jobClientForm.state} onChange={(event) => setJobClientForm({ ...jobClientForm, state: event.target.value })} required />
                        <input placeholder="Postal code" value={jobClientForm.postalCode} onChange={(event) => setJobClientForm({ ...jobClientForm, postalCode: event.target.value })} required />
                      </div>
                    )}
                    <div className="or-divider">OR</div>
                    {createClientInline && <button className="outline-button centered-action" type="button" onClick={saveInlineJobClient}>Save Client</button>}
                    <button className="primary centered-action" type="button" onClick={() => {
                      setCreateClientInline((current) => !current);
                      setJobForm((current) => ({ ...current, customerId: "", addressId: "" }));
                      setJobClientSearch("");
                      setJobAddressSearch("");
                    }}>
                      <Plus size={18} /> {createClientInline ? "Select Existing Client" : "Create New Client"}
                    </button>
                  </section>

                  <section className="panel">
                    <div className="panel-header"><h2>Private Notes</h2></div>
                    <textarea placeholder="Enter notes (internal only)" value={jobForm.internalNotes} onChange={(event) => setJobForm({ ...jobForm, internalNotes: event.target.value })} />
                  </section>

                  <section className="panel attachment-panel">
                    <div className="panel-header"><h2>Attachments</h2><FileText size={18} /></div>
                    <input type="file" multiple onChange={(event) => setJobAttachments(Array.from(event.currentTarget.files ?? []).map((file) => file.name))} />
                    <div className="attachment-list">
                      {jobAttachments.map((name) => <span key={name}>{name}</span>)}
                      {jobAttachments.length === 0 && <p className="empty">No attachments selected.</p>}
                    </div>
                  </section>
                </div>

                <div className="job-create-column">
                  <section className="panel">
                    <div className="panel-header"><h2><CalendarDays size={20} /> Schedule</h2></div>
                    <div className="schedule-form-grid">
                      <label>Date <input type="date" value={jobForm.scheduledStart.slice(0, 10)} onChange={(event) => {
                        const time = jobForm.scheduledStart.slice(11) || "10:00";
                        setJobForm({ ...jobForm, scheduledStart: `${event.target.value}T${time}`, scheduledEnd: jobForm.scheduledEnd || `${event.target.value}T11:00` });
                      }} /></label>
                      <label>Start <input type="time" value={jobForm.scheduledStart.slice(11) || "10:00"} onChange={(event) => {
                        const date = jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                        setJobForm({ ...jobForm, scheduledStart: `${date}T${event.target.value}` });
                      }} /></label>
                      <label>End <input type="time" value={jobForm.scheduledEnd.slice(11) || "11:00"} onChange={(event) => {
                        const date = jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                        setJobForm({ ...jobForm, scheduledEnd: `${date}T${event.target.value}` });
                      }} /></label>
                      <label className="span-2">Field Techs
                        <select value={jobForm.technicianId} onChange={(event) => setJobForm({ ...jobForm, technicianId: event.target.value })}>
                          <option value="">Unassigned</option>
                          {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                        </select>
                      </label>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="panel-header"><h2>More</h2></div>
                    <div className="record-form">
                      <label>Job Title
                        <input value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} placeholder="Car lockout, Rekey, Install" required />
                      </label>
                      <label>Lead Source
                        <input
                          list="lead-source-options"
                          value={jobForm.leadSource}
                          onChange={(event) => setJobForm({ ...jobForm, leadSource: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveJobOption("leadSource", jobForm.leadSource).catch((err: Error) => setError(err.message));
                            }
                          }}
                          onBlur={() => saveJobOption("leadSource", jobForm.leadSource).catch(() => undefined)}
                          placeholder="Type a source and press Enter"
                        />
                        <datalist id="lead-source-options">
                          {crmOptions.leadSources.map((source) => <option key={source} value={source} />)}
                        </datalist>
                      </label>
                      <label>Tags
                        <div className="tag-editor">
                          <div className="tag-list">
                            {splitTags(jobForm.tags).map((tag) => (
                              <button type="button" key={tag} onClick={() => setJobForm({ ...jobForm, tags: splitTags(jobForm.tags).filter((item) => item !== tag).join(", ") })}>
                                {tag}
                              </button>
                            ))}
                          </div>
                          <input
                            list="tag-options"
                            placeholder="Type tag and press Enter"
                            value={tagDraft}
                            onChange={(event) => setTagDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === ",") {
                                event.preventDefault();
                                addJobTag(tagDraft).catch((err: Error) => setError(err.message));
                              }
                            }}
                            onBlur={() => addJobTag(tagDraft).catch(() => undefined)}
                          />
                          <datalist id="tag-options">
                            {crmOptions.tags.map((tag) => <option key={tag} value={tag} />)}
                          </datalist>
                        </div>
                      </label>
                      <label>Job Type
                        <input
                          list="job-type-options"
                          value={jobForm.jobType}
                          onChange={(event) => setJobForm({ ...jobForm, jobType: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              saveJobOption("jobType", jobForm.jobType).catch((err: Error) => setError(err.message));
                            }
                          }}
                          onBlur={() => saveJobOption("jobType", jobForm.jobType).catch(() => undefined)}
                          placeholder="Type a job type and press Enter"
                          required
                        />
                        <datalist id="job-type-options">
                          {crmOptions.jobTypes.map((jobType) => <option key={jobType} value={jobType} />)}
                        </datalist>
                      </label>
                      <label>Description
                        <input placeholder="Visible job description" value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} />
                      </label>
                    </div>
                  </section>

                  <section className="panel line-items-panel">
                    <div className="line-items-header">
                      <h2>Line items</h2>
                      <div className="mini-segment">
                        <button type="button" className="selected">List</button>
                        <button type="button">Details</button>
                      </div>
                    </div>
                    {(["service", "material"] as const).map((category) => (
                      <div className="line-category" key={category}>
                        <div className="line-category-head">
                          <strong>{category === "service" ? "Services" : "Materials"}</strong>
                          <div className="line-actions">
                            <select aria-label={`Add ${category} from price book`} onChange={(event) => { addPriceBookItemToJob(event.target.value); event.currentTarget.value = ""; }}>
                              <option value="">Add from price book</option>
                              {priceBookItems.filter((item) => item.itemType === category).map((item) => (
                                <option key={item.id} value={item.id}>{item.name} / {money.format(item.price / 100)}</option>
                              ))}
                            </select>
                            <button type="button" className="text-add-button" onClick={() => addJobLine(category)}><Plus size={18} /> Add {category}</button>
                          </div>
                        </div>
                        {jobLines.filter((item) => item.category === category).map((item) => (
                          <div className="line-item-row" key={item.id}>
                            <input placeholder={`${category === "service" ? "Service" : "Material"} name`} value={item.name} onChange={(event) => updateJobLine(item.id, { name: event.target.value })} />
                            <input placeholder="Description" value={item.description} onChange={(event) => updateJobLine(item.id, { description: event.target.value })} />
                            <input placeholder="Qty" value={item.quantity} onChange={(event) => updateJobLine(item.id, { quantity: event.target.value })} />
                            <input placeholder="Price" value={item.unitPrice} onChange={(event) => updateJobLine(item.id, { unitPrice: event.target.value })} />
                            <button type="button" className="text-button" onClick={() => setJobLines((current) => current.filter((line) => line.id !== item.id))}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="totals-box">
                      <span>Subtotal <strong>{money.format(jobLineSubtotal / 100)}</strong></span>
                      <span>Tax rate <em>AZ Taxes (9.4%)</em> <strong>{money.format(jobLineTax / 100)}</strong></span>
                      <span className="grand-total">Total <strong>{money.format(jobLineTotal / 100)}</strong></span>
                    </div>
                  </section>
                </div>
              </form>
            </section>
          )
        )}

        {activeView === "reports" && (
          <section className="reports-page">
            <aside className="reports-nav">
              <h2>Reporting</h2>
              <button>Business insights <span>New</span></button>
              <strong>Dashboards</strong>
              <button>Tech Performance</button>
              <button>Administrative</button>
              <button className={reportDashboard === "businessOwner" ? "active" : ""} onClick={() => setReportDashboard("businessOwner")}>Business Owner</button>
              <strong>All Reports</strong>
              <button className={reportDashboard === "jobs" ? "active" : ""} onClick={() => setReportDashboard("jobs")}>Jobs</button>
              <button>Estimates</button>
              <button className={reportDashboard === "leads" ? "active" : ""} onClick={() => setReportDashboard("leads")}>Leads</button>
              <button>Service plans</button>
              <button>Invoices</button>
              <button>Payments</button>
              <button>Custom</button>
            </aside>

            <div className="reports-main">
              <div className="reports-titlebar">
                <div>
                  <span>Reporting / {reportTitle}</span>
                  <h1>{reportTitle}</h1>
                </div>
                <div className="action-buttons">
                  <button className="text-button" type="button">Presentation mode</button>
                  <button className="outline-button" type="button"><Plus size={17} /> Create report</button>
                  <button className="outline-button accent" type="button">Ask Analyst AI</button>
                  <button className="outline-button" type="button">Actions <ChevronDown size={16} /></button>
                </div>
              </div>

              <div className="report-filters">
                <label>
                  <span>Global date range</span>
                  <select value={reportDateRange} onChange={(event) => setReportDateRange(event.target.value)}>
                    {reportDateRanges.map((range) => <option key={range.value} value={range.value}>{range.label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Show by</span>
                  <select value={reportShowBy} onChange={(event) => setReportShowBy(event.target.value)}>
                    {reportGroupings.map((grouping) => <option key={grouping.value} value={grouping.value}>{grouping.label}</option>)}
                  </select>
                </label>
              </div>

              {reportDashboard !== "jobs" ? (
                <div className="dashboard-chart-stack">
                  {activeCharts.map((chart, index) => {
                    const maxValue = Math.max(1, ...chart.bars.map((bar) => Math.max(bar.value, bar.previousValue ?? 0)));
                    return (
                      <section className={`chart-panel ${index === 0 ? "featured" : ""}`} key={chart.id}>
                        <div className="chart-panel-head">
                          <div>
                            <h2>{chart.title}</h2>
                            <span>{chart.metricLabel}</span>
                            <strong>{chart.metricValue}</strong>
                          </div>
                          <div className="chart-actions"><span>Move</span><span>More</span></div>
                        </div>
                        <div className="bar-chart" style={{ "--bar-count": Math.max(chart.bars.length, 1) } as CSSProperties}>
                          <div className="bar-axis">
                            <span>{formatChartValue(maxValue, chart.format)}</span>
                            <span>{formatChartValue(Math.round(maxValue / 2), chart.format)}</span>
                            <span>{formatChartValue(0, chart.format)}</span>
                          </div>
                          <div className="bars">
                            {chart.bars.map((bar) => (
                              <div className="bar-group" key={`${chart.id}-${bar.label}`}>
                                <div className="bar-pair">
                                  {typeof bar.previousValue === "number" && (
                                    <span className="bar previous" style={{ height: `${Math.max(2, (bar.previousValue / maxValue) * 100)}%` }} title={`Previous year ${formatChartValue(bar.previousValue, chart.format)}`} />
                                  )}
                                  <span className="bar current" style={{ height: `${Math.max(2, (bar.value / maxValue) * 100)}%` }} title={`${bar.label} ${formatChartValue(bar.value, chart.format)}`} />
                                </div>
                                <em title={bar.label}>{shortLabel(bar.label)}</em>
                              </div>
                            ))}
                            {chart.bars.length === 0 && <p className="empty">No chart data for this range yet.</p>}
                          </div>
                        </div>
                        <div className="chart-legend">
                          <span><i className="current" /> This period</span>
                          <span><i className="previous" /> Same period last year</span>
                          <a>View/edit report</a>
                        </div>
                      </section>
                    );
                  })}
                  {!activeCharts.length && <p className="empty">No reporting charts are available yet.</p>}
                </div>
              ) : (
                <>
                  {reports && (
                    <div className="report-overview">
                      <span><strong>{reports.overview.revenue}</strong> Revenue</span>
                      <span><strong>{reports.overview.paidRevenue}</strong> Paid</span>
                      <span><strong>{reports.overview.jobs}</strong> Jobs</span>
                      <span><strong>{reports.overview.completedJobs}</strong> Completed</span>
                      <span><strong>{reports.overview.paidRate}</strong> Paid rate</span>
                    </div>
                  )}
                  <div className="reports-layout">
                    <div className="report-card-grid">
                      {(reports?.sections ?? []).map((section) => (
                        <section className="report-group" key={section.title}>
                          <h2>{section.title}</h2>
                          {section.items.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              className={selectedReport?.id === item.id ? "active" : ""}
                              onClick={() => setSelectedReportId(item.id)}
                            >
                              <span>{item.label}</span>
                              <strong>{item.value}</strong>
                            </button>
                          ))}
                        </section>
                      ))}
                    </div>

                    <section className="report-detail">
                      {selectedReport ? (
                        <>
                          <div className="report-detail-head">
                            <div>
                              <span>Selected report</span>
                              <h2>{selectedReport.label}</h2>
                              <p>{selectedReport.detail}</p>
                            </div>
                            <strong>{selectedReport.value}</strong>
                          </div>
                          <div className="report-row-list">
                            {selectedReport.rows.map((row) => (
                              <div className="report-row" key={`${selectedReport.id}-${row.label}`}>
                                <span>{row.label}</span>
                                <strong>{row.value}</strong>
                                {row.detail && <em>{row.detail}</em>}
                              </div>
                            ))}
                            {selectedReport.rows.length === 0 && <p className="empty">No data for this report yet.</p>}
                          </div>
                        </>
                      ) : (
                        <p className="empty">Reports will appear after your CRM has jobs and invoices.</p>
                      )}
                    </section>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="settings-page">
            <div className="section-actions">
              <div className="breadcrumb"><Settings size={17} /> Settings</div>
              {settingsSection !== "overview" && (
                <button className="outline-button" type="button" onClick={() => setSettingsSection("overview")}><ChevronLeft size={17} /> Settings Home</button>
              )}
            </div>

            {settingsSection === "overview" ? (
              <>
                <div className="settings-grid">
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("company")}>
                    <span className="settings-icon purple"><Settings size={22} /></span>
                    <strong>Company Settings</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("overview")}>
                    <span className="settings-icon blue"><Users size={22} /></span>
                    <strong>Profile Settings</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setActiveView("pricebook")}>
                    <span className="settings-icon red"><Tag size={22} /></span>
                    <strong>Pricebook</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("jobTypes")}>
                    <span className="settings-icon yellow"><Wrench size={22} /></span>
                    <strong>Job Settings</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("leadSources")}>
                    <span className="settings-icon green"><TrendingUp size={22} /></span>
                    <strong>Lead Sources</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("tags")}>
                    <span className="settings-icon pink"><Tag size={22} /></span>
                    <strong>Tags</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("jobFields")}>
                    <span className="settings-icon blue"><FileText size={22} /></span>
                    <strong>Job Fields</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("checklists")}>
                    <span className="settings-icon green"><ListChecks size={22} /></span>
                    <strong>Checklists</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("servicePlans")}>
                    <span className="settings-icon yellow"><CheckCheck size={22} /></span>
                    <strong>Service Plans</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setActiveView("api")}>
                    <span className="settings-icon purple"><KeyRound size={22} /></span>
                    <strong>API Access</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("overview")}>
                    <span className="settings-icon pink"><MessageSquareText size={22} /></span>
                    <strong>SMS Notifications</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("overview")}>
                    <span className="settings-icon red"><CreditCard size={22} /></span>
                    <strong>Invoice Settings</strong>
                  </button>
                </div>

                <div className="settings-integrations">
                  <h2>Integrations</h2>
                  <div className="settings-grid compact">
                    <button type="button" className="settings-card"><span className="settings-icon green"><CalendarDays size={22} /></span><strong>Google</strong></button>
                    <button type="button" className="settings-card"><span className="settings-icon blue"><CreditCard size={22} /></span><strong>Quickbooks</strong></button>
                    <button type="button" className="settings-card"><span className="settings-icon purple"><BadgeDollarSign size={22} /></span><strong>Stripe</strong></button>
                  </div>
                </div>
              </>
            ) : settingsSection === "company" ? (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Global Settings</span>
                  <button className="active" onClick={() => setSettingsSection("company")}>Company</button>
                  <button onClick={() => setActiveView("api")}>API Access</button>
                  <span>Feature Configurations</span>
                  <button onClick={() => setSettingsSection("jobTypes")}>Job Types</button>
                  <button onClick={() => setActiveView("pricebook")}>Price Book</button>
                  <button onClick={() => setSettingsSection("servicePlans")}>Service Plans</button>
                  <span>Tags & Tools</span>
                  <button onClick={() => setSettingsSection("checklists")}>Checklists</button>
                  <button onClick={() => setSettingsSection("jobFields")}>Job Fields</button>
                  <button onClick={() => setSettingsSection("leadSources")}>Lead Sources</button>
                  <button onClick={() => setSettingsSection("tags")}>Tags</button>
                </aside>

                <form className="company-settings-page" onSubmit={saveCompanySettings}>
                  <div className="company-settings-topbar">
                    <div className="breadcrumb"><Settings size={17} /> Settings / Company Settings</div>
                    <button className="primary" type="submit">Save</button>
                  </div>

                  <section className="company-card">
                    <h2>Company Details</h2>
                    <div className="logo-row">
                      <div className="logo-preview">{companySettingsForm.logoName ? "IMG" : "A"}</div>
                      <div>
                        <strong>Company Logo</strong>
                        <span>JPG or PNG, file size no more than 10MB</span>
                      </div>
                      <label className="primary file-button">Change
                        <input type="file" onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, logoName: event.currentTarget.files?.[0]?.name ?? "" })} />
                      </label>
                    </div>

                    <label>Company Color
                      <div className="color-input-row">
                        <input type="color" value={companySettingsForm.companyColor} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, companyColor: event.target.value })} />
                        <input value={companySettingsForm.companyColor} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, companyColor: event.target.value })} />
                      </div>
                    </label>

                    <label>Company ID
                      <input readOnly value={activeLocationAccess?.organization.id ?? ""} />
                    </label>
                    <label>Location ID
                      <input readOnly value={activeLocationAccess?.location.id ?? ""} />
                    </label>

                    <div className="settings-note">
                      Price book items, categories, job types, tags, lead sources, job fields, checklists, service plans, customers, jobs, invoices, technicians, API keys, messages, and reports are scoped to this active Location ID.
                    </div>

                    <div className="company-form-grid">
                      <label>Company Name
                        <input value={companySettingsForm.companyName} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, companyName: event.target.value })} required />
                      </label>
                      <label>Phone Number
                        <input value={companySettingsForm.phone} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, phone: event.target.value })} />
                      </label>
                      <label>Company Website
                        <input value={companySettingsForm.website} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, website: event.target.value })} />
                      </label>
                      <label>Industry
                        <select value={companySettingsForm.industry} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, industry: event.target.value })}>
                          <option>Locksmith</option>
                          <option>Security</option>
                          <option>Garage Door</option>
                          <option>Other</option>
                        </select>
                      </label>
                      <label className="span-2">Time Zone
                        <select value={companySettingsForm.timezone} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, timezone: event.target.value })}>
                          <option value="America/Phoenix">(UTC-7) America/Phoenix</option>
                          <option value="America/Los_Angeles">(UTC-8) America/Los Angeles</option>
                          <option value="America/Denver">(UTC-7) America/Denver</option>
                          <option value="America/Chicago">(UTC-6) America/Chicago</option>
                          <option value="America/New_York">(UTC-5) America/New York</option>
                        </select>
                      </label>
                      <label className="span-2">Company Description
                        <textarea value={companySettingsForm.description} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, description: event.target.value })} placeholder="Professional locksmith services..." />
                      </label>
                    </div>
                  </section>

                  <section className="company-card owner-card">
                    <div className="logo-preview small">A</div>
                    <div>
                      <strong>{name || identifier || "Owner"}</strong>
                      <span>{activeLocationAccess?.role ?? "Owner"}</span>
                    </div>
                  </section>

                  <section className="company-card">
                    <h2>Company Address</h2>
                    <div className="map-placeholder">
                      <strong>{companyAddressPreview}</strong>
                      <span>Map preview placeholder</span>
                    </div>
                    <label>Street Address
                      <input value={companySettingsForm.street1} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, street1: event.target.value })} />
                    </label>
                    <label>Unit #
                      <input value={companySettingsForm.street2} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, street2: event.target.value })} />
                    </label>
                    <label>City
                      <input value={companySettingsForm.city} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, city: event.target.value })} />
                    </label>
                    <div className="company-form-grid">
                      <label>State
                        <input value={companySettingsForm.state} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, state: event.target.value })} />
                      </label>
                      <label>ZIP
                        <input value={companySettingsForm.postalCode} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, postalCode: event.target.value })} />
                      </label>
                    </div>
                  </section>

                  <section className="company-card">
                    <h2>Terms of Service</h2>
                    <div className="settings-note">
                      This text can be shown on invoices and estimates sent to customers.
                    </div>
                    <textarea value={companySettingsForm.termsOfService} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, termsOfService: event.target.value })} placeholder="Warranty, payment, and service terms..." />
                  </section>
                </form>
              </div>
            ) : selectedSettings && (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Global Settings</span>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                  <button onClick={() => setActiveView("api")}>API Access</button>
                  <span>Feature Configurations</span>
                  <button className={settingsSection === "jobTypes" ? "active" : ""} onClick={() => setSettingsSection("jobTypes")}>Job Types</button>
                  <button onClick={() => setActiveView("pricebook")}>Price Book</button>
                  <button className={settingsSection === "servicePlans" ? "active" : ""} onClick={() => setSettingsSection("servicePlans")}>Service Plans</button>
                  <span>Tags & Tools</span>
                  <button className={settingsSection === "checklists" ? "active" : ""} onClick={() => setSettingsSection("checklists")}>Checklists</button>
                  <button className={settingsSection === "jobFields" ? "active" : ""} onClick={() => setSettingsSection("jobFields")}>Job Fields</button>
                  <button className={settingsSection === "leadSources" ? "active" : ""} onClick={() => setSettingsSection("leadSources")}>Lead Sources</button>
                  <button className={settingsSection === "tags" ? "active" : ""} onClick={() => setSettingsSection("tags")}>Tags</button>
                </aside>

                <section className="settings-panel">
                  <div className="settings-panel-head">
                    <div>
                      <p className="settings-kicker">API backed configuration</p>
                      <h2>{selectedSettings.title}</h2>
                      <p>{selectedSettings.description}</p>
                    </div>
                    <span>{selectedSettingsValues.length} saved</span>
                  </div>

                  <form className="settings-input-row" onSubmit={createSettingsOption}>
                    <input value={settingsDraft} onChange={(event) => setSettingsDraft(event.target.value)} placeholder={selectedSettings.placeholder} />
                    <button className="primary" type="submit"><Plus size={17} /> Add</button>
                  </form>

                  <div className="settings-option-list">
                    {selectedSettingsValues.map((value) => (
                      <div className="settings-option-row" key={value}>
                        <span>{value}</span>
                        <button className="text-button" type="button" onClick={() => removeSettingsOption(selectedSettings.kind, value)}><Trash2 size={16} /></button>
                      </div>
                    ))}
                    {selectedSettingsValues.length === 0 && <p className="empty">Nothing has been saved here yet.</p>}
                  </div>
                </section>
              </div>
            )}
          </section>
        )}

        {activeView === "pricebook" && (
          <section className="pricebook-page">
            <div className="section-actions">
              <div className="breadcrumb"><Settings size={17} /> Settings / Pricebook</div>
              <div className="action-buttons">
                <button className="outline-button" type="button" onClick={() => setPriceBookModal("category")}><Plus size={17} /> Create Category</button>
                <button className="primary" type="button" onClick={() => setPriceBookModal("item")}><Plus size={17} /> Create Item</button>
              </div>
            </div>

            <div className="pricebook-panel">
              <div className="jobs-tools">
                <div className="search-box table-search">
                  <Search size={18} />
                  <input placeholder="Search price book" value={priceBookSearch} onChange={(event) => setPriceBookSearch(event.target.value)} />
                </div>
                <select aria-label="Page size">
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
                <button className="icon-button" aria-label="More actions"><MoreHorizontal size={18} /></button>
              </div>

              <div className="job-tabs">
                <button className={priceBookTab === "items" ? "active" : ""} onClick={() => setPriceBookTab("items")}>Pricebook</button>
                <button className={priceBookTab === "categories" ? "active" : ""} onClick={() => setPriceBookTab("categories")}>Category</button>
              </div>

              {priceBookTab === "items" ? (
                <div className="pricebook-table">
                  <div className="pricebook-row pricebook-head">
                    <span>Name</span>
                    <span>Image</span>
                    <span>Description</span>
                    <span>Price</span>
                    <span>Cost</span>
                    <span>Category</span>
                    <span>Item Type</span>
                    <span>Taxable</span>
                    <span>Actions</span>
                  </div>
                  {filteredPriceBookItems.map((item) => (
                    <div className="pricebook-row" key={item.id}>
                      <strong>{item.name}</strong>
                      <span className="image-chip">{item.imageName ? "IMG" : "-"}</span>
                      <span>{item.description || "-"}</span>
                      <span>{money.format(item.price / 100)}</span>
                      <span>{money.format(item.cost / 100)}</span>
                      <span>{item.category?.name || "Uncategorized"}</span>
                      <span>{statusLabel(item.itemType.toUpperCase())}</span>
                      <span>{item.taxable ? "Yes" : "No"}</span>
                      <button className="text-button" onClick={() => deletePriceBookItem(item.id)}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {filteredPriceBookItems.length === 0 && <p className="empty table-empty">No price book items yet.</p>}
                </div>
              ) : (
                <div className="category-grid">
                  {priceBookCategories.map((category) => (
                    <article key={category.id}>
                      <strong>{category.name}</strong>
                      <span>{category.description || "No description"}</span>
                    </article>
                  ))}
                  {priceBookCategories.length === 0 && <p className="empty">No categories yet.</p>}
                </div>
              )}
            </div>
          </section>
        )}

        {priceBookModal && (
          <div className="modal-backdrop" onClick={() => setPriceBookModal(null)}>
            <div className="pricebook-modal" onClick={(event) => event.stopPropagation()}>
              {priceBookModal === "category" ? (
                <form className="record-form" onSubmit={createPriceBookCategory}>
                  <h2>Create Category</h2>
                  <input placeholder="Category name" value={priceBookCategoryForm.name} onChange={(event) => setPriceBookCategoryForm({ ...priceBookCategoryForm, name: event.target.value })} required />
                  <textarea placeholder="Description" value={priceBookCategoryForm.description} onChange={(event) => setPriceBookCategoryForm({ ...priceBookCategoryForm, description: event.target.value })} />
                  <div className="modal-actions">
                    <button className="outline-button" type="button" onClick={() => setPriceBookModal(null)}>Cancel</button>
                    <button className="primary" type="submit">Create Category</button>
                  </div>
                </form>
              ) : (
                <form className="record-form" onSubmit={createPriceBookItem}>
                  <h2>Create an Item</h2>
                  <div className="image-upload-row">
                    <span className="image-chip">IMG</span>
                    <div>
                      <strong>Upload Image</strong>
                      <small>JPG or PNG, file size no more than 5MB</small>
                    </div>
                    <input type="file" onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, imageName: event.currentTarget.files?.[0]?.name ?? "" })} />
                  </div>
                  <div className="pricebook-form-grid">
                    <label>Item Name<input placeholder="Enter item name" value={priceBookItemForm.name} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, name: event.target.value })} required /></label>
                    <label>Model Number<input placeholder="Enter model number (optional)" value={priceBookItemForm.modelNumber} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, modelNumber: event.target.value })} /></label>
                    <label>Price<input placeholder="0" value={priceBookItemForm.price} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, price: event.target.value })} /></label>
                    <label>Your Cost<input placeholder="0" value={priceBookItemForm.cost} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, cost: event.target.value })} /></label>
                    <label>Category
                      <select value={priceBookItemForm.categoryId} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, categoryId: event.target.value })}>
                        <option value="">Select category</option>
                        {priceBookCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </label>
                    <label>Item Type
                      <select value={priceBookItemForm.itemType} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, itemType: event.target.value as "service" | "material" })}>
                        <option value="service">Service</option>
                        <option value="material">Material</option>
                      </select>
                    </label>
                    <label className="span-2">Item Description
                      <textarea placeholder="Enter item description (optional)" value={priceBookItemForm.description} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, description: event.target.value })} />
                    </label>
                  </div>
                  <label className="check-row"><input type="checkbox" checked={priceBookItemForm.onlineBooking} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, onlineBooking: event.target.checked })} /> Add to Online Booking</label>
                  <label className="check-row"><input type="checkbox" checked={priceBookItemForm.taxable} onChange={(event) => setPriceBookItemForm({ ...priceBookItemForm, taxable: event.target.checked })} /> Taxable</label>
                  <div className="modal-actions">
                    <button className="outline-button" type="button" onClick={() => setPriceBookModal(null)}>Cancel</button>
                    <button className="primary" type="submit">Create Item</button>
                  </div>
                </form>
              )}
            </div>
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
