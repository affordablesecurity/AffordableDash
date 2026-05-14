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
  Copy,
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
  MapPin,
  Mail,
  MessageSquareText,
  MoreHorizontal,
  Navigation,
  Paperclip,
  Percent,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Smartphone,
  StickyNote,
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
  companyName?: string;
  email?: string;
  alternatePhone?: string;
  additionalEmails?: string[];
  additionalPhones?: Array<{ label: "mobile" | "work" | "home" | "other"; number: string }>;
  source?: string;
  tags?: string[];
  notes?: string;
  communicationPrefs?: { sms: boolean; email: boolean; phone: boolean };
  attachments?: string[];
  paymentMethodNote?: string;
  createdAt?: string;
  privateNotes?: CustomerNote[];
  jobs?: Job[];
  invoices?: Invoice[];
  addresses?: Address[];
};

type Address = {
  id: string;
  label?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
};

type CustomerNote = {
  id: string;
  author: string;
  content: string;
  createdAt: string;
};

type Technician = {
  id: string;
  userId?: string;
  name: string;
  email?: string;
  phone: string;
  color: string;
  employmentType: "employee" | "subcontractor";
  role: "OWNER" | "ADMIN" | "INSIDE_SALES" | "OUTSIDE_FIELD_TECH";
  fieldTech: boolean;
  permissions: string[];
  active: boolean;
};

type JobLineDraft = {
  id: string;
  category: "service" | "material";
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxable?: boolean;
};

type JobTemplate = {
  id: string;
  name: string;
  title: string;
  jobType: string;
  leadSource?: string;
  tags: string[];
  privateNotes?: string;
  lineItems?: Omit<JobLineDraft, "id">[];
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

type ServicePlanAddOn = {
  item: string;
  unitPrice: number;
  description?: string;
};

type ServicePlanTemplate = {
  id: string;
  name: string;
  description?: string;
  businessUnit?: string;
  visitsPerYear: number;
  durationType: "indefinite" | "fixed";
  billingInterval: "monthly" | "quarterly" | "semiannual" | "yearly";
  recurringAmount: number;
  cashAllowed: boolean;
  discountDescription?: string;
  discountPercent?: number;
  addOns?: ServicePlanAddOn[];
};

type ServicePlanSummary = {
  totalPlans: number;
  servicePlanRevenueCents: number;
  recurringRevenueCents: number;
  dueForBillingCents: number;
  upcomingScheduledVisits: number;
  dueForBilling: Array<{ id: string; customer: string; phone: string; dueDate: string; status: string; amount: number }>;
  upcomingVisits: Array<{ id: string; customerName: string; address: string; phone: string; plan: string; visitDate: string; reminderSent: boolean }>;
};

type CustomerForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  additionalEmails: string;
  workPhone: string;
  homePhone: string;
  source: string;
  tags: string;
  notes: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  postalCode: string;
  communicationSms: boolean;
  communicationEmail: boolean;
  communicationPhone: boolean;
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
  completedAt?: string;
  description?: string;
  internalNotes?: string;
  attachments?: string[];
  customer: Customer;
  address?: Address;
  technician?: Technician;
  lineItems?: Array<{ id: string; category: string; name: string; quantity: string; unitPrice: number; taxable?: boolean }>;
  invoices?: Invoice[];
  notes?: Array<{ id: string; author: string; content: string; createdAt: string }>;
};

type Invoice = {
  id: string;
  invoiceNumber: number;
  status: string;
  total: number;
  createdAt?: string;
  paidAt?: string;
  customer: Customer;
  job?: Job;
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
  token?: string;
  scopes: string[];
  active: boolean;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
};

type View = "dispatch" | "schedule" | "customers" | "jobs" | "employees" | "invoices" | "reports" | "pricebook" | "servicePlans" | "settings" | "api";
type CalendarMode = "employees" | "day" | "week" | "month";
type SlotPrompt = { date: Date; hour: number } | null;
type CrmOptionKind = "leadSource" | "tag" | "jobType" | "jobField" | "checklist" | "servicePlan";
type SettingsSection = "overview" | "company" | "tags" | "leadSources" | "jobTypes" | "jobFields" | "checklists" | "servicePlans" | "jobTemplates";
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
const defaultJobTemplates: JobTemplate[] = [
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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function startOfMonth(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  next.setDate(1);
  return next;
}

function formatWeekRange(start: Date) {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} - ${end.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}`;
}

function formatScheduleRange(mode: CalendarMode, date: Date, weekStart: Date) {
  if (mode === "month") return date.toLocaleDateString([], { month: "long", year: "numeric" });
  if (mode === "day" || mode === "employees") return date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  return formatWeekRange(weekStart);
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
  const invoiceTotal = (job.invoices ?? []).reduce((sum, invoice) => sum + invoice.total, 0);
  return invoiceTotal || calculateJobLineSubtotal(job);
}

function calculateJobLineSubtotal(job: Job) {
  return (job.lineItems ?? []).reduce((sum, item) => sum + Number(item.quantity || "0") * item.unitPrice, 0);
}

function calculateJobLineTax(job: Job) {
  const taxableSubtotal = (job.lineItems ?? []).reduce((sum, item) => {
    const isTaxable = item.category === "material" && item.taxable !== false;
    return isTaxable ? sum + Number(item.quantity || "0") * item.unitPrice : sum;
  }, 0);
  return Math.round(taxableSubtotal * 0.094);
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

function blankCustomerForm(): CustomerForm {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    additionalEmails: "",
    workPhone: "",
    homePhone: "",
    source: "",
    tags: "",
    notes: "",
    street1: "",
    street2: "",
    city: "",
    state: "CA",
    postalCode: "",
    communicationSms: true,
    communicationEmail: true,
    communicationPhone: true
  };
}

function customerName(customer?: Customer) {
  if (!customer) return "Unknown customer";
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.companyName || "Unnamed customer";
}

function formatDate(value?: string) {
  return value ? new Date(value).toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "numeric" }) : "Not recorded";
}

function dollarsToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

function currencyToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  const amount = Number(normalized || "0");
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function percentToNumber(value: string) {
  const normalized = value.replace(/[%\s]/g, "");
  const amount = Number(normalized || "0");
  return normalized && Number.isFinite(amount) ? amount : undefined;
}

function lineDraft(category: "service" | "material", name = "", unitPrice = ""): JobLineDraft {
  return {
    id: `${category}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    category,
    name,
    description: "",
    quantity: "1",
    unitPrice,
    taxable: category === "material"
  };
}

function normalizeJobTemplate(template: JobTemplate): JobTemplate {
  return {
    ...template,
    tags: template.tags ?? [],
    privateNotes: template.privateNotes ?? "",
    lineItems: template.lineItems ?? []
  };
}

function formatChartValue(value: number, format: "money" | "number") {
  return format === "money" ? money.format(value / 100) : new Intl.NumberFormat("en-US").format(value);
}

function shortLabel(value: string) {
  return value.length > 18 ? `${value.slice(0, 16)}...` : value;
}

function employeeRoleLabel(role: Technician["role"]) {
  const labels: Record<Technician["role"], string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    INSIDE_SALES: "Inside Sales",
    OUTSIDE_FIELD_TECH: "Outside Field Tech"
  };
  return labels[role];
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
  id: Exclude<SettingsSection, "overview" | "company" | "jobTemplates">;
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
  const [scheduleDate, setScheduleDate] = useState(() => new Date());
  const [slotPrompt, setSlotPrompt] = useState<SlotPrompt>(null);
  const [selectedScheduleJob, setSelectedScheduleJob] = useState<Job | null>(null);
  const [jobPageMode, setJobPageMode] = useState<"list" | "create">("list");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobStatusFilter, setJobStatusFilter] = useState("all");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [employeeModal, setEmployeeModal] = useState<"employee" | "subcontractor" | "owner" | null>(null);
  const [employeeEditingId, setEmployeeEditingId] = useState("");
  const [employeeForm, setEmployeeForm] = useState({
    name: "",
    email: "",
    username: "",
    password: "",
    phone: "",
    employmentType: "employee" as "employee" | "subcontractor",
    role: "OUTSIDE_FIELD_TECH" as "OWNER" | "ADMIN" | "INSIDE_SALES" | "OUTSIDE_FIELD_TECH",
    fieldTech: true,
    color: "#2563eb",
    active: true,
    locationName: "",
    locationSlug: "",
    locationPhone: "",
    locationStreet1: "",
    locationStreet2: "",
    locationCity: "",
    locationState: "CA",
    locationPostalCode: "",
    locationTimezone: "America/Phoenix"
  });
  const [createClientInline, setCreateClientInline] = useState(false);
  const [jobClientSearch, setJobClientSearch] = useState("");
  const [jobAddressSearch, setJobAddressSearch] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [tagFocused, setTagFocused] = useState(false);
  const [leadSourceFocused, setLeadSourceFocused] = useState(false);
  const [jobNoteTarget, setJobNoteTarget] = useState<"job" | "customer">("job");
  const [detailTagDraft, setDetailTagDraft] = useState("");
  const [detailLeadSource, setDetailLeadSource] = useState("");
  const [detailPrivateNote, setDetailPrivateNote] = useState("");
  const [detailSummary, setDetailSummary] = useState("");
  const [detailSavedMessage, setDetailSavedMessage] = useState("");
  const [jobTemplateId, setJobTemplateId] = useState("");
  const [jobTemplates, setJobTemplates] = useState<JobTemplate[]>(defaultJobTemplates);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    title: "",
    jobType: "Car Lockout Service",
    leadSource: "Phone Call",
    tags: "",
    privateNotes: ""
  });
  const [templateLineItems, setTemplateLineItems] = useState<JobLineDraft[]>([]);
  const [jobLines, setJobLines] = useState<JobLineDraft[]>([]);
  const [jobAttachments, setJobAttachments] = useState<string[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [priceBookCategories, setPriceBookCategories] = useState<PriceBookCategory[]>([]);
  const [priceBookSearch, setPriceBookSearch] = useState("");
  const [priceBookTab, setPriceBookTab] = useState<"items" | "categories">("items");
  const [priceBookModal, setPriceBookModal] = useState<"item" | "category" | null>(null);
  const [servicePlanTemplates, setServicePlanTemplates] = useState<ServicePlanTemplate[]>([]);
  const [servicePlanSummary, setServicePlanSummary] = useState<ServicePlanSummary | null>(null);
  const [servicePlanMode, setServicePlanMode] = useState<"dashboard" | "create">("dashboard");
  const [servicePlanStep, setServicePlanStep] = useState(1);
  const [servicePlanForm, setServicePlanForm] = useState({
    name: "",
    description: "",
    businessUnit: "Garage Door",
    visitsPerYear: "1",
    durationType: "indefinite" as "indefinite" | "fixed",
    billingInterval: "yearly" as "monthly" | "quarterly" | "semiannual" | "yearly",
    recurringAmount: "0",
    cashAllowed: false,
    discountDescription: "",
    discountPercent: "",
    addOns: [{ item: "", unitPrice: "0", description: "" }]
  });
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
  const [apiKeySecrets, setApiKeySecrets] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(window.localStorage.getItem("affordable_crm_api_key_secrets") ?? "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });
  const [currentRole, setCurrentRole] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerProfileTab, setCustomerProfileTab] = useState<"profile" | "leads" | "estimates" | "jobs" | "invoices" | "attachments" | "notes">("profile");
  const [customerNoteDraft, setCustomerNoteDraft] = useState("");
  const [customerAddressForm, setCustomerAddressForm] = useState({ label: "Service", street1: "", street2: "", city: "", state: "CA", postalCode: "" });
  const [customerAttachmentName, setCustomerAttachmentName] = useState("");
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
  const [customerForm, setCustomerForm] = useState<CustomerForm>(() => blankCustomerForm());
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
  const [jobClientForm, setJobClientForm] = useState<CustomerForm>(() => blankCustomerForm());
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
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedJobInvoice = selectedJob?.invoices?.[0] ?? null;
  const weekStart = useMemo(() => startOfWeek(scheduleDate), [scheduleDate]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_item, index) => addDays(weekStart, index)), [weekStart]);
  const monthDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(scheduleDate));
    return Array.from({ length: 42 }, (_item, index) => addDays(first, index));
  }, [scheduleDate]);
  const scheduleDays = calendarMode === "day" ? [scheduleDate] : calendarMode === "month" ? monthDays : weekDays;
  const scheduleEmployeeColumns = useMemo(() => {
    const fieldTechs = technicians.filter((tech) => tech.active && tech.fieldTech);
    return fieldTechs.length ? fieldTechs : [{ id: "", name: "Unassigned" } as Technician];
  }, [technicians]);
  const scheduleColumns = calendarMode === "employees"
    ? scheduleEmployeeColumns.map((tech) => ({ id: tech.id || "unassigned", label: tech.name, date: scheduleDate, technicianId: tech.id }))
    : scheduleDays.map((day) => ({ id: day.toISOString(), label: dayLabels[day.getDay()], date: day, technicianId: undefined as string | undefined }));
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
  const selectedJobTags = useMemo(() => splitTags(jobForm.tags), [jobForm.tags]);
  const tagSuggestions = useMemo(() => {
    const query = tagDraft.trim().toLowerCase();
    if (!query) return [];
    return crmOptions.tags
      .filter((tag) => !selectedJobTags.includes(tag) && tag.toLowerCase().includes(query))
      .slice(0, 8);
  }, [crmOptions.tags, selectedJobTags, tagDraft]);
  const leadSourceSuggestions = useMemo(() => {
    const query = jobForm.leadSource.trim().toLowerCase();
    if (!query) return [];
    return crmOptions.leadSources
      .filter((source) => source.toLowerCase().includes(query) && source !== jobForm.leadSource)
      .slice(0, 8);
  }, [crmOptions.leadSources, jobForm.leadSource]);
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
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();
    if (!query) return customers;
    return customers.filter((customer) => [
      customerName(customer),
      customer.phone,
      customer.email ?? "",
      customer.source ?? "",
      ...(customer.tags ?? []),
      ...(customer.additionalEmails ?? []),
      ...(customer.additionalPhones ?? []).map((phoneEntry) => phoneEntry.number),
      ...(customer.addresses ?? []).map(addressLine)
    ].some((value) => value.toLowerCase().includes(query)));
  }, [customerSearch, customers]);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) ?? null;
  const selectedCustomerJobs = useMemo(() => {
    if (!selectedCustomer) return [];
    return jobs.filter((job) => job.customer.id === selectedCustomer.id);
  }, [jobs, selectedCustomer]);
  const selectedCustomerInvoices = useMemo(() => {
    if (!selectedCustomer) return [];
    return invoices.filter((invoice) => invoice.customer.id === selectedCustomer.id);
  }, [invoices, selectedCustomer]);
  const selectedCustomerLifetimeValue = selectedCustomerInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const selectedCustomerOutstanding = selectedCustomerInvoices
    .filter((invoice) => invoice.status !== "PAID")
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const selectedCustomerLastService = [...selectedCustomerJobs]
    .filter((job) => job.scheduledStart || job.completedAt)
    .sort((a, b) => new Date(b.completedAt ?? b.scheduledStart ?? "").getTime() - new Date(a.completedAt ?? a.scheduledStart ?? "").getTime())[0];
  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return technicians;
    return technicians.filter((employee) => [
      employee.name,
      employee.email ?? "",
      employee.phone,
      employee.employmentType,
      employee.role
    ].some((value) => value.toLowerCase().includes(query)));
  }, [employeeSearch, technicians]);
  const jobCounts = useMemo(() => ({
    open: jobs.filter((job) => job.status === "LEAD" || job.status === "SCHEDULED").length,
    dispatched: jobs.filter((job) => job.status === "DISPATCHED").length,
    inProgress: jobs.filter((job) => job.status === "IN_PROGRESS").length,
    completed: jobs.filter((job) => job.status === "COMPLETED").length,
    canceled: jobs.filter((job) => job.status === "CANCELED").length
  }), [jobs]);
  const jobLineSubtotal = useMemo(() => jobLines.reduce((sum, item) => sum + (Number(item.quantity || "0") * dollarsToCents(item.unitPrice)), 0), [jobLines]);
  const jobTaxableSubtotal = useMemo(() => jobLines.reduce((sum, item) => {
    if (item.category !== "material" || item.taxable === false) return sum;
    return sum + (Number(item.quantity || "0") * dollarsToCents(item.unitPrice));
  }, 0), [jobLines]);
  const jobLineTax = Math.round(jobTaxableSubtotal * 0.094);
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
    const [summaryResult, customersResult, jobsResult, invoicesResult, techniciansResult, optionsResult, priceBookResult, templatesResult, servicePlanResult] = await Promise.all([
      api<Summary>("/api/settings/summary"),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ jobs: Job[] }>("/api/jobs"),
      api<{ invoices: Invoice[] }>("/api/invoices"),
      api<{ technicians: Technician[] }>("/api/technicians"),
      api<CrmOptions>("/api/settings/options"),
      api<{ categories: PriceBookCategory[]; items: PriceBookItem[] }>("/api/pricebook"),
      api<{ templates: JobTemplate[] }>("/api/settings/job-templates"),
      api<{ templates: ServicePlanTemplate[]; summary: ServicePlanSummary }>("/api/service-plans")
    ]);

    setSummary(summaryResult);
    setCustomers(customersResult.customers);
    setJobs(jobsResult.jobs);
    setInvoices(invoicesResult.invoices);
    setTechnicians(techniciansResult.technicians);
    setCrmOptions((current) => ({ ...current, ...optionsResult }));
    setPriceBookCategories(priceBookResult.categories);
    setPriceBookItems(priceBookResult.items);
    const savedTemplates = templatesResult.templates.map(normalizeJobTemplate);
    setJobTemplates([
      ...savedTemplates,
      ...defaultJobTemplates.filter((template) => !savedTemplates.some((saved) => saved.name.toLowerCase() === template.name.toLowerCase()))
    ]);
    setServicePlanTemplates(servicePlanResult.templates);
    setServicePlanSummary(servicePlanResult.summary);

    const [locationResult, apiKeyResult, meResult] = await Promise.all([
      api<{ activeLocationId: string; locations: LocationAccess[] }>("/api/locations"),
      api<{ apiKeys: ApiKey[] }>("/api/location-api-keys"),
      api<{ user: { memberships: Array<{ role: string; locationId: string | null }> }; activeLocationId: string }>("/api/auth/me")
    ]);
    setLocations(locationResult.locations);
    setActiveLocationId(locationResult.activeLocationId);
    setApiKeys(apiKeyResult.apiKeys);
    setCurrentRole(meResult.user.memberships.find((item) => item.locationId === meResult.activeLocationId)?.role ?? "");
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
    if (!selectedJob) return;
    setDetailLeadSource(selectedJob.leadSource || "");
    setDetailSummary(selectedJob.description || "");
    setDetailPrivateNote("");
    setDetailTagDraft("");
    setDetailSavedMessage("");
  }, [selectedJob?.id, selectedJob?.leadSource, selectedJob?.description]);

  useEffect(() => {
    if (!token) return;
    if (!["OWNER", "ADMIN"].includes(currentRole)) {
      setReports(null);
      return;
    }
    loadReports().catch((err: Error) => setError(err.message));
  }, [token, currentRole, reportDateRange, reportShowBy]);

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
      setCurrentRole(result.user.role);
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
    setCurrentRole("");
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
    setApiKeySecrets((current) => {
      const next = { ...current, [result.apiKey.id]: result.token };
      window.localStorage.setItem("affordable_crm_api_key_secrets", JSON.stringify(next));
      return next;
    });
  }

  async function copyText(value: string) {
    await navigator.clipboard.writeText(value);
  }

  function openEmployeeModal(type: "employee" | "subcontractor" | "owner") {
    const isOwner = type === "owner";
    setEmployeeForm({
      name: "",
      email: "",
      username: "",
      password: "",
      phone: "",
      employmentType: type === "subcontractor" ? "subcontractor" : "employee",
      role: isOwner ? "OWNER" : type === "subcontractor" ? "OUTSIDE_FIELD_TECH" : "INSIDE_SALES",
      fieldTech: type === "subcontractor",
      color: "#2563eb",
      active: true,
      locationName: "",
      locationSlug: "",
      locationPhone: "",
      locationStreet1: "",
      locationStreet2: "",
      locationCity: "",
      locationState: "CA",
      locationPostalCode: "",
      locationTimezone: "America/Phoenix"
    });
    setEmployeeEditingId("");
    setEmployeeModal(type);
  }

  function editEmployee(employee: Technician) {
    setEmployeeForm({
      name: employee.name,
      email: employee.email ?? "",
      username: "",
      password: "",
      phone: employee.phone,
      employmentType: employee.employmentType,
      role: employee.role,
      fieldTech: employee.fieldTech,
      color: employee.color,
      active: employee.active,
      locationName: "",
      locationSlug: "",
      locationPhone: "",
      locationStreet1: "",
      locationStreet2: "",
      locationCity: "",
      locationState: "CA",
      locationPostalCode: "",
      locationTimezone: "America/Phoenix"
    });
    setEmployeeEditingId(employee.id);
    setEmployeeModal(employee.employmentType);
  }

  async function saveEmployee(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      name: employeeForm.name,
      email: employeeForm.email,
      username: employeeForm.username || undefined,
      password: employeeForm.password || undefined,
      phone: employeeForm.phone,
      employmentType: employeeForm.employmentType,
      role: employeeForm.role,
      fieldTech: employeeForm.fieldTech,
      color: employeeForm.color,
      active: employeeForm.active,
      newLocation: employeeModal === "owner" && !employeeEditingId ? {
        name: employeeForm.locationName,
        slug: employeeForm.locationSlug || undefined,
        phone: employeeForm.locationPhone || undefined,
        street1: employeeForm.locationStreet1 || undefined,
        street2: employeeForm.locationStreet2 || undefined,
        city: employeeForm.locationCity || undefined,
        state: employeeForm.locationState || undefined,
        postalCode: employeeForm.locationPostalCode || undefined,
        timezone: employeeForm.locationTimezone
      } : undefined
    };
    if (employeeEditingId) {
      const result = await api<{ technician: Technician }>(`/api/technicians/${employeeEditingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setTechnicians((current) => current.map((item) => item.id === employeeEditingId ? result.technician : item).sort((a, b) => a.name.localeCompare(b.name)));
    } else {
      const result = await api<{ technician: Technician; location?: LocationAccess["location"] }>("/api/technicians", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      if (result.location) {
        await loadDashboard();
      } else {
        setTechnicians((current) => [...current, result.technician].sort((a, b) => a.name.localeCompare(b.name)));
      }
    }
    setEmployeeModal(null);
    setEmployeeEditingId("");
  }

  async function updateEmployeeAccess(employee: Technician, active: boolean) {
    setError("");
    const result = await api<{ technician: Technician }>(`/api/technicians/${employee.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active })
    });
    setTechnicians((current) => current.map((item) => item.id === employee.id ? result.technician : item));
  }

  async function revokeApiKey(id: string) {
    setError("");
    await api(`/api/location-api-keys/${id}/revoke`, { method: "POST" });
    setApiKeys((current) => current.map((item) => item.id === id ? { ...item, active: false, revokedAt: new Date().toISOString() } : item));
  }

  async function deleteApiKey(id: string) {
    setError("");
    await api(`/api/location-api-keys/${id}`, { method: "DELETE" });
    setApiKeys((current) => current.filter((item) => item.id !== id));
    setApiKeySecrets((current) => {
      const next = { ...current };
      delete next[id];
      window.localStorage.setItem("affordable_crm_api_key_secrets", JSON.stringify(next));
      return next;
    });
  }

  async function createCustomer(event: FormEvent) {
    event.preventDefault();
    setError("");
    const result = await api<{ customer: Customer }>("/api/customers", {
      method: "POST",
      body: JSON.stringify({
        firstName: customerForm.firstName,
        lastName: customerForm.lastName,
        phone: customerForm.phone,
        email: customerForm.email,
        additionalEmails: splitTags(customerForm.additionalEmails),
        additionalPhones: [
          customerForm.workPhone ? { label: "work", number: customerForm.workPhone } : null,
          customerForm.homePhone ? { label: "home", number: customerForm.homePhone } : null
        ].filter(Boolean),
        source: customerForm.source,
        tags: splitTags(customerForm.tags),
        notes: customerForm.notes,
        communicationPrefs: {
          sms: customerForm.communicationSms,
          email: customerForm.communicationEmail,
          phone: customerForm.communicationPhone
        },
        address: customerForm.street1 ? {
          label: "Service",
          street1: customerForm.street1,
          street2: customerForm.street2 || undefined,
          city: customerForm.city,
          state: customerForm.state,
          postalCode: customerForm.postalCode
        } : undefined
      })
    });
    setCustomers((current) => [result.customer, ...current.filter((item) => item.id !== result.customer.id)]);
    setSelectedCustomerId(result.customer.id);
    setCustomerProfileTab("profile");
    setCustomerForm(blankCustomerForm());
    await loadDashboard();
  }

  async function removeCustomer(id: string) {
    setError("");
    await api(`/api/customers/${id}`, { method: "DELETE" });
    if (selectedCustomerId === id) setSelectedCustomerId("");
    await loadDashboard();
  }

  function updateCustomerInState(customer: Customer) {
    setCustomers((current) => [customer, ...current.filter((item) => item.id !== customer.id)]);
    setSelectedCustomerId(customer.id);
  }

  async function addCustomerNote(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer || !customerNoteDraft.trim()) return;
    setError("");
    const result = await api<{ customer: Customer }>(`/api/customers/${selectedCustomer.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ content: customerNoteDraft })
    });
    updateCustomerInState(result.customer);
    setCustomerNoteDraft("");
  }

  async function addCustomerAddress(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer) return;
    setError("");
    const result = await api<{ customer: Customer }>(`/api/customers/${selectedCustomer.id}/addresses`, {
      method: "POST",
      body: JSON.stringify(customerAddressForm)
    });
    updateCustomerInState(result.customer);
    setCustomerAddressForm({ label: "Service", street1: "", street2: "", city: "", state: "CA", postalCode: "" });
  }

  async function addCustomerAttachment(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer || !customerAttachmentName.trim()) return;
    setError("");
    const result = await api<{ customer: Customer }>(`/api/customers/${selectedCustomer.id}/attachments`, {
      method: "POST",
      body: JSON.stringify({ name: customerAttachmentName })
    });
    updateCustomerInState(result.customer);
    setCustomerAttachmentName("");
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
        additionalEmails: splitTags(jobClientForm.additionalEmails),
        additionalPhones: [
          jobClientForm.workPhone ? { label: "work", number: jobClientForm.workPhone } : null,
          jobClientForm.homePhone ? { label: "home", number: jobClientForm.homePhone } : null
        ].filter(Boolean),
        source: jobForm.leadSource || jobClientForm.source,
        tags: splitTags(jobClientForm.tags),
        notes: jobClientForm.notes,
        address: jobClientForm.street1 ? {
          label: "Service",
          street1: jobClientForm.street1,
          street2: jobClientForm.street2 || undefined,
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
    setJobClientForm(blankCustomerForm());
  }

  async function addJobTag(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    const nextTags = [...new Set([...splitTags(jobForm.tags), cleanName])];
    setJobForm((current) => ({ ...current, tags: nextTags.join(", ") }));
    setTagDraft("");
    await saveJobOption("tag", cleanName);
  }

  async function addJobLeadSource(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;
    setJobForm((current) => ({ ...current, leadSource: cleanName }));
    await saveJobOption("leadSource", cleanName);
  }

  function selectJobCustomer(customer: Customer) {
    setCreateClientInline(false);
    setJobForm((current) => ({ ...current, customerId: customer.id, addressId: customer.addresses?.[0]?.id ?? "" }));
    setJobClientSearch(`${customer.firstName} ${customer.lastName} / ${customer.phone}`);
    setJobAddressSearch(customer.addresses?.[0] ? addressLine(customer.addresses[0]) : "");
  }

  function clearJobCustomer() {
    setJobForm((current) => ({ ...current, customerId: "", addressId: "" }));
    setJobClientSearch("");
    setJobAddressSearch("");
  }

  function openCustomerProfile(customer: Customer) {
    setSelectedCustomerId(customer.id);
    setCustomerProfileTab("profile");
    setActiveView("customers");
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
      unitPrice: String((item.price / 100).toFixed(2)),
      taxable: item.itemType === "material" && item.taxable
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

  function resetServicePlanForm() {
    setServicePlanForm({
      name: "",
      description: "",
      businessUnit: "Garage Door",
      visitsPerYear: "1",
      durationType: "indefinite",
      billingInterval: "yearly",
      recurringAmount: "0",
      cashAllowed: false,
      discountDescription: "",
      discountPercent: "",
      addOns: [{ item: "", unitPrice: "0", description: "" }]
    });
    setServicePlanStep(1);
  }

  function updateServicePlanAddOn(index: number, patch: Partial<{ item: string; unitPrice: string; description: string }>) {
    setServicePlanForm((current) => ({
      ...current,
      addOns: current.addOns.map((addOn, addOnIndex) => addOnIndex === index ? { ...addOn, ...patch } : addOn)
    }));
  }

  async function createServicePlanTemplate(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ template: ServicePlanTemplate }>("/api/service-plans/templates", {
        method: "POST",
        body: JSON.stringify({
          name: servicePlanForm.name,
          description: servicePlanForm.description,
          businessUnit: servicePlanForm.businessUnit,
          visitsPerYear: Number(servicePlanForm.visitsPerYear || "0"),
          durationType: servicePlanForm.durationType,
          billingInterval: servicePlanForm.billingInterval,
          recurringAmount: currencyToCents(servicePlanForm.recurringAmount),
          cashAllowed: servicePlanForm.cashAllowed,
          discountDescription: servicePlanForm.discountDescription,
          discountPercent: percentToNumber(servicePlanForm.discountPercent),
          addOns: servicePlanForm.addOns
            .filter((addOn) => addOn.item.trim())
            .map((addOn) => ({ item: addOn.item, unitPrice: currencyToCents(addOn.unitPrice), description: addOn.description }))
        })
      });
      setServicePlanTemplates((current) => [result.template, ...current.filter((template) => template.id !== result.template.id)]);
      await loadDashboard();
      resetServicePlanForm();
      setServicePlanMode("dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create service plan");
    }
  }

  async function deleteServicePlanTemplate(id: string) {
    setError("");
    await api(`/api/service-plans/templates/${id}`, { method: "DELETE" });
    setServicePlanTemplates((current) => current.filter((template) => template.id !== id));
    await loadDashboard();
  }

  function isStarterTemplate(id: string) {
    return defaultJobTemplates.some((template) => template.id === id);
  }

  function templateContents(template: JobTemplate) {
    const parts: string[] = [];
    const lineItems = template.lineItems ?? [];
    if (lineItems.length) parts.push(`${lineItems.length} line ${lineItems.length === 1 ? "item" : "items"}`);
    if (template.tags.length) parts.push(`${template.tags.length} ${template.tags.length === 1 ? "tag" : "tags"}`);
    if (template.privateNotes) parts.push("1 note");
    return parts.join(" · ") || "No saved contents yet";
  }

  function openTemplateEditor(template?: JobTemplate) {
    setError("");
    setTemplateEditorOpen(true);
    setEditingTemplateId(template?.id ?? "");
    setTemplateForm({
      name: template?.name ?? "",
      title: template?.title ?? "",
      jobType: template?.jobType ?? "Car Lockout Service",
      leadSource: template?.leadSource ?? "Phone Call",
      tags: template?.tags.join(", ") ?? "",
      privateNotes: template?.privateNotes ?? ""
    });
    setTemplateLineItems((template?.lineItems ?? []).map((item) => ({
      ...item,
      id: `template-${item.category}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    })));
  }

  function closeTemplateEditor() {
    setTemplateEditorOpen(false);
    setEditingTemplateId("");
    setTemplateForm({ name: "", title: "", jobType: "Car Lockout Service", leadSource: "Phone Call", tags: "", privateNotes: "" });
    setTemplateLineItems([]);
  }

  function updateTemplateLine(id: string, patch: Partial<JobLineDraft>) {
    setTemplateLineItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function addTemplateLine(category: "service" | "material") {
    setTemplateLineItems((current) => [...current, lineDraft(category, category === "service" ? "Service call" : "Material")]);
  }

  async function saveJobTemplate(event: FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      name: templateForm.name,
      title: templateForm.title,
      jobType: templateForm.jobType,
      leadSource: templateForm.leadSource || undefined,
      tags: splitTags(templateForm.tags),
      privateNotes: templateForm.privateNotes,
      lineItems: templateLineItems
        .filter((item) => item.name.trim())
        .map(({ id: _id, ...item }) => item)
    };
    const isSavedTemplate = editingTemplateId && !isStarterTemplate(editingTemplateId);
    const result = await api<{ template: JobTemplate }>(isSavedTemplate ? `/api/settings/job-templates/${editingTemplateId}` : "/api/settings/job-templates", {
      method: isSavedTemplate ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    const savedTemplate = normalizeJobTemplate(result.template);
    setJobTemplates((current) => [
      savedTemplate,
      ...current.filter((template) => template.id !== editingTemplateId && template.id !== savedTemplate.id && template.name.toLowerCase() !== savedTemplate.name.toLowerCase())
    ].sort((a, b) => a.name.localeCompare(b.name)));
    setCrmOptions((current) => ({
      ...current,
      jobTypes: [...new Set([...current.jobTypes, savedTemplate.jobType])].sort(),
      leadSources: savedTemplate.leadSource ? [...new Set([...current.leadSources, savedTemplate.leadSource])].sort() : current.leadSources,
      tags: [...new Set([...current.tags, ...(savedTemplate.tags ?? [])])].sort()
    }));
    closeTemplateEditor();
  }

  async function deleteJobTemplate(id: string) {
    if (isStarterTemplate(id)) {
      setJobTemplates((current) => current.filter((template) => template.id !== id));
      return;
    }
    setError("");
    await api(`/api/settings/job-templates/${id}`, { method: "DELETE" });
    setJobTemplates((current) => current.filter((template) => template.id !== id));
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
      internalNotes: current.internalNotes && template.privateNotes ? `${current.internalNotes}\n${template.privateNotes}` : (template.privateNotes ?? current.internalNotes)
    }));
    setJobLines((template.lineItems ?? []).map((item) => ({ ...item, id: `${item.category}-${Date.now()}-${Math.random().toString(36).slice(2)}` })));
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
          additionalEmails: splitTags(jobClientForm.additionalEmails),
          additionalPhones: [
            jobClientForm.workPhone ? { label: "work", number: jobClientForm.workPhone } : null,
            jobClientForm.homePhone ? { label: "home", number: jobClientForm.homePhone } : null
          ].filter(Boolean),
          source: jobForm.leadSource || jobClientForm.source,
          tags: splitTags(jobClientForm.tags),
          notes: jobClientForm.notes,
          address: jobClientForm.street1 ? {
            label: "Service",
            street1: jobClientForm.street1,
            street2: jobClientForm.street2 || undefined,
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
    const noteText = [jobNoteTarget === "job" ? jobForm.internalNotes : "", tagText].filter(Boolean).join("\n");

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
          taxable: item.category === "material" && item.taxable !== false
        }))
      })
    });
    if (jobNoteTarget === "customer" && jobForm.internalNotes.trim()) {
      await api(`/api/customers/${customerId}/notes`, {
        method: "POST",
        body: JSON.stringify({ content: jobForm.internalNotes.trim() })
      });
    }
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
    setJobNoteTarget("job");
    setJobClientForm(blankCustomerForm());
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

  function mergeJob(job: Job) {
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, ...job } : item));
  }

  async function updateJobStatus(job: Job, status: string) {
    setError("");
    const statusMessages: Record<string, string> = {
      DISPATCHED: "Technician marked on the way.",
      IN_PROGRESS: "Job marked started.",
      COMPLETED: "Job marked finished."
    };
    if (statusMessages[status]) {
      await api(`/api/jobs/${job.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ author: "System", content: statusMessages[status] })
      });
    }
    const result = await api<{ job: Job }>(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    mergeJob(result.job);
    setSelectedJobId(job.id);
    await loadDashboard();
  }

  async function updateJobDetails(job: Job, payload: Partial<Pick<Job, "tags" | "leadSource" | "description" | "internalNotes">> & { technicianId?: string }) {
    setError("");
    const result = await api<{ job: Job }>(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    mergeJob(result.job);
    setSelectedJobId(job.id);
    await loadDashboard();
    return result.job;
  }

  async function addJobDetailTag(job: Job) {
    const cleanName = detailTagDraft.trim();
    if (!cleanName) return;
    const tags = [...new Set([...(job.tags ?? []), cleanName])];
    await saveJobOption("tag", cleanName);
    await updateJobDetails(job, { tags });
    setDetailSavedMessage(`Added tag ${cleanName}`);
    setDetailTagDraft("");
  }

  async function removeJobDetailTag(job: Job, tag: string) {
    await updateJobDetails(job, { tags: (job.tags ?? []).filter((item) => item !== tag) });
  }

  async function saveJobDetailLeadSource(job: Job) {
    const cleanName = detailLeadSource.trim() || "Unknown";
    await saveJobOption("leadSource", cleanName);
    await updateJobDetails(job, { leadSource: cleanName });
    setDetailSavedMessage(`Lead source saved as ${cleanName}`);
  }

  async function saveJobSummary(job: Job) {
    await updateJobDetails(job, { description: detailSummary.trim() });
    setDetailSavedMessage("Summary of work saved");
  }

  async function addJobPrivateNote(job: Job) {
    const content = detailPrivateNote.trim();
    if (!content) return;
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "Office", content })
    });
    const existingNotes = job.internalNotes?.trim();
    await updateJobDetails(job, { internalNotes: existingNotes ? `${existingNotes}\n\n${content}` : content });
    setDetailPrivateNote("");
    setDetailSavedMessage("Private note added");
  }

  async function assignJobTechnician(job: Job, technicianId: string) {
    await updateJobDetails(job, { technicianId });
    const technicianName = technicians.find((technician) => technician.id === technicianId)?.name ?? "Unassigned";
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "System", content: `Assigned to ${technicianName}.` })
    });
    await loadDashboard();
    setDetailSavedMessage(`Assigned to ${technicianName}`);
  }

  function addAppointmentForJob(job: Job) {
    const start = job.scheduledEnd ? new Date(job.scheduledEnd) : new Date();
    if (!job.scheduledEnd) start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setSelectedJobId("");
    setCreateClientInline(false);
    setJobForm((current) => ({
      ...current,
      customerId: job.customer.id,
      addressId: job.address?.id ?? job.customer.addresses?.[0]?.id ?? "",
      technicianId: job.technician?.id ?? "",
      title: job.title || `Follow-up for job #${job.jobNumber}`,
      jobType: job.jobType,
      leadSource: job.leadSource || "Unknown",
      tags: (job.tags ?? []).join(", "),
      description: job.description || "",
      internalNotes: "",
      scheduledStart: toDateTimeLocal(start),
      scheduledEnd: toDateTimeLocal(end)
    }));
    setJobClientSearch(`${customerName(job.customer)} / ${job.customer.phone}`);
    setJobAddressSearch(addressLine(job.address ?? job.customer.addresses?.[0]));
    setJobPageMode("create");
    setActiveView("jobs");
  }

  async function createInvoiceFromJob(job: Job) {
    const existingInvoice = job.invoices?.[0];
    if (existingInvoice) return existingInvoice;
    const fallbackLineItem: NonNullable<Job["lineItems"]>[number] = {
      id: "fallback",
      category: "service",
      name: job.title || job.jobType || "Job service",
      quantity: "1",
      unitPrice: 0,
      taxable: false
    };
    const lineItems: NonNullable<Job["lineItems"]> = job.lineItems?.length ? job.lineItems : [fallbackLineItem];
    const result = await api<{ invoice: Invoice }>("/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        customerId: job.customer.id,
        jobId: job.id,
        status: "DRAFT",
        tax: calculateJobLineTax(job),
        items: lineItems.map((item) => ({
          name: item.name,
          quantity: Number(item.quantity || "1"),
          unitPrice: item.unitPrice,
          taxable: item.category === "material" && item.taxable !== false
        }))
      })
    });
    setInvoices((current) => [result.invoice, ...current.filter((invoice) => invoice.id !== result.invoice.id)]);
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, invoices: [result.invoice, ...(item.invoices ?? [])] } : item));
    setSelectedJobId(job.id);
    await loadDashboard();
    return result.invoice;
  }

  async function openJobPayment(job: Job) {
    try {
      const invoice = await createInvoiceFromJob(job);
      if (!invoice) return;
      const result = await api<{ url?: string }>(`/api/payments/invoices/${invoice.id}/checkout-session`, { method: "POST" });
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      setActiveView("invoices");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open Stripe payment checkout");
    }
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

  function moveSchedule(direction: -1 | 1) {
    setScheduleDate((current) => {
      if (calendarMode === "month") return addMonths(current, direction);
      return addDays(current, direction * (calendarMode === "day" ? 1 : 7));
    });
  }

  function changeCalendarMode(mode: CalendarMode) {
    setCalendarMode(mode);
    if (mode === "day" || mode === "employees") setScheduleDate(new Date());
  }

  function openJobDetail(job: Job) {
    setSelectedJobId(job.id);
    setSelectedScheduleJob(null);
    setJobPageMode("list");
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
          <button className={activeView === "employees" ? "active" : ""} onClick={() => setActiveView("employees")}><UserPlus size={18} /> Employees</button>
          <button className={activeView === "invoices" ? "active" : ""} onClick={() => setActiveView("invoices")}><ReceiptText size={18} /> Invoices</button>
          <button><FileText size={18} /> Estimates</button>
          <button><WalletCards size={18} /> Payments</button>
          <button><CalendarDays size={18} /> Events</button>
          <button><Clock3 size={18} /> Time Clock</button>
          <button><Laptop size={18} /> Online Booking</button>
          <button className={activeView === "pricebook" ? "active" : ""} onClick={() => setActiveView("pricebook")}><Tag size={18} /> Pricebook</button>
          <button className={activeView === "servicePlans" ? "active" : ""} onClick={() => setActiveView("servicePlans")}><CheckCheck size={18} /> Service Plans</button>

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
              <button onClick={() => { setAddMenuOpen(false); setActiveView("employees"); openEmployeeModal("employee"); }}><UserPlus size={16} /> Employee</button>
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
          <div className="breadcrumb"><Home size={17} /> {activeView === "dispatch" ? "Dashboard" : activeView === "servicePlans" ? "Service Plans" : activeView[0].toUpperCase() + activeView.slice(1)}</div>
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
              <button className="schedule-button today-button" onClick={() => setScheduleDate(new Date())}>Today</button>
              <div className="schedule-range">
                <button className="icon-button" onClick={() => moveSchedule(-1)} aria-label="Previous period"><ChevronLeft size={18} /></button>
                <strong>{formatScheduleRange(calendarMode, scheduleDate, weekStart)}</strong>
                <button className="icon-button" onClick={() => moveSchedule(1)} aria-label="Next period"><ChevronRight size={18} /></button>
              </div>
              <div className="calendar-tabs">
                {(["employees", "day", "week", "month"] as CalendarMode[]).map((mode) => (
                  <button key={mode} className={calendarMode === mode ? "active" : ""} onClick={() => changeCalendarMode(mode)}>
                    {mode === "employees" ? "Employees" : mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {calendarMode === "month" ? (
              <div className="month-calendar-grid">
                {monthDays.map((day) => {
                  const dayJobs = scheduledJobs.filter((job) => job.scheduledStart && sameCalendarDay(new Date(job.scheduledStart), day));
                  return (
                    <button className={day.getMonth() === scheduleDate.getMonth() ? "month-day" : "month-day muted"} key={day.toISOString()} onClick={() => { setScheduleDate(day); setCalendarMode("day"); }}>
                      <span>{dayLabels[day.getDay()]} {day.getDate()}</span>
                      {dayJobs.slice(0, 4).map((job) => (
                        <em key={job.id} onClick={(event) => { event.stopPropagation(); setSelectedScheduleJob(job); }}>{job.customer.firstName} {job.customer.lastName}</em>
                      ))}
                      {dayJobs.length > 4 && <small>+{dayJobs.length - 4} more</small>}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={`calendar-grid calendar-grid-${calendarMode}`} style={{ "--calendar-days": scheduleColumns.length } as CSSProperties}>
                <div className="calendar-corner" />
                {scheduleColumns.map((column) => (
                  <div className={sameCalendarDay(column.date, new Date()) ? "calendar-day-head today" : "calendar-day-head"} key={column.id}>
                    <span>{calendarMode === "employees" ? "Employee" : column.label}</span>
                    <strong>{calendarMode === "employees" ? column.label : column.date.getDate()}</strong>
                  </div>
                ))}
                <div className="calendar-time all-day">All Day</div>
                {scheduleColumns.map((column) => <button className="calendar-cell all-day-cell" key={`all-${column.id}`} onClick={() => setSlotPrompt({ date: column.date, hour: 9 })} />)}
                {calendarHours.map((hour) => (
                  <Fragment key={`row-${hour}`}>
                    <div className="calendar-time" key={`label-${hour}`}>{formatHour(hour)}</div>
                    {scheduleColumns.map((column) => {
                      const slotJobs = scheduledJobs.filter((job) => {
                        if (!job.scheduledStart) return false;
                        const start = new Date(job.scheduledStart);
                        const techMatches = calendarMode !== "employees" || (column.technicianId ? job.technician?.id === column.technicianId : !job.technician?.id);
                        return techMatches && sameCalendarDay(start, column.date) && start.getHours() === hour;
                      });
                      return (
                        <button className="calendar-cell" key={`${column.id}-${hour}`} onClick={() => setSlotPrompt({ date: column.date, hour })}>
                          {slotJobs.map((job) => (
                            <span
                              className="calendar-job"
                              key={job.id}
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedScheduleJob(job);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setSelectedScheduleJob(job);
                                }
                              }}
                            >
                              <strong>{job.customer.firstName} {job.customer.lastName}</strong>
                              <em>{job.scheduledStart ? `${new Date(job.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${job.scheduledEnd ? `-${new Date(job.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}` : job.title}</em>
                              <small>#{job.jobNumber}</small>
                            </span>
                          ))}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            )}
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

        {selectedScheduleJob && (
          <div className="modal-backdrop" onClick={() => setSelectedScheduleJob(null)}>
            <div className="schedule-job-modal" onClick={(event) => event.stopPropagation()}>
              <div className="schedule-job-title">
                <div>
                  <h2><Wrench size={22} /> Job #{selectedScheduleJob.jobNumber}</h2>
                  <p>
                    {selectedScheduleJob.scheduledStart ? new Date(selectedScheduleJob.scheduledStart).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Unscheduled"}
                    {selectedScheduleJob.scheduledEnd ? ` - ${new Date(selectedScheduleJob.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                  </p>
                </div>
                <button className="link-button" type="button" onClick={() => openJobDetail(selectedScheduleJob)}>View job</button>
              </div>
              <div className="schedule-job-details">
                <span><CalendarDays size={18} /> {selectedScheduleJob.title || selectedScheduleJob.jobType}</span>
                <span><CircleDollarSign size={18} /> {money.format(jobInvoiceTotal(selectedScheduleJob) / 100)}</span>
                <span><Users size={18} /> {customerName(selectedScheduleJob.customer)}</span>
                <span><MapPin size={18} /> {addressLine(selectedScheduleJob.address ?? selectedScheduleJob.customer.addresses?.[0])}</span>
                <span><Phone size={18} /> {selectedScheduleJob.customer.phone}</span>
                <span><UserPlus size={18} /> {selectedScheduleJob.technician?.name ?? "Unassigned"}</span>
              </div>
              {!!selectedScheduleJob.tags?.length && (
                <div className="schedule-job-tags">
                  {selectedScheduleJob.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              )}
              {selectedScheduleJob.internalNotes && <p className="schedule-job-note">{selectedScheduleJob.internalNotes}</p>}
            </div>
          </div>
        )}

        {activeView === "customers" && (
          <section className="customer-workspace">
            <div className="section-actions">
              <div className="breadcrumb"><Users size={17} /> Clients & Leads</div>
              <button className="primary" onClick={() => setSelectedCustomerId("")}><Plus size={18} /> Create Customer</button>
            </div>

            {!selectedCustomer ? (
              <div className="customer-grid">
                <section className="panel customer-form-panel">
                  <div className="panel-header"><h2>Create Customer</h2><UserPlus size={18} /></div>
                  <form className="record-form customer-create-form" onSubmit={createCustomer}>
                    <input placeholder="First name" value={customerForm.firstName} onChange={(event) => setCustomerForm({ ...customerForm, firstName: event.target.value })} required />
                    <input placeholder="Last name" value={customerForm.lastName} onChange={(event) => setCustomerForm({ ...customerForm, lastName: event.target.value })} required />
                    <input placeholder="Mobile phone" value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} required />
                    <input placeholder="Email" value={customerForm.email} onChange={(event) => setCustomerForm({ ...customerForm, email: event.target.value })} />
                    <input placeholder="Additional emails, comma separated" value={customerForm.additionalEmails} onChange={(event) => setCustomerForm({ ...customerForm, additionalEmails: event.target.value })} />
                    <input placeholder="Work phone" value={customerForm.workPhone} onChange={(event) => setCustomerForm({ ...customerForm, workPhone: event.target.value })} />
                    <input placeholder="Home phone" value={customerForm.homePhone} onChange={(event) => setCustomerForm({ ...customerForm, homePhone: event.target.value })} />
                    <select value={customerForm.source} onChange={(event) => setCustomerForm({ ...customerForm, source: event.target.value })}>
                      <option value="">Lead source</option>
                      {crmOptions.leadSources.map((source) => <option key={source} value={source}>{source}</option>)}
                    </select>
                    <input placeholder="Customer tags, comma separated" value={customerForm.tags} onChange={(event) => setCustomerForm({ ...customerForm, tags: event.target.value })} />
                    <input className="span-2" placeholder="Street address" value={customerForm.street1} onChange={(event) => setCustomerForm({ ...customerForm, street1: event.target.value })} />
                    <input placeholder="Unit, suite, gate code" value={customerForm.street2} onChange={(event) => setCustomerForm({ ...customerForm, street2: event.target.value })} />
                    <input placeholder="City" value={customerForm.city} onChange={(event) => setCustomerForm({ ...customerForm, city: event.target.value })} />
                    <input placeholder="State" value={customerForm.state} onChange={(event) => setCustomerForm({ ...customerForm, state: event.target.value })} />
                    <input placeholder="Postal code" value={customerForm.postalCode} onChange={(event) => setCustomerForm({ ...customerForm, postalCode: event.target.value })} />
                    <textarea className="span-2" placeholder="Customer notes" value={customerForm.notes} onChange={(event) => setCustomerForm({ ...customerForm, notes: event.target.value })} />
                    <div className="span-2 preference-row">
                      <label><input type="checkbox" checked={customerForm.communicationSms} onChange={(event) => setCustomerForm({ ...customerForm, communicationSms: event.target.checked })} /> SMS ok</label>
                      <label><input type="checkbox" checked={customerForm.communicationEmail} onChange={(event) => setCustomerForm({ ...customerForm, communicationEmail: event.target.checked })} /> Email ok</label>
                      <label><input type="checkbox" checked={customerForm.communicationPhone} onChange={(event) => setCustomerForm({ ...customerForm, communicationPhone: event.target.checked })} /> Phone ok</label>
                    </div>
                    <button className="primary span-2" type="submit"><Plus size={18} /> Save customer</button>
                  </form>
                </section>

                <section className="panel wide customers-list-panel">
                  <div className="panel-header"><h2>Customer List</h2><Users size={18} /></div>
                  <div className="table-search"><Search size={18} /><input placeholder="Search name, phone, email, tag, or address" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /></div>
                  <div className="customer-list">
                    {filteredCustomers.map((customer) => (
                      <article key={customer.id} onClick={() => { setSelectedCustomerId(customer.id); setCustomerProfileTab("profile"); }}>
                        <div className="customer-avatar">{customer.firstName.slice(0, 1)}{customer.lastName.slice(0, 1)}</div>
                        <div>
                          <strong>{customerName(customer)}</strong>
                          <span>{customer.phone} {customer.email ? `/ ${customer.email}` : ""}</span>
                          <small>{addressLine(customer.addresses?.[0])}</small>
                        </div>
                        <div className="customer-tags">{(customer.tags ?? []).slice(0, 3).map((tagName) => <span key={tagName}>{tagName}</span>)}</div>
                      </article>
                    ))}
                    {filteredCustomers.length === 0 && <p className="empty">No customers match that search yet.</p>}
                  </div>
                </section>
              </div>
            ) : (
              <div className="customer-profile">
                <div className="customer-profile-header">
                  <button className="text-button" onClick={() => setSelectedCustomerId("")}><ChevronLeft size={16} /> Customers</button>
                  <div>
                    <span>Customers &gt; {customerName(selectedCustomer)}</span>
                    <h1>{customerName(selectedCustomer)}</h1>
                  </div>
                  <div className="customer-profile-actions">
                    <button className="outline-button" onClick={() => { setActiveView("jobs"); setJobPageMode("create"); selectJobCustomer(selectedCustomer); }}><Plus size={17} /> Job</button>
                    <button className="outline-button"><Plus size={17} /> Estimate</button>
                    <button className="outline-button"><Plus size={17} /> Lead</button>
                    <button className="text-button" onClick={() => removeCustomer(selectedCustomer.id)}><Trash2 size={16} /> Remove</button>
                  </div>
                </div>

                <div className="customer-tabs">
                  {(["profile", "leads", "estimates", "jobs", "invoices", "attachments", "notes"] as const).map((tab) => (
                    <button key={tab} className={customerProfileTab === tab ? "active" : ""} onClick={() => setCustomerProfileTab(tab)}>
                      {tab[0].toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>

                {customerProfileTab === "profile" && (
                  <div className="customer-profile-grid">
                    <aside className="customer-side-card">
                      <section>
                        <h3>Summary</h3>
                        <dl>
                          <dt>Last service</dt><dd>{formatDate(selectedCustomerLastService?.completedAt ?? selectedCustomerLastService?.scheduledStart)}</dd>
                          <dt>Created</dt><dd>{formatDate(selectedCustomer.createdAt)}</dd>
                          <dt>Lifetime value</dt><dd>{money.format(selectedCustomerLifetimeValue / 100)}</dd>
                          <dt>Outstanding balance</dt><dd>{money.format(selectedCustomerOutstanding / 100)}</dd>
                        </dl>
                      </section>
                      <section>
                        <h3>Contact Info</h3>
                        <p><Phone size={15} /> {selectedCustomer.phone}</p>
                        {selectedCustomer.email && <p><Mail size={15} /> {selectedCustomer.email}</p>}
                        {(selectedCustomer.additionalPhones ?? []).map((entry) => <p key={`${entry.label}-${entry.number}`}><Smartphone size={15} /> {entry.label}: {entry.number}</p>)}
                        {(selectedCustomer.additionalEmails ?? []).map((entry) => <p key={entry}><Mail size={15} /> {entry}</p>)}
                      </section>
                      <section>
                        <h3>Payment Method</h3>
                        <button className="outline-button"><CreditCard size={16} /> Add credit card</button>
                        <button className="outline-button"><CreditCard size={16} /> Request card on file</button>
                      </section>
                      <section>
                        <h3>Communication Preferences</h3>
                        <p>{selectedCustomer.communicationPrefs?.sms === false ? "SMS opted out" : "SMS allowed"}</p>
                        <p>{selectedCustomer.communicationPrefs?.email === false ? "Email opted out" : "Email allowed"}</p>
                        <p>{selectedCustomer.communicationPrefs?.phone === false ? "Phone opted out" : "Phone allowed"}</p>
                      </section>
                    </aside>

                    <div className="customer-main-stack">
                      <section className="panel customer-map-panel">
                        <div className="customer-map-placeholder"><MapPin size={28} /><span>{addressLine(selectedCustomer.addresses?.[0])}</span></div>
                        <div className="panel-header">
                          <h2>{selectedCustomer.addresses?.length ?? 0} address{(selectedCustomer.addresses?.length ?? 0) === 1 ? "" : "es"}</h2>
                        </div>
                        <div className="address-list">
                          {(selectedCustomer.addresses ?? []).map((address) => (
                            <article key={address.id}>
                              <strong>{address.label ?? "Service"}</strong>
                              <span>{addressLine(address)}</span>
                            </article>
                          ))}
                        </div>
                        <form className="inline-address-form" onSubmit={addCustomerAddress}>
                          <input placeholder="Label" value={customerAddressForm.label} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, label: event.target.value })} />
                          <input placeholder="Street address" value={customerAddressForm.street1} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, street1: event.target.value })} required />
                          <input placeholder="Unit" value={customerAddressForm.street2} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, street2: event.target.value })} />
                          <input placeholder="City" value={customerAddressForm.city} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, city: event.target.value })} required />
                          <input placeholder="State" value={customerAddressForm.state} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, state: event.target.value })} required />
                          <input placeholder="ZIP" value={customerAddressForm.postalCode} onChange={(event) => setCustomerAddressForm({ ...customerAddressForm, postalCode: event.target.value })} required />
                          <button className="outline-button" type="submit"><Plus size={16} /> Add address</button>
                        </form>
                      </section>

                      <section className="panel customer-notes-panel">
                        <div className="panel-header"><h2>Private Notes</h2><StickyNote size={18} /></div>
                        <form className="note-form" onSubmit={addCustomerNote}>
                          <textarea placeholder="Add a private customer note" value={customerNoteDraft} onChange={(event) => setCustomerNoteDraft(event.target.value)} />
                          <button className="primary" type="submit"><Plus size={16} /> Add note</button>
                        </form>
                        <div className="customer-notes-list">
                          {(selectedCustomer.privateNotes ?? []).map((note) => (
                            <article key={note.id}>
                              <strong>{note.author}</strong>
                              <span>{formatDate(note.createdAt)}</span>
                              <p>{note.content}</p>
                            </article>
                          ))}
                          {(selectedCustomer.privateNotes ?? []).length === 0 && <p className="empty">No customer notes yet.</p>}
                        </div>
                      </section>
                    </div>
                  </div>
                )}

                {customerProfileTab === "jobs" && (
                  <section className="panel">
                    <div className="panel-header"><h2>Jobs</h2><Wrench size={18} /></div>
                    <div className="profile-table">
                      {selectedCustomerJobs.map((job) => (
                        <article key={job.id}>
                          <strong>#{job.jobNumber} {job.title}</strong>
                          <span>{formatDate(job.scheduledStart)} / {statusLabel(job.status)}</span>
                          <span>{addressLine(job.address ?? selectedCustomer.addresses?.[0])}</span>
                        </article>
                      ))}
                      {selectedCustomerJobs.length === 0 && <p className="empty">No jobs for this customer yet.</p>}
                    </div>
                  </section>
                )}

                {customerProfileTab === "invoices" && (
                  <section className="panel">
                    <div className="panel-header"><h2>Invoices</h2><ReceiptText size={18} /></div>
                    <div className="profile-table">
                      {selectedCustomerInvoices.map((invoice) => (
                        <article key={invoice.id}>
                          <strong>Invoice #{invoice.invoiceNumber}</strong>
                          <span>{formatDate(invoice.createdAt)} / {statusLabel(invoice.status)}</span>
                          <span>{money.format(invoice.total / 100)}</span>
                        </article>
                      ))}
                      {selectedCustomerInvoices.length === 0 && <p className="empty">No invoices for this customer yet.</p>}
                    </div>
                  </section>
                )}

                {customerProfileTab === "attachments" && (
                  <section className="panel">
                    <div className="panel-header"><h2>Attachments</h2><Paperclip size={18} /></div>
                    <form className="attachment-form" onSubmit={addCustomerAttachment}>
                      <input placeholder="Attachment filename or link" value={customerAttachmentName} onChange={(event) => setCustomerAttachmentName(event.target.value)} />
                      <button className="primary" type="submit"><Plus size={16} /> Add attachment</button>
                    </form>
                    <div className="profile-table">
                      {(selectedCustomer.attachments ?? []).map((attachment) => <article key={attachment}><strong>{attachment}</strong><span>Customer file</span></article>)}
                      {(selectedCustomer.attachments ?? []).length === 0 && <p className="empty">No attachments saved yet.</p>}
                    </div>
                  </section>
                )}

                {(customerProfileTab === "notes" || customerProfileTab === "leads" || customerProfileTab === "estimates") && (
                  <section className="panel">
                    <div className="panel-header"><h2>{customerProfileTab[0].toUpperCase() + customerProfileTab.slice(1)}</h2><FileText size={18} /></div>
                    {customerProfileTab === "notes" ? (
                      <div className="profile-table">
                        {(selectedCustomer.privateNotes ?? []).map((note) => <article key={note.id}><strong>{note.content}</strong><span>{note.author} / {formatDate(note.createdAt)}</span></article>)}
                        {(selectedCustomer.privateNotes ?? []).length === 0 && <p className="empty">No notes for this customer yet.</p>}
                      </div>
                    ) : <p className="empty">This tab is ready for the estimates and leads records as those modules come online.</p>}
                  </section>
                )}
              </div>
            )}
          </section>
        )}

        {activeView === "jobs" && (
          jobPageMode === "list" ? (
            <section className="jobs-page">
              <div className="section-actions">
                <div className="breadcrumb"><Wrench size={17} /> {selectedJob ? `Jobs / #${selectedJob.jobNumber}` : "Jobs"}</div>
                <div className="action-buttons">
                  {selectedJob && <button className="outline-button" type="button" onClick={() => setSelectedJobId("")}>All Jobs</button>}
                  <button className="outline-button"><Upload size={17} /> Import Jobs</button>
                  <button className="primary" onClick={() => { setSelectedJobId(""); setJobPageMode("create"); }}><Plus size={18} /> Create Job</button>
                </div>
              </div>

              {selectedJob ? (
                <div className="job-detail-view">
                  <section className="job-detail-titlebar">
                    <div>
                      <span className="breadcrumb">Customers / {customerName(selectedJob.customer)} / Jobs / Job #{selectedJob.jobNumber}</span>
                      <h1>Job #{selectedJob.jobNumber} • Job for {customerName(selectedJob.customer)}</h1>
                      <span className={`status-pill job-status-${selectedJob.status.toLowerCase()}`}>{selectedJob.status === "DISPATCHED" ? "On My Way" : statusLabel(selectedJob.status)}</span>
                      {detailSavedMessage && <span className="saved-chip">{detailSavedMessage}</span>}
                    </div>
                    <div className="job-detail-actions">
                      <button className="outline-button" type="button" onClick={() => addAppointmentForJob(selectedJob)}><CalendarDays size={17} /> Add Appointment</button>
                      <button className="outline-button" type="button" onClick={() => updateJobStatus(selectedJob, "DISPATCHED")}><Navigation size={17} /> On My Way</button>
                      <button className="outline-button" type="button" onClick={() => updateJobStatus(selectedJob, "IN_PROGRESS")}><Clock3 size={17} /> Start</button>
                      <button className="outline-button" type="button" onClick={() => updateJobStatus(selectedJob, "COMPLETED")}><CheckCheck size={17} /> Finish</button>
                      <button className="primary" type="button" onClick={() => createInvoiceFromJob(selectedJob)}><ReceiptText size={17} /> Invoice</button>
                      <button className="primary" type="button" onClick={() => openJobPayment(selectedJob)}><WalletCards size={17} /> Pay</button>
                    </div>
                  </section>

                  <div className="job-detail-layout">
                    <aside className="job-detail-side">
                      <section className="panel job-detail-customer">
                        <div className="panel-header">
                          <h2><Users size={18} /> Customer</h2>
                          <button className="outline-button" type="button" onClick={() => openCustomerProfile(selectedJob.customer)}>View details</button>
                        </div>
                        <div className="street-preview"><strong>Street view</strong><span>{selectedJob.address?.city || selectedJob.customer.addresses?.[0]?.city || "Service area"}</span></div>
                        <h3>{customerName(selectedJob.customer)}</h3>
                        <p><MapPin size={16} /> {addressLine(selectedJob.address ?? selectedJob.customer.addresses?.[0])}</p>
                        <p><Phone size={16} /> {selectedJob.customer.phone}</p>
                        {selectedJob.customer.email && <p><Mail size={16} /> {selectedJob.customer.email}</p>}
                        <span className="notification-chip">Notifications on</span>
                        <div className="payment-card-mini">
                          <CreditCard size={17} />
                          <span>No payment method</span>
                          <strong>Add card</strong>
                          <strong>Request card</strong>
                        </div>
                        <button className="customer-profile-link" type="button" onClick={() => openCustomerProfile(selectedJob.customer)}>Customer profile</button>
                      </section>

                      <section className="panel job-detail-meta">
                        <div className="panel-header"><h2><Tag size={18} /> Job tags</h2></div>
                        {!!selectedJob.tags?.length ? (
                          <div className="job-detail-tags">{selectedJob.tags.map((tag) => <span key={tag}>{tag}<button type="button" onClick={() => removeJobDetailTag(selectedJob, tag)}>x</button></span>)}</div>
                        ) : <p className="empty">No tags added.</p>}
                        <form className="detail-inline-form single" onSubmit={(event) => { event.preventDefault(); addJobDetailTag(selectedJob); }}>
                          <input
                            list="job-detail-tags-list"
                            placeholder="Add tag and press Enter"
                            value={detailTagDraft}
                            onChange={(event) => setDetailTagDraft(event.target.value)}
                            onBlur={() => {
                              if (detailTagDraft.trim()) addJobDetailTag(selectedJob);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                addJobDetailTag(selectedJob);
                              }
                            }}
                          />
                        </form>
                        <datalist id="job-detail-tags-list">
                          {crmOptions.tags.map((tag) => <option value={tag} key={tag} />)}
                        </datalist>
                      </section>

                      <section className="panel job-detail-meta">
                        <div className="panel-header"><h2><Navigation size={18} /> Lead source</h2></div>
                        <form className="detail-inline-form single" onSubmit={(event) => { event.preventDefault(); saveJobDetailLeadSource(selectedJob); }}>
                          <input
                            list="job-detail-leads-list"
                            value={detailLeadSource}
                            onChange={(event) => setDetailLeadSource(event.target.value)}
                            onBlur={() => {
                              if (detailLeadSource.trim() !== (selectedJob.leadSource || "")) saveJobDetailLeadSource(selectedJob);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveJobDetailLeadSource(selectedJob);
                              }
                            }}
                            placeholder="Lead source"
                          />
                        </form>
                        <datalist id="job-detail-leads-list">
                          {crmOptions.leadSources.map((source) => <option value={source} key={source} />)}
                        </datalist>
                      </section>
                    </aside>

                    <main className="job-detail-main">
                      <section className="panel job-workflow-panel">
                        <button type="button" onClick={() => addAppointmentForJob(selectedJob)}>
                          <CalendarDays size={22} />
                          <strong>Add Appointment</strong>
                          <span>{selectedJob.scheduledStart ? new Date(selectedJob.scheduledStart).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "Unscheduled"}</span>
                        </button>
                        <button type="button" onClick={() => updateJobStatus(selectedJob, "DISPATCHED")}><Navigation size={22} /><strong>OMW</strong><span>Dispatch tech</span></button>
                        <button type="button" onClick={() => updateJobStatus(selectedJob, "IN_PROGRESS")}><Clock3 size={22} /><strong>Start</strong><span>Begin work</span></button>
                        <button type="button" onClick={() => updateJobStatus(selectedJob, "COMPLETED")}><CheckCheck size={22} /><strong>Finish</strong><span>Complete job</span></button>
                        <button type="button" onClick={() => createInvoiceFromJob(selectedJob)}><ReceiptText size={22} /><strong>Invoice</strong><span>{selectedJobInvoice ? `#${selectedJobInvoice.invoiceNumber}` : "Create draft"}</span></button>
                        <button type="button" onClick={() => openJobPayment(selectedJob)}><WalletCards size={22} /><strong>Pay</strong><span>Take payment</span></button>
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Summary of Work</h2><button className="text-button" type="button" onClick={() => saveJobSummary(selectedJob)}>Save summary</button></div>
                        <textarea
                          className="detail-textarea"
                          placeholder="Add the visible summary of work for this job"
                          value={detailSummary}
                          onChange={(event) => setDetailSummary(event.target.value)}
                          onBlur={() => {
                            if (detailSummary.trim() !== (selectedJob.description || "")) saveJobSummary(selectedJob);
                          }}
                        />
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Appointments <span className="count-chip">{selectedJob.scheduledStart ? 1 : 0}</span></h2><button className="outline-button" type="button" onClick={() => addAppointmentForJob(selectedJob)}><Plus size={17} /> Appointment</button></div>
                        <div className="appointment-table">
                          <span>#</span><span>Date</span><span>Time</span><span>Arrival window</span><span>Employees</span>
                          {selectedJob.scheduledStart ? (
                            <>
                              <strong>1</strong>
                              <strong>{new Date(selectedJob.scheduledStart).toLocaleDateString([], { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric" })}</strong>
                              <strong>{new Date(selectedJob.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{selectedJob.scheduledEnd ? ` - ${new Date(selectedJob.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</strong>
                              <strong>1h</strong>
                              <strong>{selectedJob.technician?.name ?? "Unassigned"}</strong>
                            </>
                          ) : <p className="empty appointment-empty">No appointments scheduled.</p>}
                        </div>
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Field Tech Status</h2><UserPlus size={18} /></div>
                        <div className="field-tech-status">
                          <strong>{selectedJob.technician?.name ?? "Unassigned"}</strong>
                          <label>
                            Assign tech
                            <select value={selectedJob.technician?.id ?? ""} onChange={(event) => assignJobTechnician(selectedJob, event.target.value)}>
                              <option value="">Unassigned</option>
                              {technicians.filter((tech) => tech.active && tech.fieldTech).map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
                            </select>
                          </label>
                          <span>{selectedJob.technician ? statusLabel(selectedJob.status) : "Needs assignment"}</span>
                          <span>Total labor cost</span>
                          <strong>$0.00</strong>
                        </div>
                      </section>

                      <section className="panel invoice-summary-card">
                        <div className="panel-header">
                          <h2>Invoice</h2>
                          <div className="action-buttons">
                            <button className="outline-button" type="button" onClick={() => createInvoiceFromJob(selectedJob)}>{selectedJobInvoice ? "Refresh invoice" : "Create invoice"}</button>
                            <button className="primary" type="button" onClick={() => openJobPayment(selectedJob)}>Pay</button>
                          </div>
                        </div>
                        <div className="invoice-lines">
                          <span>Invoice number</span><strong>{selectedJobInvoice ? `#${selectedJobInvoice.invoiceNumber}` : "Not created yet"}</strong>
                          <span>Status</span><strong>{selectedJobInvoice ? statusLabel(selectedJobInvoice.status) : "Draft needed"}</strong>
                          <span>Subtotal</span><strong>{money.format(calculateJobLineSubtotal(selectedJob) / 100)}</strong>
                          <span>Tax</span><strong>{money.format(calculateJobLineTax(selectedJob) / 100)}</strong>
                          <span>Total</span><strong>{money.format((selectedJobInvoice?.total ?? calculateJobLineSubtotal(selectedJob) + calculateJobLineTax(selectedJob)) / 100)}</strong>
                        </div>
                        <p className="muted">Invoices are linked to the job, so payments and reporting stay tied back to the work order.</p>
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Line Items</h2><ReceiptText size={18} /></div>
                        <div className="profile-table">
                          {(selectedJob.lineItems ?? []).map((item) => (
                            <article key={item.id}>
                              <strong>{item.name}</strong>
                              <span>{item.category} / Qty {item.quantity} / {money.format(item.unitPrice / 100)}{item.category === "material" && item.taxable !== false ? " / taxable" : ""}</span>
                            </article>
                          ))}
                          {!(selectedJob.lineItems?.length) && <p className="empty">No line items on this job yet.</p>}
                        </div>
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Private Notes</h2><button className="text-button" type="button" onClick={() => addJobPrivateNote(selectedJob)}>Add note</button></div>
                        <textarea
                          className="detail-textarea compact"
                          placeholder="Add an internal private note"
                          value={detailPrivateNote}
                          onChange={(event) => setDetailPrivateNote(event.target.value)}
                        />
                        {selectedJob.internalNotes && <p className="job-detail-note">{selectedJob.internalNotes}</p>}
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Activity Feed</h2><MoreHorizontal size={18} /></div>
                        <div className="activity-feed">
                          <p><Wrench size={17} /> Job #{selectedJob.jobNumber} created: total = {money.format(jobInvoiceTotal(selectedJob) / 100)}</p>
                          {selectedJob.scheduledStart && <p><CalendarDays size={17} /> Job scheduled for {new Date(selectedJob.scheduledStart).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
                          {selectedJob.status === "DISPATCHED" && <p><Navigation size={17} /> Technician marked on the way.</p>}
                          {selectedJob.status === "IN_PROGRESS" && <p><Clock3 size={17} /> Job marked started.</p>}
                          {selectedJob.status === "COMPLETED" && <p><CheckCheck size={17} /> Job marked finished.</p>}
                          {selectedJob.technician && <p><UserPlus size={17} /> Assigned to {selectedJob.technician.name}</p>}
                          {(selectedJob.notes ?? []).map((note) => <p key={note.id}><StickyNote size={17} /> {note.content}</p>)}
                          {selectedJobInvoice && <p><ReceiptText size={17} /> Invoice #{selectedJobInvoice.invoiceNumber} linked to job.</p>}
                        </div>
                      </section>
                    </main>
                  </div>
                </div>
              ) : (
                <>
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
                    <span>Job #</span>
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
                      <div className="jobs-table-row clickable-row" key={job.id} role="button" tabIndex={0} onClick={() => openJobDetail(job)} onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openJobDetail(job);
                        }
                      }}>
                        <span><input type="checkbox" aria-label={`Select job ${job.jobNumber}`} onClick={(event) => event.stopPropagation()} /></span>
                        <strong>{job.jobNumber}</strong>
                        <span>{job.customer.firstName} {job.customer.lastName}</span>
                        <span>{job.scheduledStart ? new Date(job.scheduledStart).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</span>
                        <span>{addressLine(job.address ?? job.customer.addresses?.[0])}</span>
                        <span className={`status-pill job-status-${job.status.toLowerCase()}`}>{job.status === "DISPATCHED" ? "On My Way" : statusLabel(job.status)}</span>
                        <span className={`payment-pill ${paymentStatus.toLowerCase()}`}>{statusLabel(paymentStatus.toUpperCase())}</span>
                        <strong>{money.format(jobInvoiceTotal(job) / 100)}</strong>
                        <button className="text-button" aria-label={`Delete job ${job.jobNumber}`} onClick={(event) => event.stopPropagation()}><Trash2 size={16} /></button>
                      </div>
                    );
                  })}
                  {filteredJobs.length === 0 && <p className="empty table-empty">No jobs match this search.</p>}
                </div>
                  </div>
                </>
              )}
            </section>
          ) : (
            <section className="jobs-page job-create-page">
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

              <form id="create-job-form" className="job-create-layout compact-job-create" onSubmit={createJob}>
                <div className="job-create-column">
                  <section className="panel sms-toggle">
                    <strong>Send "Scheduled" SMS</strong>
                    <label className="switch">
                      <input type="checkbox" defaultChecked />
                      <span />
                    </label>
                  </section>

                  <section className="panel job-side-card">
                    <div className="panel-header"><h2><Users size={18} /> Customer</h2>{selectedJobCustomer && <button className="text-button" type="button" onClick={clearJobCustomer}>Clear</button>}</div>
                    {!createClientInline && !selectedJobCustomer && (
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
                                  <small>{addressLine(customer.addresses?.[0])}</small>
                                </button>
                              ))}
                              {clientMatches.length === 0 && <span className="typeahead-empty">No matching clients yet.</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {!createClientInline && selectedJobCustomer && (
                      <div className="job-customer-card">
                        <div className="job-customer-map">
                          <span>Street view</span>
                          <strong>{selectedJobCustomer.addresses?.[0]?.city || "Service address"}</strong>
                        </div>
                        <div className="job-customer-body">
                          <div className="job-customer-title">
                            <strong>{customerName(selectedJobCustomer)}</strong>
                            <button className="outline-button" type="button" onClick={() => openCustomerProfile(selectedJobCustomer)}>View details</button>
                          </div>
                          <p>{addressLine(selectedJobCustomer.addresses?.find((address) => address.id === jobForm.addressId) ?? selectedJobCustomer.addresses?.[0])}</p>
                          <p><Phone size={16} /> {selectedJobCustomer.phone}</p>
                          {selectedJobCustomer.email && <p><Mail size={16} /> {selectedJobCustomer.email}</p>}
                          <span className="notification-chip">{selectedJobCustomer.communicationPrefs?.sms === false ? "Notifications off" : "Notifications on"}</span>
                          <div className="payment-card-mini">
                            <CreditCard size={18} />
                            <span>No payment method</span>
                            <button type="button">Add card</button>
                            <button type="button">Request card</button>
                          </div>
                          {selectedJobAddresses.length > 1 && (
                            <div className="typeahead address-picker">
                              <input
                                placeholder="Select address details"
                                value={jobAddressSearch}
                                onChange={(event) => {
                                  setJobAddressSearch(event.target.value);
                                  setJobForm({ ...jobForm, addressId: "" });
                                }}
                              />
                              {jobAddressSearch && !jobForm.addressId && (
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
                          )}
                          <button className="customer-profile-link" type="button" onClick={() => openCustomerProfile(selectedJobCustomer)}>Customer profile</button>
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

                  <section className="panel schedule-card">
                    <div className="panel-header">
                      <h2><CalendarDays size={19} /> Schedule</h2>
                      <button className="icon-button subtle-icon" type="button" aria-label="Edit schedule"><Pencil size={18} /></button>
                    </div>
                    <div className="schedule-compact">
                      <div className="schedule-row">
                        <span>From</span>
                        <input type="date" value={jobForm.scheduledStart.slice(0, 10)} onChange={(event) => {
                          const time = jobForm.scheduledStart.slice(11) || "10:00";
                          const endDate = jobForm.scheduledEnd.slice(0, 10) || event.target.value;
                          const endTime = jobForm.scheduledEnd.slice(11) || "11:00";
                          setJobForm({ ...jobForm, scheduledStart: `${event.target.value}T${time}`, scheduledEnd: `${endDate}T${endTime}` });
                        }} />
                        <input type="time" value={jobForm.scheduledStart.slice(11) || "10:00"} onChange={(event) => {
                          const date = jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                          setJobForm({ ...jobForm, scheduledStart: `${date}T${event.target.value}` });
                        }} />
                      </div>
                      <div className="schedule-row">
                        <span>To</span>
                        <input type="date" value={(jobForm.scheduledEnd || jobForm.scheduledStart).slice(0, 10)} onChange={(event) => {
                          const time = jobForm.scheduledEnd.slice(11) || "11:00";
                          setJobForm({ ...jobForm, scheduledEnd: `${event.target.value}T${time}` });
                        }} />
                        <input type="time" value={jobForm.scheduledEnd.slice(11) || "11:00"} onChange={(event) => {
                          const date = jobForm.scheduledEnd.slice(0, 10) || jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                          setJobForm({ ...jobForm, scheduledEnd: `${date}T${event.target.value}` });
                        }} />
                      </div>
                      <label className="anytime-row"><input type="checkbox" /> Anytime</label>
                      <div className="schedule-team-row">
                        <Users size={21} />
                        <select value={jobForm.technicianId} onChange={(event) => setJobForm({ ...jobForm, technicianId: event.target.value })}>
                          <option value="">Edit team</option>
                          {technicians.filter((tech) => tech.active && tech.fieldTech).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                        </select>
                      </div>
                      {!jobForm.technicianId && <span className="unassigned-pill">Unassigned</span>}
                    </div>
                  </section>

                  <button className="job-collapsed-row" type="button"><ListChecks size={18} /> Checklists <Plus size={18} /></button>
                  <label className="job-collapsed-row file-row">
                    <Paperclip size={18} /> Attachments <Plus size={18} />
                    <input type="file" multiple onChange={(event) => setJobAttachments(Array.from(event.currentTarget.files ?? []).map((file) => file.name))} />
                  </label>

                  <section className="panel job-detail-card">
                    <div className="panel-header"><h2><FileText size={18} /> Fields</h2></div>
                    <div className="record-form compact-fields">
                      <label>Job Title
                        <input value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} placeholder="Car lockout, Rekey, Install" required />
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

                  <section className="panel job-chip-card">
                    <div className="panel-header"><h2><Tag size={18} /> Tags</h2><Plus size={18} /></div>
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
                        placeholder="Tags (press enter)"
                        value={tagDraft}
                        onFocus={() => setTagFocused(true)}
                        onBlur={() => {
                          window.setTimeout(() => setTagFocused(false), 120);
                          addJobTag(tagDraft).catch(() => undefined);
                        }}
                        onChange={(event) => setTagDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            addJobTag(tagDraft).catch((err: Error) => setError(err.message));
                          }
                        }}
                      />
                      <datalist id="tag-options">
                        {crmOptions.tags.map((tag) => <option key={tag} value={tag} />)}
                      </datalist>
                      {tagFocused && tagSuggestions.length > 0 && (
                        <div className="option-typeahead">
                          {tagSuggestions.map((tag) => (
                            <button type="button" key={tag} onMouseDown={(event) => event.preventDefault()} onClick={() => addJobTag(tag).catch((err: Error) => setError(err.message))}>{tag}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="panel job-chip-card">
                    <div className="panel-header"><h2><Navigation size={18} /> Lead source</h2><Plus size={18} /></div>
                    <input
                      list="lead-source-options"
                      value={jobForm.leadSource}
                      onChange={(event) => setJobForm({ ...jobForm, leadSource: event.target.value })}
                      onFocus={() => setLeadSourceFocused(true)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addJobLeadSource(jobForm.leadSource).catch((err: Error) => setError(err.message));
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setLeadSourceFocused(false), 120);
                        addJobLeadSource(jobForm.leadSource).catch(() => undefined);
                      }}
                      placeholder="Lead source (press enter)"
                    />
                    <datalist id="lead-source-options">
                      {crmOptions.leadSources.map((source) => <option key={source} value={source} />)}
                    </datalist>
                    {leadSourceFocused && leadSourceSuggestions.length > 0 && (
                      <div className="option-typeahead">
                        {leadSourceSuggestions.map((source) => (
                          <button type="button" key={source} onMouseDown={(event) => event.preventDefault()} onClick={() => addJobLeadSource(source).catch((err: Error) => setError(err.message))}>{source}</button>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <div className="job-main-column">
                  <section className="panel private-note-panel">
                    <div className="panel-header">
                      <h2><StickyNote size={18} /> Private notes</h2>
                      <div className="mini-segment">
                        <button type="button" className={jobNoteTarget === "job" ? "selected" : ""} onClick={() => setJobNoteTarget("job")}>This job</button>
                        <button type="button" className={jobNoteTarget === "customer" ? "selected" : ""} onClick={() => setJobNoteTarget("customer")}>Customer</button>
                      </div>
                    </div>
                    <textarea
                      placeholder={jobNoteTarget === "job" ? "Add an internal note for this job" : "Add a private customer profile note"}
                      value={jobForm.internalNotes}
                      onChange={(event) => setJobForm({ ...jobForm, internalNotes: event.target.value })}
                    />
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
                            <label className="line-tax-toggle">
                              <input type="checkbox" checked={item.category === "material" && item.taxable !== false} disabled={item.category !== "material"} onChange={(event) => updateJobLine(item.id, { taxable: event.target.checked })} />
                              Taxable
                            </label>
                            <button type="button" className="text-button" onClick={() => setJobLines((current) => current.filter((line) => line.id !== item.id))}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="totals-box">
                      <span>Subtotal <strong>{money.format(jobLineSubtotal / 100)}</strong></span>
                      <span>Tax rate <em>Taxable materials (9.4%)</em> <strong>{money.format(jobLineTax / 100)}</strong></span>
                      <span className="grand-total">Total <strong>{money.format(jobLineTotal / 100)}</strong></span>
                    </div>
                  </section>
                </div>
              </form>
            </section>
          )
        )}

        {activeView === "employees" && (
          <section className="employees-page">
            <div className="section-actions">
              <div className="breadcrumb"><UserPlus size={17} /> Employees</div>
              <div className="action-buttons">
                <button className="outline-button" type="button" onClick={() => openEmployeeModal("subcontractor")}><Plus size={17} /> Create Subcontractor</button>
                <button className="outline-button" type="button" onClick={() => openEmployeeModal("owner")}><Plus size={17} /> Create Owner + Location</button>
                <button className="primary" type="button" onClick={() => openEmployeeModal("employee")}><Plus size={17} /> Create Employee</button>
              </div>
            </div>

            <div className="employees-panel">
              <div className="jobs-tools">
                <div className="search-box table-search">
                  <Search size={18} />
                  <input placeholder="Search employees" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
                </div>
                <select aria-label="Page size">
                  <option>10</option>
                  <option>25</option>
                  <option>50</option>
                </select>
              </div>

              <div className="employees-table">
                <div className="employees-row employees-head">
                  <span>Name</span>
                  <span>Email</span>
                  <span>Phone</span>
                  <span>Type</span>
                  <span>Role</span>
                  <span>Field Tech</span>
                  <span>Status</span>
                  <span>Access</span>
                  <span>Actions</span>
                </div>
                {filteredEmployees.map((employee) => (
                  <div className="employees-row" key={employee.id}>
                    <strong>{employee.name}</strong>
                    <span>{employee.email || "-"}</span>
                    <span>{employee.phone}</span>
                    <span>{statusLabel(employee.employmentType.toUpperCase())}</span>
                    <span>{employeeRoleLabel(employee.role)}</span>
                    <span>{employee.fieldTech ? "Yes" : "No"}</span>
                    <span className={`payment-pill ${employee.active ? "paid" : "unpaid"}`}>{employee.active ? "Active" : "Inactive"}</span>
                    <small>{employee.userId ? (employee.permissions.includes("*") ? "Login + full access" : `Login + ${employee.permissions.join(", ")}`) : "Roster only"}</small>
                    <div className="employee-actions">
                      <button className="text-button" onClick={() => editEmployee(employee)}>Edit</button>
                      <button className="text-button" onClick={() => updateEmployeeAccess(employee, !employee.active)}>
                        {employee.active ? "Revoke" : "Restore"}
                      </button>
                    </div>
                  </div>
                ))}
                {filteredEmployees.length === 0 && <p className="empty table-empty">No employees yet.</p>}
              </div>
            </div>
          </section>
        )}

        {employeeModal && (
          <div className="modal-backdrop" onClick={() => setEmployeeModal(null)}>
            <form className="employee-modal record-form" onSubmit={saveEmployee} onClick={(event) => event.stopPropagation()}>
              <h2>{employeeEditingId ? "Edit Profile" : employeeModal === "owner" ? "Create Owner + Location" : employeeModal === "subcontractor" ? "Create Subcontractor" : "Create Employee"}</h2>
              <div className="employee-form-grid">
                <label>Name
                  <input value={employeeForm.name} onChange={(event) => setEmployeeForm({ ...employeeForm, name: event.target.value })} required />
                </label>
                <label>Email
                  <input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} required={employeeModal === "owner"} />
                </label>
                <label>Username
                  <input value={employeeForm.username} onChange={(event) => setEmployeeForm({ ...employeeForm, username: event.target.value })} placeholder="optional, defaults from email" />
                </label>
                <label>Temporary Password
                  <input type="password" value={employeeForm.password} onChange={(event) => setEmployeeForm({ ...employeeForm, password: event.target.value })} placeholder={employeeEditingId ? "Leave blank to keep password" : "8+ chars to create login"} required={employeeModal === "owner" && !employeeEditingId} />
                </label>
                <label>Phone Number
                  <input value={employeeForm.phone} onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })} required />
                </label>
                <label>Type
                  <select value={employeeForm.employmentType} onChange={(event) => setEmployeeForm({ ...employeeForm, employmentType: event.target.value as "employee" | "subcontractor" })}>
                    <option value="employee">Employee</option>
                    <option value="subcontractor">Subcontractor</option>
                  </select>
                </label>
                <label>Role
                  <select
                    value={employeeForm.role}
                    onChange={(event) => {
                      const role = event.target.value as Technician["role"];
                      setEmployeeForm({ ...employeeForm, role, fieldTech: role === "OUTSIDE_FIELD_TECH" });
                    }}
                  >
                    <option value="OWNER">Owner</option>
                    <option value="ADMIN">Admin</option>
                    <option value="INSIDE_SALES">Inside Sales</option>
                    <option value="OUTSIDE_FIELD_TECH">Outside Field Tech</option>
                  </select>
                </label>
                <label>Color
                  <input type="color" value={employeeForm.color} onChange={(event) => setEmployeeForm({ ...employeeForm, color: event.target.value })} />
                </label>
              </div>
              {employeeModal === "owner" && !employeeEditingId && (
                <>
                  <h3 className="modal-subhead">New Location</h3>
                  <div className="employee-form-grid">
                    <label>Location Name
                      <input value={employeeForm.locationName} onChange={(event) => setEmployeeForm({ ...employeeForm, locationName: event.target.value })} placeholder="San Diego" required />
                    </label>
                    <label>Location Slug
                      <input value={employeeForm.locationSlug} onChange={(event) => setEmployeeForm({ ...employeeForm, locationSlug: event.target.value })} placeholder="san-diego" />
                    </label>
                    <label>Company Phone
                      <input value={employeeForm.locationPhone} onChange={(event) => setEmployeeForm({ ...employeeForm, locationPhone: event.target.value })} />
                    </label>
                    <label>Street Address
                      <input value={employeeForm.locationStreet1} onChange={(event) => setEmployeeForm({ ...employeeForm, locationStreet1: event.target.value })} />
                    </label>
                    <label>Unit / Suite
                      <input value={employeeForm.locationStreet2} onChange={(event) => setEmployeeForm({ ...employeeForm, locationStreet2: event.target.value })} />
                    </label>
                    <label>City
                      <input value={employeeForm.locationCity} onChange={(event) => setEmployeeForm({ ...employeeForm, locationCity: event.target.value })} />
                    </label>
                    <label>State
                      <input value={employeeForm.locationState} onChange={(event) => setEmployeeForm({ ...employeeForm, locationState: event.target.value })} />
                    </label>
                    <label>ZIP
                      <input value={employeeForm.locationPostalCode} onChange={(event) => setEmployeeForm({ ...employeeForm, locationPostalCode: event.target.value })} />
                    </label>
                  </div>
                </>
              )}
              <label className="check-row"><input type="checkbox" checked={employeeForm.fieldTech} onChange={(event) => setEmployeeForm({ ...employeeForm, fieldTech: event.target.checked })} /> Field tech</label>
              <label className="check-row"><input type="checkbox" checked={employeeForm.active} onChange={(event) => setEmployeeForm({ ...employeeForm, active: event.target.checked })} /> Active</label>
              <div className="settings-note">
                Owners and admins can manage price book, reports, payments, employees, jobs, customers, and invoices. Creating an owner with a new location also gives your current admin account access to that new location.
              </div>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setEmployeeModal(null)}>Cancel</button>
                <button className="primary" type="submit">{employeeEditingId ? "Save Changes" : "Create"}</button>
              </div>
            </form>
          </div>
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

        {activeView === "servicePlans" && (
          <section className="service-plans-page">
            {servicePlanMode === "dashboard" ? (
              <>
                <div className="section-actions">
                  <div className="breadcrumb"><CheckCheck size={17} /> Service Plans</div>
                  <button className="primary" type="button" onClick={() => { resetServicePlanForm(); setServicePlanMode("create"); }}><Plus size={17} /> Service Plan</button>
                </div>

                <div className="stats-grid">
                  <StatCard label="Service Plan Revenue" value={money.format((servicePlanSummary?.servicePlanRevenueCents ?? 0) / 100)} icon={CircleDollarSign} />
                  <StatCard label="Recurring Revenue" value={money.format((servicePlanSummary?.recurringRevenueCents ?? 0) / 100)} icon={BadgeDollarSign} />
                  <StatCard label="Due For Billing" value={money.format((servicePlanSummary?.dueForBillingCents ?? 0) / 100)} icon={WalletCards} />
                  <StatCard label="Upcoming Scheduled Visits" value={String(servicePlanSummary?.upcomingScheduledVisits ?? 0)} icon={CalendarDays} />
                </div>

                <div className="service-plan-dashboard">
                  <section className="panel plan-summary-card">
                    <div className="panel-header">
                      <h2>Plan Summary</h2>
                      <button className="text-button" type="button">View all</button>
                    </div>
                    <div className="plan-summary-body">
                      <div>
                        <strong>{servicePlanSummary?.totalPlans ?? 0}</strong>
                        <span>total plan templates</span>
                        <strong>{money.format((servicePlanSummary?.servicePlanRevenueCents ?? 0) / 100)}</strong>
                        <span>revenue all time</span>
                      </div>
                      <div className="donut-chart" style={{ "--donut-a": "70%", "--donut-b": "30%" } as CSSProperties} />
                    </div>
                  </section>

                  <section className="panel recurring-card">
                    <div className="panel-header">
                      <h2>Recurring Revenue</h2>
                      <button className="text-button" type="button">View reporting</button>
                    </div>
                    <div className="mini-bar-chart">
                      {["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map((month, index) => (
                        <span key={month} style={{ height: `${index === 1 ? 42 : index === 5 ? 86 : 5}%` }}><em>{month}</em></span>
                      ))}
                    </div>
                  </section>

                  <section className="panel templates-card">
                    <div className="panel-header">
                      <h2>Plan Templates</h2>
                      <button className="icon-button" type="button" onClick={() => { resetServicePlanForm(); setServicePlanMode("create"); }} aria-label="Create service plan"><Plus size={18} /></button>
                    </div>
                    <div className="plan-template-list">
                      {servicePlanTemplates.map((template) => (
                        <article key={template.id}>
                          <div>
                            <strong>{template.name}</strong>
                            <span>{template.visitsPerYear} visit{template.visitsPerYear === 1 ? "" : "s"} per year</span>
                            <span>{template.durationType === "indefinite" ? "Indefinite" : "Fixed duration"} · {money.format(template.recurringAmount / 100)} / {template.billingInterval}</span>
                          </div>
                          <button className="text-button danger" type="button" onClick={() => deleteServicePlanTemplate(template.id)}><Trash2 size={16} /></button>
                        </article>
                      ))}
                      {servicePlanTemplates.length === 0 && <p className="empty">No service plan templates yet.</p>}
                    </div>
                  </section>

                  <section className="panel due-billing-card">
                    <div className="panel-header">
                      <h2>Due For Billing</h2>
                      <button className="text-button" type="button">View more</button>
                    </div>
                    <div className="simple-table">
                      <div className="simple-table-row simple-table-head">
                        <span>Customer</span><span>Phone</span><span>Due date</span><span>Status</span><span>Amount</span>
                      </div>
                      {(servicePlanSummary?.dueForBilling ?? []).map((bill) => (
                        <div className="simple-table-row" key={bill.id}>
                          <span>{bill.customer}</span>
                          <span>{bill.phone}</span>
                          <span>{formatDate(bill.dueDate)}</span>
                          <span>{bill.status}</span>
                          <strong>{money.format(bill.amount / 100)}</strong>
                        </div>
                      ))}
                      {!(servicePlanSummary?.dueForBilling.length) && <p className="empty table-empty">No upcoming bills due.</p>}
                    </div>
                  </section>

                  <section className="panel unscheduled-card">
                    <div className="panel-header">
                      <h2>Unscheduled Visits</h2>
                      <button className="text-button" type="button">View more</button>
                    </div>
                    <div className="simple-table">
                      <div className="simple-table-row simple-table-head">
                        <span>Customer Name</span><span>Address</span><span>Phone</span><span>Plan</span><span>Visit date</span><span>Reminder</span>
                      </div>
                      {(servicePlanSummary?.upcomingVisits ?? []).map((visit) => (
                        <div className="simple-table-row service-visits-row" key={visit.id}>
                          <span>{visit.customerName}</span>
                          <span>{visit.address}</span>
                          <span>{visit.phone}</span>
                          <span>{visit.plan}</span>
                          <span>{visit.visitDate}</span>
                          <span>{visit.reminderSent ? "Sent" : "Not sent"}</span>
                        </div>
                      ))}
                      {!(servicePlanSummary?.upcomingVisits.length) && <p className="empty table-empty">No unscheduled visits yet.</p>}
                    </div>
                  </section>
                </div>
              </>
            ) : (
              <form className="service-plan-builder" onSubmit={createServicePlanTemplate}>
                <div className="section-actions">
                  <div className="breadcrumb"><button className="text-button" type="button" onClick={() => setServicePlanMode("dashboard")}>Back</button> New service plan template</div>
                  <div className="action-buttons">
                    {servicePlanStep > 1 && <button className="outline-button" type="button" onClick={() => setServicePlanStep((step) => step - 1)}>Back</button>}
                    {servicePlanStep < 3 ? (
                      <button className="primary" type="button" onClick={() => setServicePlanStep((step) => step + 1)} disabled={servicePlanStep === 1 && !servicePlanForm.name.trim()}>Next</button>
                    ) : (
                      <button className="primary" type="submit">Create Plan</button>
                    )}
                  </div>
                </div>

                <div className="plan-stepper">
                  {[1, 2, 3].map((step) => <span key={step} className={servicePlanStep >= step ? "active" : ""}>{servicePlanStep > step ? "✓" : step}</span>)}
                </div>
                {error && <div className="error">{error}</div>}

                {servicePlanStep === 1 && (
                  <div className="service-plan-form-stack">
                    <section className="plan-builder-card">
                      <h2>General</h2>
                      <input placeholder="Plan name" value={servicePlanForm.name} onChange={(event) => setServicePlanForm({ ...servicePlanForm, name: event.target.value })} required />
                      <textarea placeholder="Plan description" value={servicePlanForm.description} onChange={(event) => setServicePlanForm({ ...servicePlanForm, description: event.target.value })} />
                    </section>
                    <section className="plan-builder-card">
                      <h2>Discount</h2>
                      <label className="check-row"><input type="checkbox" checked={Boolean(servicePlanForm.discountDescription)} onChange={(event) => setServicePlanForm({ ...servicePlanForm, discountDescription: event.target.checked ? "Apply discount to jobs" : "", discountPercent: event.target.checked ? servicePlanForm.discountPercent : "" })} /> Apply discount to jobs</label>
                      <div className="service-plan-inline">
                        <input placeholder="Description" value={servicePlanForm.discountDescription} onChange={(event) => setServicePlanForm({ ...servicePlanForm, discountDescription: event.target.value })} />
                        <input placeholder="Amount %" value={servicePlanForm.discountPercent} onChange={(event) => setServicePlanForm({ ...servicePlanForm, discountPercent: event.target.value })} />
                      </div>
                    </section>
                    <section className="plan-builder-card">
                      <h2>Business Unit</h2>
                      <input placeholder="Business unit" value={servicePlanForm.businessUnit} onChange={(event) => setServicePlanForm({ ...servicePlanForm, businessUnit: event.target.value })} />
                    </section>
                  </div>
                )}

                {servicePlanStep === 2 && (
                  <div className="service-plan-form-stack">
                    <section className="plan-builder-card">
                      <h2>Visits</h2>
                      <div className="service-plan-inline compact">
                        <input value={servicePlanForm.visitsPerYear} onChange={(event) => setServicePlanForm({ ...servicePlanForm, visitsPerYear: event.target.value })} />
                        <span>per year</span>
                      </div>
                    </section>
                    <section className="plan-builder-card">
                      <h2>Duration</h2>
                      <label className="check-row"><input type="radio" checked={servicePlanForm.durationType === "indefinite"} onChange={() => setServicePlanForm({ ...servicePlanForm, durationType: "indefinite" })} /> Continues until customer cancels</label>
                      <label className="check-row"><input type="radio" checked={servicePlanForm.durationType === "fixed"} onChange={() => setServicePlanForm({ ...servicePlanForm, durationType: "fixed" })} /> Ends after a set duration</label>
                    </section>
                    <section className="plan-builder-card">
                      <h2>Payment</h2>
                      {([
                        ["monthly", "Every month"],
                        ["quarterly", "Every quarter"],
                        ["semiannual", "Every 6 months"],
                        ["yearly", "Every year"]
                      ] as const).map(([value, label]) => (
                        <label className="service-payment-row" key={value}>
                          <span><input type="radio" checked={servicePlanForm.billingInterval === value} onChange={() => setServicePlanForm({ ...servicePlanForm, billingInterval: value })} /> {label}</span>
                          <input placeholder="$0.00" value={servicePlanForm.billingInterval === value ? servicePlanForm.recurringAmount : ""} onChange={(event) => setServicePlanForm({ ...servicePlanForm, billingInterval: value, recurringAmount: event.target.value })} />
                        </label>
                      ))}
                      <label className="check-row"><input type="checkbox" checked={servicePlanForm.cashAllowed} onChange={(event) => setServicePlanForm({ ...servicePlanForm, cashAllowed: event.target.checked })} /> payable by cash, check, other</label>
                    </section>
                  </div>
                )}

                {servicePlanStep === 3 && (
                  <section className="plan-builder-card add-ons-card">
                    <h2>Add-ons</h2>
                    {servicePlanForm.addOns.map((addOn, index) => (
                      <div className="add-on-row" key={index}>
                        <input placeholder="Item" value={addOn.item} onChange={(event) => updateServicePlanAddOn(index, { item: event.target.value })} />
                        <input placeholder="$0.00/mo" value={addOn.unitPrice} onChange={(event) => updateServicePlanAddOn(index, { unitPrice: event.target.value })} />
                        <input placeholder="Description (optional)" value={addOn.description} onChange={(event) => updateServicePlanAddOn(index, { description: event.target.value })} />
                        <button className="text-button danger" type="button" onClick={() => setServicePlanForm((current) => ({ ...current, addOns: current.addOns.filter((_item, addOnIndex) => addOnIndex !== index) }))}><Trash2 size={16} /></button>
                      </div>
                    ))}
                    <button className="text-add-button" type="button" onClick={() => setServicePlanForm((current) => ({ ...current, addOns: [...current.addOns, { item: "", unitPrice: "0", description: "" }] }))}><Plus size={17} /> Item</button>
                  </section>
                )}
              </form>
            )}
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
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("jobTemplates")}>
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
                  <button type="button" className="settings-card" onClick={() => setActiveView("servicePlans")}>
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
                  <button onClick={() => setSettingsSection("jobTemplates")}>Job Templates</button>
                  <button onClick={() => setSettingsSection("jobTypes")}>Job Types</button>
                  <button onClick={() => setActiveView("pricebook")}>Price Book</button>
                  <button onClick={() => setActiveView("servicePlans")}>Service Plans</button>
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
            ) : settingsSection === "jobTemplates" ? (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Global Settings</span>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                  <button onClick={() => setActiveView("api")}>API Access</button>
                  <span>Feature Configurations</span>
                  <button className="active" onClick={() => setSettingsSection("jobTemplates")}>Job Templates</button>
                  <button onClick={() => setSettingsSection("jobTypes")}>Job Types</button>
                  <button onClick={() => setActiveView("pricebook")}>Price Book</button>
                  <button onClick={() => setActiveView("servicePlans")}>Service Plans</button>
                  <span>Tags & Tools</span>
                  <button onClick={() => setSettingsSection("checklists")}>Checklists</button>
                  <button onClick={() => setSettingsSection("jobFields")}>Job Fields</button>
                  <button onClick={() => setSettingsSection("leadSources")}>Lead Sources</button>
                  <button onClick={() => setSettingsSection("tags")}>Tags</button>
                </aside>

                <section className="settings-panel template-settings">
                  {!templateEditorOpen ? (
                    <>
                      <div className="settings-panel-head">
                        <div>
                          <p className="settings-kicker">Jobs</p>
                          <h2>Templates</h2>
                          <p>Create common locksmith jobs with saved title, job type, tags, private notes, and price book style line items.</p>
                        </div>
                        <button className="primary" type="button" onClick={() => openTemplateEditor()}><Plus size={17} /> Job Template</button>
                      </div>

                      <div className="template-table">
                        <div className="template-table-row template-table-head">
                          <span>Template name</span>
                          <span>Contents</span>
                          <span>Actions</span>
                        </div>
                        {jobTemplates.map((template) => (
                          <div className="template-table-row" key={template.id}>
                            <strong>{template.name}</strong>
                            <span>{templateContents(template)}{isStarterTemplate(template.id) ? " · Starter" : ""}</span>
                            <span className="template-actions">
                              <button className="text-button" type="button" onClick={() => openTemplateEditor(template)} aria-label={`Edit ${template.name}`}><FileText size={16} /></button>
                              <button className="text-button danger" type="button" onClick={() => deleteJobTemplate(template.id)} aria-label={`Delete ${template.name}`}><Trash2 size={16} /></button>
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <form className="template-editor" onSubmit={saveJobTemplate}>
                      <div className="settings-panel-head">
                        <div>
                          <p className="settings-kicker">Job Template</p>
                          <h2>{editingTemplateId ? "Edit job template" : "New job template"}</h2>
                          <p>These fields apply to the New Job form when the template is selected.</p>
                        </div>
                        <div className="action-buttons">
                          <button className="outline-button" type="button" onClick={closeTemplateEditor}>Cancel</button>
                          <button className="primary" type="submit">Save</button>
                        </div>
                      </div>

                      <div className="template-alert"><FileText size={17} /> Price book items copied into a template can be adjusted on the job after the template is applied.</div>

                      <label>Template name
                        <input value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} placeholder="Emergency car lockout service" required />
                      </label>

                      <div className="template-editor-layout">
                        <div className="template-side-stack">
                          <section className="template-mini-card">
                            <h3>Job fields</h3>
                            <label>Job title
                              <input value={templateForm.title} onChange={(event) => setTemplateForm({ ...templateForm, title: event.target.value })} placeholder="Car lockout service" required />
                            </label>
                            <label>Job type
                              <input list="template-job-types" value={templateForm.jobType} onChange={(event) => setTemplateForm({ ...templateForm, jobType: event.target.value })} required />
                            </label>
                            <label>Lead source
                              <input list="template-lead-sources" value={templateForm.leadSource} onChange={(event) => setTemplateForm({ ...templateForm, leadSource: event.target.value })} />
                            </label>
                          </section>

                          <section className="template-mini-card">
                            <h3>Job tags</h3>
                            <input value={templateForm.tags} onChange={(event) => setTemplateForm({ ...templateForm, tags: event.target.value })} placeholder="lockout, automotive" />
                          </section>

                          <section className="template-mini-card">
                            <h3>Private notes</h3>
                            <textarea value={templateForm.privateNotes} onChange={(event) => setTemplateForm({ ...templateForm, privateNotes: event.target.value })} placeholder="Add an internal note for the office or tech." />
                          </section>
                        </div>

                        <section className="template-line-panel">
                          <div className="line-items-header">
                            <h2>Line items</h2>
                          </div>
                          {(["service", "material"] as const).map((category) => (
                            <div className="line-category" key={category}>
                              <div className="line-category-head">
                                <strong>{category === "service" ? "Services" : "Materials"}</strong>
                                <button className="text-add-button" type="button" onClick={() => addTemplateLine(category)}><Plus size={17} /> Add {category}</button>
                              </div>
                              {templateLineItems.filter((item) => item.category === category).map((item) => (
                                <div className="template-line-row" key={item.id}>
                                  <input value={item.name} onChange={(event) => updateTemplateLine(item.id, { name: event.target.value })} placeholder={`${category} name`} />
                                  <input value={item.description} onChange={(event) => updateTemplateLine(item.id, { description: event.target.value })} placeholder="Description" />
                                  <input value={item.quantity} onChange={(event) => updateTemplateLine(item.id, { quantity: event.target.value })} placeholder="Qty" />
                                  <input value={item.unitPrice} onChange={(event) => updateTemplateLine(item.id, { unitPrice: event.target.value })} placeholder="Price" />
                                  <button className="text-button danger" type="button" onClick={() => setTemplateLineItems((current) => current.filter((line) => line.id !== item.id))}><Trash2 size={15} /></button>
                                </div>
                              ))}
                            </div>
                          ))}
                        </section>
                      </div>
                    </form>
                  )}

                  <datalist id="template-job-types">
                    {crmOptions.jobTypes.map((value) => <option key={value} value={value} />)}
                  </datalist>
                  <datalist id="template-lead-sources">
                    {crmOptions.leadSources.map((value) => <option key={value} value={value} />)}
                  </datalist>
                </section>
              </div>
            ) : selectedSettings && (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Global Settings</span>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                  <button onClick={() => setActiveView("api")}>API Access</button>
                  <span>Feature Configurations</span>
                  <button onClick={() => setSettingsSection("jobTemplates")}>Job Templates</button>
                  <button className={settingsSection === "jobTypes" ? "active" : ""} onClick={() => setSettingsSection("jobTypes")}>Job Types</button>
                  <button onClick={() => setActiveView("pricebook")}>Price Book</button>
                  <button onClick={() => setActiveView("servicePlans")}>Service Plans</button>
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
                <button className="outline-button" type="button" onClick={() => copyText(newApiToken)}><Copy size={16} /> Copy token</button>
              </div>
            )}
            <div className="compact-list api-key-list">
              {apiKeys.slice(0, 6).map((item) => (
                <article key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.tokenPrefix} / {item.active ? "active" : "revoked"}</span>
                    {!item.token && !apiKeySecrets[item.id] && <small>Older keys cannot be fully recovered. Generate a new key to copy the full token.</small>}
                  </div>
                  <div className="api-key-actions">
                    <button className="outline-button" type="button" onClick={() => copyText(item.token ?? apiKeySecrets[item.id] ?? item.tokenPrefix)}>
                      <Copy size={16} /> Copy {item.token || apiKeySecrets[item.id] ? "Token" : "Prefix"}
                    </button>
                    {item.active && <button className="text-button" type="button" onClick={() => revokeApiKey(item.id)}>Revoke</button>}
                    <button className="text-button danger" type="button" onClick={() => deleteApiKey(item.id)}>Delete</button>
                  </div>
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
