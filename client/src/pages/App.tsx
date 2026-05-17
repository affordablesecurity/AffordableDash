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
  Download,
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
  Printer,
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
  Wrench,
  X
} from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ApiError, api, clearToken, getToken, login, setToken, signup } from "../api/client";
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
  estimates?: Estimate[];
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
  latitude?: number | string | null;
  longitude?: number | string | null;
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
  locationAccess?: Array<{ id: string; name: string; displayName?: string | null }>;
  allLocations?: boolean;
};

type CalendarEvent = {
  id: string;
  locationId?: string;
  technicianId?: string | null;
  name: string;
  notes?: string | null;
  eventLocation?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  scheduledStart: string;
  scheduledEnd: string;
  technician?: Technician | null;
  createdAt?: string;
  updatedAt?: string;
};

type EventForm = {
  name: string;
  notes: string;
  eventLocation: string;
  latitude: string;
  longitude: string;
  technicianId: string;
  scheduledStart: string;
  scheduledEnd: string;
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

type JobLineItem = {
  id: string;
  category: "service" | "material" | string;
  name: string;
  description?: string;
  quantity: string;
  unitPrice: number;
  unitCost?: number;
  taxable?: boolean;
};

type JobLineDialogState = {
  mode: "add" | "edit";
  category: "service" | "material";
  itemId?: string;
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
  latitude: string;
  longitude: string;
  communicationSms: boolean;
  communicationEmail: boolean;
  communicationPhone: boolean;
};

type Job = {
  id: string;
  jobNumber: number;
  createdAt?: string;
  title: string;
  jobType: string;
  leadSource?: string;
  tags?: string[];
  status: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  completedAt?: string;
  description?: string;
  internalNotes?: string;
  attachments?: string[];
  customer: Customer;
  address?: Address;
  technician?: Technician;
  lineItems?: JobLineItem[];
  invoices?: Invoice[];
  notes?: Array<{ id: string; author: string; content: string; createdAt: string }>;
};

type Estimate = {
  id: string;
  estimateNumber: number;
  createdAt?: string;
  title: string;
  jobType: string;
  leadSource?: string;
  tags?: string[];
  status: "DRAFT" | "SENT" | "APPROVED" | "DECLINED" | "CONVERTED";
  workflowStatus?: "DRAFT" | "SCHEDULED" | "EN_ROUTE" | "FINISHED";
  scheduledStart?: string;
  scheduledEnd?: string;
  description?: string;
  internalNotes?: string;
  approvalSignature?: string;
  approvalName?: string;
  approvalIpAddress?: string;
  approvedAt?: string;
  declinedAt?: string;
  depositType?: "NONE" | "PERCENT" | "FIXED";
  depositPercent?: number | null;
  depositAmount?: number | null;
  approvedOptionId?: string | null;
  convertedJobId?: string;
  customer: Customer;
  address?: Address;
  technician?: Technician;
  lineItems?: Array<{ id: string; optionId?: string | null; category: string; name: string; description?: string; quantity: string; unitPrice: number; taxable?: boolean }>;
  options?: Array<{ id: string; title: string; description?: string; imageName?: string; sortOrder: number; lineItems?: Array<{ id: string; optionId?: string | null; category: string; name: string; description?: string; quantity: string; unitPrice: number; taxable?: boolean }> }>;
  convertedJob?: Job;
};

type Invoice = {
  id: string;
  invoiceNumber: number;
  status: string;
  subtotal?: number;
  tax?: number;
  total: number;
  createdAt?: string;
  dueAt?: string;
  paidAt?: string;
  customer: Customer;
  job?: Job;
  items?: Array<{ id: string; category?: string; name: string; description?: string; quantity: number | string; unitPrice: number; taxable?: boolean }>;
};

type PaymentRecord = {
  id: string;
  invoiceId: string;
  amount: number;
  status: string;
  provider: string;
  providerRef?: string;
  paidAt?: string;
  createdAt: string;
};

type SendInvoiceResponse = {
  invoice: Invoice;
  deliveries: Array<CrmMessage | null>;
  paymentUrl?: string;
  checkoutSessionId?: string;
  paymentLinkWarning?: string | null;
};

type SendEstimateResponse = {
  estimate: Estimate;
  deliveries: Array<CrmMessage | null>;
  estimateUrl: string;
};

type LocationAccess = {
  role: string;
  organization: { id: string; name: string };
  location: {
    id: string;
    organizationId: string;
    name: string;
    displayName?: string | null;
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

type View = "dispatch" | "schedule" | "map" | "messages" | "customers" | "jobs" | "estimates" | "employees" | "invoices" | "reports" | "pricebook" | "servicePlans" | "events" | "settings" | "api";
type CalendarMode = "employees" | "day" | "week" | "month";
type SlotPrompt = { date: Date; hour: number; minute: number; technicianId?: string } | null;
type CrmOptionKind = "leadSource" | "tag" | "jobType" | "jobField" | "checklist" | "servicePlan";
type SettingsSection = "overview" | "company" | "invoiceSettings" | "stripe" | "messagingSettings" | "tags" | "leadSources" | "jobTypes" | "jobFields" | "checklists" | "servicePlans" | "jobTemplates";
type CrmOptions = {
  leadSources: string[];
  tags: string[];
  jobTypes: string[];
  jobFields: string[];
  checklists: string[];
  servicePlans: string[];
};

type StripeStatus = {
  configured: boolean;
  connected: boolean;
  accountId?: string;
  businessName?: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  dashboardUrl?: string;
};

type InvoiceSettings = {
  tab: "configuration" | "automation" | "customerView" | "delivery";
  logoName: string;
  logoDataUrl: string;
  invoiceMessage: string;
  defaultTermsType: "uponReceipt" | "net";
  defaultTermsDays: number;
  progressiveInvoicing: boolean;
  matchInvoiceAndJobNumber: boolean;
  includeImages: boolean;
  acceptCreditCard: boolean;
  saveCardOnFile: boolean;
  acceptAch: boolean;
  acceptTips: boolean;
  separateTippingScreen: boolean;
  autoReminders: boolean;
  reminderCadenceDays: number;
  maxReminders: number;
  autoChargeCard: boolean;
  showJobNumber: boolean;
  showInvoiceNumber: boolean;
  showServiceDate: boolean;
  showInvoiceDate: boolean;
  showSummaryOfWork: boolean;
  showBusinessName: boolean;
  showTechnicianName: boolean;
  showCustomerDisplayName: boolean;
  showCustomerCompanyName: boolean;
  showServiceLineItems: boolean;
  showServiceName: boolean;
  showServiceDescription: boolean;
  showServiceQuantity: boolean;
  showServiceUnitPrice: boolean;
  showServiceAmount: boolean;
  showMaterialLineItems: boolean;
  showMaterialName: boolean;
  showMaterialDescription: boolean;
  customerViewFormat: "email" | "envelope";
  emailSubjectTemplate: string;
  emailBodyTemplate: string;
  smsTemplate: string;
  reminderSubjectTemplate: string;
  reminderBodyTemplate: string;
};

type MessagingTemplateKey = "appointmentScheduled" | "onMyWay" | "workStarted" | "jobCompleted" | "invoiceSent" | "paymentReceived";

type CrmMessage = {
  id: string;
  locationId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  invoiceId?: string | null;
  direction: "INBOUND" | "OUTBOUND";
  fromNumber: string;
  toNumber: string;
  body: string;
  channel?: string;
  status?: string;
  error?: string | null;
  templateKey?: string | null;
  providerRef?: string | null;
  attachments?: string[];
  createdAt: string;
  customer?: Customer | null;
};

type MessageAttachment = {
  name: string;
  type?: string;
  size?: number;
  dataUrl?: string;
  url?: string;
};

const customerMmsImageTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif"
};
const customerMmsVideoTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".webm": "video/webm"
};
const customerMmsDocumentTypes: Record<string, string> = {
  ".pdf": "application/pdf"
};
const customerMmsTypes: Record<string, string> = {
  ...customerMmsImageTypes,
  ...customerMmsVideoTypes,
  ...customerMmsDocumentTypes
};
const customerMmsMaxBytes = 1_300_000;
const customerMmsMaxFiles = 3;

type MessageThread = {
  id: string;
  label: string;
  phone: string;
  customer?: Customer | null;
  messages: CrmMessage[];
  latest: string;
  unread: number;
};

type InternalRecipient = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  kind: string;
  technicianId?: string | null;
  fieldTech?: boolean;
};

type MessagingSettings = {
  smsEnabled: boolean;
  username: string;
  apiPassword: string;
  defaultDid: string;
  areaCode: string;
  availableDids: string[];
  autoSend: Record<MessagingTemplateKey, boolean>;
  templates: Record<MessagingTemplateKey, string>;
  reviewEmail: {
    enabled: boolean;
    subject: string;
    body: string;
  };
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
const calendarSlotMinutes = [0, 15, 30, 45];
const calendarSlots = calendarHours.flatMap((hour) => calendarSlotMinutes.map((minute) => ({ hour, minute })));
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
const dashboardDateRanges = [
  { value: "today", label: "Today" },
  { value: "selectedDay", label: "Selected day" },
  { value: "weekToDate", label: "Week to date" },
  { value: "monthToDate", label: "Month to date" },
  { value: "quarterToDate", label: "Quarter to date" },
  { value: "yearToDate", label: "Year to date" },
  { value: "lastWeek", label: "Last week" },
  { value: "lastMonth", label: "Last month" },
  { value: "lastYear", label: "Last year" }
];

const viewPathMap: Record<View, string> = {
  dispatch: "/dashboard",
  schedule: "/schedule",
  map: "/map",
  messages: "/messages",
  customers: "/customers",
  jobs: "/jobs",
  estimates: "/estimates",
  employees: "/employees",
  invoices: "/invoices",
  reports: "/reports",
  pricebook: "/pricebook",
  servicePlans: "/service-plans",
  events: "/events",
  settings: "/settings",
  api: "/api-access"
};

function viewFromPath(pathname: string): View {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = (Object.entries(viewPathMap) as Array<[View, string]>).find(([_view, path]) => normalized === path);
  if (match) return match[0];
  if (normalized === "/" || normalized === "/home") return "dispatch";
  if (normalized === "/clients" || normalized === "/clients-leads") return "customers";
  if (normalized === "/price-book") return "pricebook";
  if (normalized === "/settings/stripe") return "settings";
  return "dispatch";
}

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

function formatHour(hour: number, minute = 0) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return minute ? `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}` : `${displayHour} ${suffix}`;
}

function toDateTimeLocal(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toInputDate(date: Date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formDatePart(value: string) {
  return value ? value.slice(0, 10) : "";
}

function formTimePart(value: string) {
  return value ? value.slice(11, 16) : "";
}

function mergeDateAndTime(current: string, part: "date" | "time", nextValue: string) {
  const fallback = current || toDateTimeLocal(new Date());
  const [date, time] = fallback.split("T");
  return part === "date" ? `${nextValue}T${time || "09:00"}` : `${date || toInputDate(new Date())}T${nextValue}`;
}

function blankEventForm(): EventForm {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 1);
  return {
    name: "",
    notes: "",
    eventLocation: "",
    latitude: "",
    longitude: "",
    technicianId: "",
    scheduledStart: toDateTimeLocal(start),
    scheduledEnd: toDateTimeLocal(end)
  };
}

function sameCalendarDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sameCalendarSlot(date: Date, hour: number, minute: number) {
  return date.getHours() === hour && Math.floor(date.getMinutes() / 15) * 15 === minute;
}

function sourceColor(index: number) {
  return ["green", "navy", "purple", "yellow", "red"][index % 5];
}

function statusLabel(status: string) {
  return status.split("_").map((part) => part[0] + part.slice(1).toLowerCase()).join(" ");
}

function addressLine(address?: Partial<Pick<Address, "street1" | "city" | "state" | "postalCode">>) {
  if (!address) return "No address selected";
  return [address.street1, address.city, address.state, address.postalCode].filter(Boolean).join(", ");
}

type AddressSuggestion = {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
};

type PlaceAddress = {
  placeId: string;
  formattedAddress: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
};

function placeToAddressPatch(place: PlaceAddress) {
  return {
    street1: place.street1,
    street2: place.street2 ?? "",
    city: place.city,
    state: place.state,
    postalCode: place.postalCode,
    latitude: place.latitude === undefined ? "" : String(place.latitude),
    longitude: place.longitude === undefined ? "" : String(place.longitude)
  };
}

function hasCoordinate(value: unknown) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

type StreetViewAddress = Partial<Pick<Address, "street1" | "street2" | "city" | "state" | "postalCode" | "latitude" | "longitude">>;

function streetViewUrl(address?: Pick<StreetViewAddress, "latitude" | "longitude"> | null, size = "640x320") {
  if (!address || !hasCoordinate(address.latitude) || !hasCoordinate(address.longitude)) return "";
  return `/api/places/street-view?lat=${encodeURIComponent(String(address.latitude))}&lng=${encodeURIComponent(String(address.longitude))}&size=${encodeURIComponent(size)}`;
}

function StreetViewPreview({ address, fallback, className = "street-preview" }: { address?: StreetViewAddress | null; fallback?: string; className?: string }) {
  const imageUrl = streetViewUrl(address);
  if (imageUrl) {
    return (
      <div className={`${className} street-view-ready`}>
        <img className="street-view-image" src={imageUrl} alt={`Street view for ${addressLine(address ?? undefined)}`} loading="lazy" />
      </div>
    );
  }

  return (
    <div className={className}>
      <strong>Street view</strong>
      <span>{fallback ?? "Service area"}</span>
    </div>
  );
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

function calculateEstimateSubtotal(estimate: Estimate) {
  return (estimate.lineItems ?? []).reduce((sum, item) => sum + Number(item.quantity || "0") * item.unitPrice, 0);
}

function calculateEstimateTax(estimate: Estimate) {
  const taxableSubtotal = (estimate.lineItems ?? []).reduce((sum, item) => {
    const isTaxable = item.category === "material" && item.taxable !== false;
    return isTaxable ? sum + Number(item.quantity || "0") * item.unitPrice : sum;
  }, 0);
  return Math.round(taxableSubtotal * 0.094);
}

function estimateTotal(estimate: Estimate) {
  return calculateEstimateSubtotal(estimate) + calculateEstimateTax(estimate);
}

function estimateDepositDue(estimate: Estimate) {
  const total = estimateTotal(estimate);
  if (estimate.depositType === "PERCENT") return Math.round(total * ((estimate.depositPercent ?? 50) / 100));
  if (estimate.depositType === "FIXED") return Math.min(estimate.depositAmount ?? 0, total);
  return 0;
}

function estimateOptionTotal(option: NonNullable<Estimate["options"]>[number]) {
  const lineItems = option.lineItems ?? [];
  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.quantity || "0") * item.unitPrice, 0);
  const taxable = lineItems.reduce((sum, item) => item.category === "material" && item.taxable !== false ? sum + Number(item.quantity || "0") * item.unitPrice : sum, 0);
  return subtotal + Math.round(taxable * 0.094);
}

function estimateWorkflowLabel(status?: Estimate["workflowStatus"]) {
  if (status === "EN_ROUTE") return "En route";
  if (status === "FINISHED") return "Finished";
  if (status === "SCHEDULED") return "Scheduled";
  return "Draft";
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
    latitude: "",
    longitude: "",
    communicationSms: true,
    communicationEmail: true,
    communicationPhone: true
  };
}

function customerName(customer?: Customer) {
  if (!customer) return "Unknown customer";
  return [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.companyName || "Unnamed customer";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "numeric" }) : "Not recorded";
}

function formatDateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "Not recorded";
}

function eventTimeLabel(calendarEvent: CalendarEvent) {
  return `${formatDateTime(calendarEvent.scheduledStart)} - ${new Date(calendarEvent.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function dollarsToCents(value: string) {
  return Math.round(Number(value || "0") * 100);
}

function currencyToCents(value: string) {
  const normalized = value.replace(/[$,\s]/g, "");
  const amount = Number(normalized || "0");
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function centsToDollarInput(value: number) {
  return (value / 100).toFixed(2);
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
  id: Exclude<SettingsSection, "overview" | "company" | "invoiceSettings" | "stripe" | "messagingSettings" | "jobTemplates">;
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

const defaultInvoiceSettings: InvoiceSettings = {
  tab: "configuration",
  logoName: "",
  logoDataUrl: "",
  invoiceMessage: "",
  defaultTermsType: "uponReceipt",
  defaultTermsDays: 30,
  progressiveInvoicing: false,
  matchInvoiceAndJobNumber: false,
  includeImages: true,
  acceptCreditCard: true,
  saveCardOnFile: true,
  acceptAch: true,
  acceptTips: true,
  separateTippingScreen: true,
  autoReminders: false,
  reminderCadenceDays: 1,
  maxReminders: 10,
  autoChargeCard: false,
  showJobNumber: true,
  showInvoiceNumber: false,
  showServiceDate: true,
  showInvoiceDate: true,
  showSummaryOfWork: true,
  showBusinessName: true,
  showTechnicianName: true,
  showCustomerDisplayName: true,
  showCustomerCompanyName: true,
  showServiceLineItems: true,
  showServiceName: true,
  showServiceDescription: true,
  showServiceQuantity: true,
  showServiceUnitPrice: true,
  showServiceAmount: true,
  showMaterialLineItems: true,
  showMaterialName: true,
  showMaterialDescription: true,
  customerViewFormat: "email",
  emailSubjectTemplate: "Invoice {{invoiceNumber}} due from {{companyName}} - {{invoiceTotal}}",
  emailBodyTemplate: "Hi {{customerFirstName}},\n\nThank you for choosing {{companyName}}. Please see attached invoice due {{invoiceDueTerms}}.",
  smsTemplate: "Invoice #{{invoiceNumber}} {{invoiceTotal}}: {{paymentUrl}}",
  reminderSubjectTemplate: "Reminder: Invoice {{invoiceNumber}} is due from {{companyName}} - {{invoiceTotal}}",
  reminderBodyTemplate: "Hi {{customerFirstName}},\n\nThis is a friendly reminder from {{companyName}} that invoice {{invoiceNumber}} for {{invoiceTotal}} is due. Please see the attached invoice to review and pay."
};

const messagingTemplateLabels: Record<MessagingTemplateKey, string> = {
  appointmentScheduled: "Appointment scheduled",
  onMyWay: "On my way",
  workStarted: "Work started",
  jobCompleted: "Job completed",
  invoiceSent: "Invoice sent",
  paymentReceived: "Payment received"
};

const defaultMessagingSettings: MessagingSettings = {
  smsEnabled: false,
  username: "",
  apiPassword: "",
  defaultDid: "",
  areaCode: "",
  availableDids: [],
  autoSend: {
    appointmentScheduled: true,
    onMyWay: true,
    workStarted: true,
    jobCompleted: true,
    invoiceSent: true,
    paymentReceived: true
  },
  templates: {
    appointmentScheduled: "Hi {{customerFirstName}}, your appointment with {{companyName}} is scheduled for {{scheduledWindow}}. Reply STOP to opt out.",
    onMyWay: "Hi {{customerFirstName}}, {{technicianName}} is on the way for job #{{jobNumber}} with {{companyName}}.",
    workStarted: "Hi {{customerFirstName}}, work has started on job #{{jobNumber}}.",
    jobCompleted: "Hi {{customerFirstName}}, job #{{jobNumber}} has been completed. Thank you for choosing {{companyName}}.",
    invoiceSent: "Invoice #{{invoiceNumber}} {{invoiceTotal}}: {{paymentUrl}}",
    paymentReceived: "Hi {{customerFirstName}}, payment of {{paymentAmount}} was received. Thank you for choosing {{companyName}}."
  },
  reviewEmail: {
    enabled: true,
    subject: "How was your service with {{companyName}}?",
    body: "Hi {{customerFirstName}}, thank you for choosing {{companyName}}. We would appreciate it if you could leave us a review."
  }
};

function mergeMessagingSettings(settings?: Partial<MessagingSettings>): MessagingSettings {
  return {
    ...defaultMessagingSettings,
    ...settings,
    availableDids: settings?.availableDids ?? defaultMessagingSettings.availableDids,
    autoSend: { ...defaultMessagingSettings.autoSend, ...(settings?.autoSend ?? {}) },
    templates: { ...defaultMessagingSettings.templates, ...(settings?.templates ?? {}) },
    reviewEmail: { ...defaultMessagingSettings.reviewEmail, ...(settings?.reviewEmail ?? {}) }
  };
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
  const [activeView, setActiveView] = useState<View>(() => typeof window === "undefined" ? "dispatch" : viewFromPath(window.location.pathname));
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [calendarMode, setCalendarMode] = useState<CalendarMode>("week");
  const [scheduleDate, setScheduleDate] = useState(() => new Date());
  const [slotPrompt, setSlotPrompt] = useState<SlotPrompt>(null);
  const [selectedScheduleJob, setSelectedScheduleJob] = useState<Job | null>(null);
  const [selectedScheduleEvent, setSelectedScheduleEvent] = useState<CalendarEvent | null>(null);
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventEditingId, setEventEditingId] = useState("");
  const [eventSearch, setEventSearch] = useState("");
  const [eventForm, setEventForm] = useState<EventForm>(() => blankEventForm());
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
    locationIds: [] as string[],
    allLocations: false,
    locationDisplayName: "",
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
  const [detailLeadFocused, setDetailLeadFocused] = useState(false);
  const [detailPrivateNote, setDetailPrivateNote] = useState("");
  const [detailSummary, setDetailSummary] = useState("");
  const [detailSavedMessage, setDetailSavedMessage] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [invoiceActionMessage, setInvoiceActionMessage] = useState("");
  const [invoiceSendDialogOpen, setInvoiceSendDialogOpen] = useState(false);
  const [invoiceSendMethod, setInvoiceSendMethod] = useState<"email" | "text" | "both">("email");
  const [invoiceSendTo, setInvoiceSendTo] = useState("");
  const [invoiceSendSubject, setInvoiceSendSubject] = useState("");
  const [invoiceSendMessage, setInvoiceSendMessage] = useState("");
  const [estimateActionMessage, setEstimateActionMessage] = useState("");
  const [estimateSendDialogOpen, setEstimateSendDialogOpen] = useState(false);
  const [estimateSendMethod, setEstimateSendMethod] = useState<"email" | "text" | "both">("email");
  const [estimateSendTo, setEstimateSendTo] = useState("");
  const [estimateSendSubject, setEstimateSendSubject] = useState("");
  const [estimateSendMessage, setEstimateSendMessage] = useState("");
  const [estimateDepositDraft, setEstimateDepositDraft] = useState({ type: "NONE" as "NONE" | "PERCENT" | "FIXED", percent: "50", amount: "" });
  const [paymentDialogInvoice, setPaymentDialogInvoice] = useState<Invoice | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"credit" | "cash" | "check" | "other">("credit");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReceiptEmail, setPaymentReceiptEmail] = useState("");
  const [paymentNotifyCustomer, setPaymentNotifyCustomer] = useState(true);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentBillingForm, setPaymentBillingForm] = useState({
    nameOnCard: "",
    street: "",
    city: "",
    state: "AZ",
    postalCode: ""
  });
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
  const [jobLineDialog, setJobLineDialog] = useState<JobLineDialogState | null>(null);
  const [jobLineForm, setJobLineForm] = useState({
    name: "",
    search: "",
    description: "",
    quantity: "1",
    unitPrice: "0.00",
    unitCost: "0.00",
    taxable: false
  });
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [appointmentMenuOpen, setAppointmentMenuOpen] = useState(false);
  const [appointmentForm, setAppointmentForm] = useState({
    scheduledStart: "",
    scheduledEnd: "",
    technicianId: ""
  });
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
  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>(defaultInvoiceSettings);
  const [invoiceSettingsMessage, setInvoiceSettingsMessage] = useState("");
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null);
  const [stripeMessage, setStripeMessage] = useState("");
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [selectedMessageThread, setSelectedMessageThread] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [messageAttachments, setMessageAttachments] = useState<MessageAttachment[]>([]);
  const [messageMode, setMessageMode] = useState<"customers" | "internal">("customers");
  const [internalMessages, setInternalMessages] = useState<CrmMessage[]>([]);
  const [internalDraft, setInternalDraft] = useState("");
  const [internalAttachments, setInternalAttachments] = useState<MessageAttachment[]>([]);
  const [internalAudience, setInternalAudience] = useState<"team" | "admin" | "direct">("team");
  const [internalRecipients, setInternalRecipients] = useState<InternalRecipient[]>([]);
  const [internalRecipientSearch, setInternalRecipientSearch] = useState("");
  const [internalRecipientId, setInternalRecipientId] = useState("");
  const [readMessageIds, setReadMessageIds] = useState<string[]>([]);
  const [messagingSettings, setMessagingSettings] = useState<MessagingSettings>(defaultMessagingSettings);
  const [messagingSettingsMessage, setMessagingSettingsMessage] = useState("");
  const [companySettingsForm, setCompanySettingsForm] = useState({
    companyName: "",
    displayName: "",
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
  const [dashboardDateRange, setDashboardDateRange] = useState("monthToDate");
  const [dashboardDate, setDashboardDate] = useState(() => toInputDate(new Date()));
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
  const [customerAddressForm, setCustomerAddressForm] = useState({ label: "Service", street1: "", street2: "", city: "", state: "CA", postalCode: "", latitude: "", longitude: "" });
  const [customerAttachmentName, setCustomerAttachmentName] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimatePageMode, setEstimatePageMode] = useState<"list" | "create">("list");
  const [selectedEstimateId, setSelectedEstimateId] = useState("");
  const [estimateSearch, setEstimateSearch] = useState("");
  const [estimateStatusFilter, setEstimateStatusFilter] = useState("all");
  const [signatureName, setSignatureName] = useState("");
  const [signatureHasInk, setSignatureHasInk] = useState(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signingRef = useRef(false);
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
    tags: "",
    depositType: "NONE" as "NONE" | "PERCENT" | "FIXED",
    depositPercent: "50",
    depositAmount: ""
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
  const [addressSuggestions, setAddressSuggestions] = useState<Record<string, AddressSuggestion[]>>({});
  const [addressLoadingKey, setAddressLoadingKey] = useState("");

  const scheduledJobs = useMemo(() => jobs.filter((job) => job.status !== "COMPLETED" && job.status !== "CANCELED"), [jobs]);
  const scheduledEvents = useMemo(() => events, [events]);
  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const selectedJobInvoice = selectedJob?.invoices?.[0] ?? null;
  const selectedEstimate = estimates.find((estimate) => estimate.id === selectedEstimateId) ?? null;
  useEffect(() => {
    if (!selectedEstimate) return;
    setEstimateDepositDraft({
      type: selectedEstimate.depositType ?? "NONE",
      percent: String(selectedEstimate.depositPercent ?? 50),
      amount: selectedEstimate.depositAmount ? (selectedEstimate.depositAmount / 100).toFixed(2) : ""
    });
    setEstimateActionMessage("");
  }, [selectedEstimate?.id, selectedEstimate?.depositType, selectedEstimate?.depositPercent, selectedEstimate?.depositAmount]);
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

  function clearAddressSuggestions(key: string) {
    setAddressSuggestions((current) => ({ ...current, [key]: [] }));
  }

  async function loadAddressSuggestions(key: string, input: string) {
    const trimmed = input.trim();
    if (trimmed.length < 3) {
      clearAddressSuggestions(key);
      return;
    }

    setAddressLoadingKey(key);
    try {
      const result = await api<{ suggestions: AddressSuggestion[] }>(`/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`);
      setAddressSuggestions((current) => ({ ...current, [key]: result.suggestions }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address lookup failed.");
    } finally {
      setAddressLoadingKey((current) => current === key ? "" : current);
    }
  }

  async function selectAddressSuggestion(key: string, placeId: string, apply: (place: PlaceAddress) => void) {
    setAddressLoadingKey(key);
    try {
      const result = await api<{ address: PlaceAddress }>(`/api/places/details?placeId=${encodeURIComponent(placeId)}`);
      apply(result.address);
      clearAddressSuggestions(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Address lookup failed.");
    } finally {
      setAddressLoadingKey((current) => current === key ? "" : current);
    }
  }

  function renderAddressAutocomplete(args: {
    lookupKey: string;
    value: string;
    placeholder: string;
    required?: boolean;
    className?: string;
    onChange: (value: string) => void;
    onSelect: (place: PlaceAddress) => void;
  }) {
    const suggestions = addressSuggestions[args.lookupKey] ?? [];
    return (
      <div className={`typeahead address-autocomplete ${args.className ?? ""}`}>
        <input
          className="address-autocomplete-input"
          placeholder={args.placeholder}
          value={args.value}
          required={args.required}
          onChange={(event) => {
            const next = event.target.value;
            args.onChange(next);
            void loadAddressSuggestions(args.lookupKey, next);
          }}
          onBlur={() => window.setTimeout(() => clearAddressSuggestions(args.lookupKey), 150)}
        />
        {suggestions.length > 0 ? (
          <div className="typeahead-results address-results">
            {suggestions.map((suggestion) => (
              <button
                type="button"
                key={suggestion.placeId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void selectAddressSuggestion(args.lookupKey, suggestion.placeId, args.onSelect)}
              >
                <strong>{suggestion.mainText ?? suggestion.description}</strong>
                <span>{suggestion.secondaryText ?? suggestion.description}</span>
              </button>
            ))}
          </div>
        ) : addressLoadingKey === args.lookupKey ? (
          <div className="typeahead-results address-results"><span className="typeahead-empty">Searching addresses...</span></div>
        ) : null}
      </div>
    );
  }

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
  const detailLeadSuggestions = useMemo(() => {
    const query = detailLeadSource.trim().toLowerCase();
    return crmOptions.leadSources
      .filter((source) => (!query || source.toLowerCase().includes(query)) && source !== detailLeadSource)
      .slice(0, 8);
  }, [crmOptions.leadSources, detailLeadSource]);
  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null;
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
  const filteredEstimates = useMemo(() => {
    const query = estimateSearch.trim().toLowerCase();
    return estimates.filter((estimate) => {
      const matchesStatus = estimateStatusFilter === "all" || estimate.status === estimateStatusFilter;
      const matchesQuery = !query || [
        String(estimate.estimateNumber),
        estimate.title,
        estimate.jobType,
        estimate.leadSource ?? "",
        ...(estimate.tags ?? []),
        customerName(estimate.customer),
        addressLine(estimate.address ?? estimate.customer.addresses?.[0])
      ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [estimateSearch, estimateStatusFilter, estimates]);
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
  const selectedCustomerEstimates = useMemo(() => {
    if (!selectedCustomer) return [];
    return estimates.filter((estimate) => estimate.customer.id === selectedCustomer.id);
  }, [estimates, selectedCustomer]);
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
  const estimateCounts = useMemo(() => ({
    draft: estimates.filter((estimate) => estimate.status === "DRAFT").length,
    sent: estimates.filter((estimate) => estimate.status === "SENT").length,
    approved: estimates.filter((estimate) => estimate.status === "APPROVED").length,
    declined: estimates.filter((estimate) => estimate.status === "DECLINED").length,
    converted: estimates.filter((estimate) => estimate.status === "CONVERTED").length
  }), [estimates]);
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
  function messageThreadKey(phone: string) {
    const digits = phone.replace(/\D/g, "");
    return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits || phone || "unknown";
  }

  const canUseAdminChannel = ["OWNER", "ADMIN"].includes(currentRole);
  const readMessageIdSet = useMemo(() => new globalThis.Set(readMessageIds), [readMessageIds]);

  const messageThreads = useMemo<MessageThread[]>(() => {
    const grouped = new globalThis.Map<string, MessageThread>();
    [...messages]
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .forEach((message) => {
        const customer = message.customer ?? customers.find((item) => item.id === message.customerId) ?? null;
        const phone = message.direction === "INBOUND" ? message.fromNumber : message.toNumber;
        const id = message.customerId ?? messageThreadKey(phone);
        const label = customer ? customerName(customer) : phone || "Unknown";
        const current = grouped.get(id) ?? { id, label, phone, customer, messages: [], latest: "", unread: 0 };
        current.messages.push(message);
        current.latest = message.createdAt;
        if (message.direction === "INBOUND" && !readMessageIdSet.has(message.id)) current.unread += 1;
        grouped.set(id, current);
      });
    return [...grouped.values()].sort((a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime());
  }, [messages, customers, readMessageIdSet]);
  const selectedThread = messageThreads.find((thread) => thread.id === selectedMessageThread) ?? messageThreads[0] ?? null;
  const customerUnreadTotal = messageThreads.reduce((sum, thread) => sum + thread.unread, 0);
  const selectedInternalRecipient = internalRecipients.find((recipient) => recipient.id === internalRecipientId) ?? null;
  const filteredInternalRecipients = useMemo(() => {
    const query = internalRecipientSearch.trim().toLowerCase();
    const sortedRecipients = [...internalRecipients].sort((a, b) => a.name.localeCompare(b.name));
    if (!query) return sortedRecipients.slice(0, 8);
    return sortedRecipients
      .filter((recipient) => [
        recipient.name,
        recipient.email ?? "",
        recipient.phone ?? "",
        recipient.role,
        recipient.kind
      ].some((value) => value.toLowerCase().includes(query)))
      .slice(0, 8);
  }, [internalRecipients, internalRecipientSearch]);
  const internalMessageChannel = internalAudience === "admin" ? "internal-admin" : internalAudience === "direct" ? "internal-direct" : "internal-team";
  const visibleInternalMessages = useMemo(() => internalMessages
    .filter((message) => {
      if (internalAudience === "direct") {
        return Boolean(internalRecipientId) && message.channel === "internal-direct" && (message.fromNumber === internalRecipientId || message.toNumber === internalRecipientId);
      }
      return message.channel === internalMessageChannel;
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [internalMessages, internalMessageChannel, internalAudience, internalRecipientId]);
  const messageReadStorageKey = activeLocationId ? `affordable-crm:read-messages:${activeLocationId}` : "";

  function locationDisplayName(location?: { name?: string; displayName?: string | null }) {
    return location?.displayName?.trim() || location?.name || "Location";
  }

  function clearSession(message = "") {
    clearToken();
    updateToken(null);
    setCurrentRole("");
    setLocations([]);
    setActiveLocationId("");
    if (message) setError(message);
  }

  function handleApiError(err: unknown, fallback = "Request failed") {
    if (err instanceof ApiError && err.status === 401) {
      clearSession("Your session expired. Please sign in again.");
      return;
    }
    setError(err instanceof Error ? err.message : fallback);
  }

  const reportItems = reports?.sections.flatMap((section) => section.items) ?? [];
  const selectedReport = reportItems.find((item) => item.id === selectedReportId) ?? reportItems[0];
  const activeCharts = reportDashboard === "leads"
    ? reports?.dashboards.leads ?? []
    : reports?.dashboards.businessOwner ?? [];
  const reportTitle = reportDashboard === "leads" ? "Leads" : reportDashboard === "jobs" ? "Jobs" : "Business Owner";
  const dashboardDateRangeLabel = dashboardDateRanges.find((item) => item.value === dashboardDateRange)?.label ?? "Month to date";
  const dashboardScheduledJobs = useMemo(() => [...scheduledJobs]
    .filter((job) => job.scheduledStart)
    .sort((a, b) => new Date(a.scheduledStart ?? "").getTime() - new Date(b.scheduledStart ?? "").getTime())
    .slice(0, 6), [scheduledJobs]);
  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLowerCase();
    if (!query) return events;
    return events.filter((calendarEvent) => [
      calendarEvent.name,
      calendarEvent.notes ?? "",
      calendarEvent.eventLocation ?? "",
      calendarEvent.technician?.name ?? ""
    ].some((value) => value.toLowerCase().includes(query)));
  }, [events, eventSearch]);
  const dispatchStops = useMemo(() => {
    const jobStops = scheduledJobs
      .filter((job) => job.scheduledStart)
      .map((job) => ({
        id: `job-${job.id}`,
        type: "job" as const,
        time: job.scheduledStart ?? "",
        title: `Job #${job.jobNumber} - ${customerName(job.customer)}`,
        detail: job.title || job.jobType,
        location: addressLine(job.address ?? job.customer.addresses?.[0]),
        technician: job.technician?.name ?? "Unassigned",
        onOpen: () => openJobDetail(job)
      }));
    const eventStops = scheduledEvents.map((calendarEvent) => ({
      id: `event-${calendarEvent.id}`,
      type: "event" as const,
      time: calendarEvent.scheduledStart,
      title: calendarEvent.name,
      detail: calendarEvent.notes || "Event",
      location: calendarEvent.eventLocation || "No location saved",
      technician: calendarEvent.technician?.name ?? "Unassigned",
      onOpen: () => setSelectedScheduleEvent(calendarEvent)
    }));
    return [...jobStops, ...eventStops].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [scheduledJobs, scheduledEvents]);
  const todaysDispatchStops = useMemo(() => dispatchStops.filter((stop) => sameCalendarDay(new Date(stop.time), new Date())), [dispatchStops]);
  const companyAddressPreview = [
    activeLocationAccess?.location.street1,
    activeLocationAccess?.location.city,
    activeLocationAccess?.location.state,
    activeLocationAccess?.location.postalCode
  ].filter(Boolean).join(", ") || "No company address saved yet";

  async function loadDashboard() {
    const dashboardQuery = new URLSearchParams({ dateRange: dashboardDateRange });
    if (dashboardDateRange === "selectedDay") dashboardQuery.set("date", dashboardDate);
    const [summaryResult, customersResult, jobsResult, eventsResult, estimatesResult, invoicesResult, techniciansResult, optionsResult, priceBookResult, templatesResult, servicePlanResult, invoiceSettingsResult, stripeStatusResult, messagesResult, internalMessagesResult, internalRecipientsResult, messagingSettingsResult] = await Promise.all([
      api<Summary>(`/api/settings/summary?${dashboardQuery.toString()}`),
      api<{ customers: Customer[] }>("/api/customers"),
      api<{ jobs: Job[] }>("/api/jobs"),
      api<{ events: CalendarEvent[] }>("/api/events"),
      api<{ estimates: Estimate[] }>("/api/estimates"),
      api<{ invoices: Invoice[] }>("/api/invoices"),
      api<{ technicians: Technician[] }>("/api/technicians"),
      api<CrmOptions>("/api/settings/options"),
      api<{ categories: PriceBookCategory[]; items: PriceBookItem[] }>("/api/pricebook"),
      api<{ templates: JobTemplate[] }>("/api/settings/job-templates"),
      api<{ templates: ServicePlanTemplate[]; summary: ServicePlanSummary }>("/api/service-plans"),
      api<{ settings: InvoiceSettings }>("/api/settings/invoice-settings"),
      api<StripeStatus>("/api/integrations/stripe/status"),
      api<{ messages: CrmMessage[] }>("/api/messages"),
      api<{ messages: CrmMessage[] }>("/api/messages/internal"),
      api<{ recipients: InternalRecipient[] }>("/api/messages/internal/recipients"),
      api<{ settings: MessagingSettings }>("/api/messages/settings")
    ]);

    setSummary(summaryResult);
    setCustomers(customersResult.customers);
    setJobs(jobsResult.jobs);
    setEvents(eventsResult.events);
    setEstimates(estimatesResult.estimates);
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
    setInvoiceSettings({ ...defaultInvoiceSettings, ...invoiceSettingsResult.settings });
    setStripeStatus(stripeStatusResult);
    setMessages(messagesResult.messages);
    setInternalMessages(internalMessagesResult.messages);
    setInternalRecipients(internalRecipientsResult.recipients);
    setInternalRecipientId((current) => current || internalRecipientsResult.recipients[0]?.id || "");
    setMessagingSettings(mergeMessagingSettings(messagingSettingsResult.settings));

    const [locationResult, apiKeyResult, meResult] = await Promise.all([
      api<{ activeLocationId: string; locations: LocationAccess[] }>("/api/locations"),
      api<{ apiKeys: ApiKey[] }>("/api/location-api-keys"),
      api<{ user: { memberships: Array<{ role: string; locationId: string | null }> }; activeLocationId: string }>("/api/auth/me")
    ]);
    setLocations(locationResult.locations);
    setActiveLocationId(locationResult.activeLocationId);
    setApiKeys(apiKeyResult.apiKeys);
    const activeMembership = meResult.user.memberships.find((item) => item.locationId === meResult.activeLocationId);
    const organizationWideMembership = meResult.user.memberships.find((item) => !item.locationId && ["OWNER", "ADMIN"].includes(item.role));
    setCurrentRole(activeMembership?.role ?? organizationWideMembership?.role ?? "");
  }

  async function loadReports() {
    const query = new URLSearchParams({ dateRange: reportDateRange, showBy: reportShowBy });
    const result = await api<ReportsPayload>(`/api/reports/jobs?${query.toString()}`);
    setReports(result);
  }

  function openDashboardReport(reportId: string, dashboard: "businessOwner" | "leads" | "jobs" = "businessOwner") {
    setSelectedReportId(reportId);
    setReportDashboard(dashboard);
    if (dashboardDateRange !== "selectedDay") setReportDateRange(dashboardDateRange);
    setActiveView("reports");
  }

  function openJobsFiltered(status: string) {
    setJobStatusFilter(status);
    setSelectedJobId("");
    setJobPageMode("list");
    setActiveView("jobs");
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextPath = activeView === "settings" && settingsSection === "stripe" ? "/settings/stripe" : viewPathMap[activeView];
    if (window.location.pathname !== nextPath) {
      window.history.pushState({ view: activeView }, "", nextPath);
    }
  }, [activeView, settingsSection]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/settings/stripe" || window.location.search.includes("stripe=")) {
      setSettingsSection("stripe");
      setActiveView("settings");
    }
    const handlePopState = () => {
      setActiveView(viewFromPath(window.location.pathname));
      if (window.location.pathname === "/settings/stripe" || window.location.search.includes("stripe=")) setSettingsSection("stripe");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!token) return;
    loadDashboard().catch((err: unknown) => handleApiError(err, "Unable to load dashboard"));
  }, [token, dashboardDateRange, dashboardDate]);

  useEffect(() => {
    if (!token || activeView !== "messages") return;
    const intervalId = window.setInterval(() => {
      Promise.all([
        api<{ messages: CrmMessage[] }>("/api/messages"),
        api<{ messages: CrmMessage[] }>("/api/messages/internal")
      ])
        .then(([customerResult, internalResult]) => {
          setMessages(customerResult.messages);
          setInternalMessages(internalResult.messages);
        })
        .catch((err: unknown) => handleApiError(err, "Unable to refresh messages"));
    }, 10000);
    return () => window.clearInterval(intervalId);
  }, [token, activeView]);

  useEffect(() => {
    if (!messageReadStorageKey || typeof window === "undefined") return;
    try {
      const parsed = JSON.parse(window.localStorage.getItem(messageReadStorageKey) ?? "[]");
      setReadMessageIds(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
    } catch {
      setReadMessageIds([]);
    }
  }, [messageReadStorageKey]);

  useEffect(() => {
    if (!messageReadStorageKey || typeof window === "undefined" || activeView !== "messages" || messageMode !== "customers" || !selectedThread) return;
    const inboundIds = selectedThread.messages.filter((message) => message.direction === "INBOUND").map((message) => message.id);
    if (!inboundIds.length) return;
    setReadMessageIds((current) => {
      const next = Array.from(new globalThis.Set([...current, ...inboundIds]));
      window.localStorage.setItem(messageReadStorageKey, JSON.stringify(next));
      return next;
    });
  }, [activeView, messageMode, messageReadStorageKey, selectedThread?.id, selectedThread?.latest]);

  useEffect(() => {
    if (canUseAdminChannel || internalAudience !== "admin") return;
    setInternalAudience("team");
  }, [canUseAdminChannel, internalAudience]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stripeResult = new URLSearchParams(window.location.search).get("stripe");
    if (stripeResult === "connected") setStripeMessage("Stripe is connected for this location.");
    if (stripeResult === "cancelled") setStripeMessage("Stripe connection was cancelled.");
    if (stripeResult && !["connected", "cancelled"].includes(stripeResult)) setError("Stripe connection could not be completed. Please try again.");
  }, []);

  useEffect(() => {
    if (!selectedJob) return;
    setDetailPrivateNote("");
    setDetailTagDraft("");
    setDetailSavedMessage("");
    setDetailLeadFocused(false);
  }, [selectedJob?.id]);

  useEffect(() => {
    if (!selectedJob) return;
    setDetailLeadSource(selectedJob.leadSource || "");
  }, [selectedJob?.id, selectedJob?.leadSource]);

  useEffect(() => {
    if (!selectedJob) return;
    setDetailSummary(selectedJob.description || "");
  }, [selectedJob?.id, selectedJob?.description]);

  useEffect(() => {
    setInvoiceActionMessage("");
  }, [selectedInvoiceId]);

  useEffect(() => {
    if (!token) return;
    if (!["OWNER", "ADMIN"].includes(currentRole)) {
      setReports(null);
      return;
    }
    loadReports().catch((err: unknown) => handleApiError(err, "Unable to load reports"));
  }, [token, currentRole, reportDateRange, reportShowBy]);

  useEffect(() => {
    if (!activeLocationAccess) return;
    setCompanySettingsForm({
      companyName: activeLocationAccess.organization.name || activeLocationAccess.location.name || "",
      displayName: activeLocationAccess.location.displayName ?? activeLocationAccess.location.name ?? "",
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
      locationIds: activeLocationId ? [activeLocationId] : [],
      allLocations: isOwner,
      locationDisplayName: "",
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
      locationIds: employee.locationAccess?.map((location) => location.id) ?? (activeLocationId ? [activeLocationId] : []),
      allLocations: Boolean(employee.allLocations),
      locationDisplayName: "",
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
      locationIds: employeeForm.allLocations ? undefined : employeeForm.locationIds,
      allLocations: employeeForm.allLocations,
      newLocation: employeeModal === "owner" && !employeeEditingId ? {
        name: employeeForm.locationName,
        displayName: employeeForm.locationDisplayName || undefined,
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
          postalCode: customerForm.postalCode,
          latitude: customerForm.latitude ? Number(customerForm.latitude) : undefined,
          longitude: customerForm.longitude ? Number(customerForm.longitude) : undefined
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
      body: JSON.stringify({
        ...customerAddressForm,
        latitude: customerAddressForm.latitude ? Number(customerAddressForm.latitude) : undefined,
        longitude: customerAddressForm.longitude ? Number(customerAddressForm.longitude) : undefined
      })
    });
    updateCustomerInState(result.customer);
    setCustomerAddressForm({ label: "Service", street1: "", street2: "", city: "", state: "CA", postalCode: "", latitude: "", longitude: "" });
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

  async function saveInvoiceSettings(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setInvoiceSettingsMessage("");
    const result = await api<{ settings: InvoiceSettings }>("/api/settings/invoice-settings", {
      method: "PATCH",
      body: JSON.stringify(invoiceSettings)
    });
    setInvoiceSettings({ ...defaultInvoiceSettings, ...result.settings });
    setInvoiceSettingsMessage("Invoice settings saved");
  }

  function updateInvoiceSetting<K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) {
    setInvoiceSettings((current) => ({ ...current, [key]: value }));
    setInvoiceSettingsMessage("");
  }

  async function refreshStripeStatus() {
    const result = await api<StripeStatus>("/api/integrations/stripe/status");
    setStripeStatus(result);
    return result;
  }

  async function connectStripe() {
    setError("");
    setStripeMessage("");
    const result = await api<{ url: string }>("/api/integrations/stripe/connect", { method: "POST" });
    window.location.assign(result.url);
  }

  async function disconnectStripe() {
    if (!window.confirm("Disconnect Stripe from this location? Existing payment records stay in the CRM, but new online payments will be disabled until Stripe is connected again.")) return;
    setError("");
    setStripeMessage("");
    await api("/api/integrations/stripe/disconnect", { method: "POST" });
    await refreshStripeStatus();
    setStripeMessage("Stripe disconnected for this location.");
  }

  function manageStripe() {
    window.open(stripeStatus?.dashboardUrl || "https://dashboard.stripe.com/", "_blank", "noopener,noreferrer");
  }

  function handleInvoiceLogoUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Invoice logo must be an image file.");
      return;
    }
    if (file.size > 2_000_000) {
      setError("Invoice logo must be 2MB or smaller.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setInvoiceSettings((current) => ({ ...current, logoName: file.name, logoDataUrl: reader.result as string }));
        setInvoiceSettingsMessage("");
      }
    };
    reader.onerror = () => setError("Unable to read invoice logo file.");
    reader.readAsDataURL(file);
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
          postalCode: jobClientForm.postalCode,
          latitude: jobClientForm.latitude ? Number(jobClientForm.latitude) : undefined,
          longitude: jobClientForm.longitude ? Number(jobClientForm.longitude) : undefined
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
            postalCode: jobClientForm.postalCode,
            latitude: jobClientForm.latitude ? Number(jobClientForm.latitude) : undefined,
            longitude: jobClientForm.longitude ? Number(jobClientForm.longitude) : undefined
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
      tags: "",
      depositType: "NONE",
      depositPercent: "50",
      depositAmount: ""
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

  async function createEstimate(event: FormEvent) {
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
          source: jobForm.leadSource || jobClientForm.source,
          tags: splitTags(jobClientForm.tags),
          notes: jobClientForm.notes,
          address: jobClientForm.street1 ? {
            label: "Service",
            street1: jobClientForm.street1,
            street2: jobClientForm.street2 || undefined,
            city: jobClientForm.city,
            state: jobClientForm.state,
            postalCode: jobClientForm.postalCode,
            latitude: jobClientForm.latitude ? Number(jobClientForm.latitude) : undefined,
            longitude: jobClientForm.longitude ? Number(jobClientForm.longitude) : undefined
          } : undefined
        })
      });
      customerId = customerResult.customer.id;
      addressId = customerResult.customer.addresses?.[0]?.id;
    }

    if (!customerId) {
      setError("Select an existing client or create a new client before creating the estimate.");
      return;
    }

    const result = await api<{ estimate: Estimate }>("/api/estimates", {
      method: "POST",
      body: JSON.stringify({
        customerId,
        addressId,
        technicianId: jobForm.technicianId || undefined,
        title: jobForm.title || jobForm.jobType,
        jobType: jobForm.jobType,
        leadSource: jobForm.leadSource,
        tags: splitTags(jobForm.tags),
        status: "DRAFT",
        workflowStatus: jobForm.scheduledStart ? "SCHEDULED" : "DRAFT",
        scheduledStart: jobForm.scheduledStart ? new Date(jobForm.scheduledStart).toISOString() : undefined,
        scheduledEnd: jobForm.scheduledEnd ? new Date(jobForm.scheduledEnd).toISOString() : undefined,
        description: jobForm.description,
        internalNotes: jobForm.internalNotes || undefined,
        depositType: jobForm.depositType,
        depositPercent: jobForm.depositType === "PERCENT" ? Number(jobForm.depositPercent || "50") : undefined,
        depositAmount: jobForm.depositType === "FIXED" ? dollarsToCents(jobForm.depositAmount) : undefined,
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
    setEstimates((current) => [result.estimate, ...current.filter((estimate) => estimate.id !== result.estimate.id)]);
    setSelectedEstimateId(result.estimate.id);
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
      tags: "",
      depositType: "NONE",
      depositPercent: "50",
      depositAmount: ""
    });
    setJobClientForm(blankCustomerForm());
    setCreateClientInline(false);
    setJobClientSearch("");
    setJobAddressSearch("");
    setTagDraft("");
    setJobTemplateId("");
    setJobLines([]);
    setJobAttachments([]);
    await loadDashboard();
    setEstimatePageMode("list");
  }

  function signaturePoint(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function beginSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    signingRef.current = true;
    context.lineWidth = 3;
    context.lineCap = "round";
    context.strokeStyle = "#101421";
    context.beginPath();
    context.moveTo(point.x, point.y);
    canvas.setPointerCapture(event.pointerId);
  }

  function drawSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!signingRef.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const point = signaturePoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
    setSignatureHasInk(true);
  }

  function endSignature(event: ReactPointerEvent<HTMLCanvasElement>) {
    signingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already be released by the browser.
    }
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureHasInk(false);
  }

  async function updateEstimate(estimate: Estimate, payload: Partial<Estimate> & { lineItems?: Estimate["lineItems"] }) {
    setError("");
    const result = await api<{ estimate: Estimate }>(`/api/estimates/${estimate.id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
    setEstimates((current) => current.map((item) => item.id === result.estimate.id ? result.estimate : item));
    setSelectedEstimateId(result.estimate.id);
    return result.estimate;
  }

  async function saveEstimateDepositTerms(estimate: Estimate) {
    const payload = {
      depositType: estimateDepositDraft.type,
      depositPercent: estimateDepositDraft.type === "PERCENT" ? Number(estimateDepositDraft.percent || "50") : undefined,
      depositAmount: estimateDepositDraft.type === "FIXED" ? dollarsToCents(estimateDepositDraft.amount) : undefined
    };
    const updated = await updateEstimate(estimate, payload);
    setEstimateActionMessage(`Estimate #${updated.estimateNumber} deposit terms saved.`);
  }

  async function updateEstimateWorkflow(estimate: Estimate, workflowStatus: Estimate["workflowStatus"]) {
    const updated = await updateEstimate(estimate, { workflowStatus });
    setEstimateActionMessage(`Estimate #${updated.estimateNumber} marked ${estimateWorkflowLabel(workflowStatus).toLowerCase()}.`);
  }

  async function addEstimateOption(estimate: Estimate) {
    const title = window.prompt("Option name", `Option #${(estimate.options?.length ?? 0) + 1}`);
    if (!title?.trim()) return;
    const description = window.prompt("Short option description", "Describe what makes this option different.") || undefined;
    const result = await api<{ estimate: Estimate }>(`/api/estimates/${estimate.id}/options`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), description })
    });
    setEstimates((current) => current.map((item) => item.id === result.estimate.id ? result.estimate : item));
    setEstimateActionMessage(`Added ${title.trim()} to estimate #${estimate.estimateNumber}.`);
  }

  async function approveEstimate(estimate: Estimate) {
    const signature = signatureCanvasRef.current?.toDataURL("image/png");
    if (!estimate.approvalSignature && !signatureHasInk) {
      setError("Capture the customer signature before approving the estimate.");
      return;
    }
    await updateEstimate(estimate, {
      status: "APPROVED",
      approvalSignature: estimate.approvalSignature || signature,
      approvalName: signatureName || customerName(estimate.customer)
    });
    setSignatureName("");
    clearSignature();
  }

  async function declineEstimate(estimate: Estimate) {
    await updateEstimate(estimate, { status: "DECLINED" });
  }

  async function convertEstimateToJob(estimate: Estimate) {
    setError("");
    const result = await api<{ estimate: Estimate; job: Job }>(`/api/estimates/${estimate.id}/convert-to-job`, { method: "POST" });
    setEstimates((current) => current.map((item) => item.id === result.estimate.id ? result.estimate : item));
    setJobs((current) => [result.job, ...current.filter((job) => job.id !== result.job.id)]);
    openJobDetail(result.job);
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

  async function deleteInvoice(invoice: Invoice) {
    if (!window.confirm(`Delete invoice #${invoice.invoiceNumber}? This cannot be undone.`)) return;
    setError("");
    await api(`/api/invoices/${invoice.id}`, { method: "DELETE" });
    setInvoices((current) => current.filter((item) => item.id !== invoice.id));
    setJobs((current) => current.map((job) => ({
      ...job,
      ...(job.invoices ? { invoices: job.invoices.filter((item) => item.id !== invoice.id) } : {})
    })));
    if (selectedInvoiceId === invoice.id) setSelectedInvoiceId("");
    await loadDashboard();
  }

  function mergeJob(job: Job) {
    setJobs((current) => current.map((item) => item.id === job.id ? { ...item, ...job } : item));
    if (job.invoices?.length) {
      setInvoices((current) => {
        const updatedInvoices = job.invoices ?? [];
        const updatedIds = new Set(updatedInvoices.map((invoice) => invoice.id));
        return [...updatedInvoices, ...current.filter((invoice) => !updatedIds.has(invoice.id))];
      });
    }
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

  async function updateJobDetails(
    job: Job,
    payload: Partial<Pick<Job, "tags" | "leadSource" | "description" | "internalNotes" | "scheduledStart" | "scheduledEnd">> & { technicianId?: string | null }
  ) {
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
    setDetailLeadFocused(false);
  }

  async function selectJobDetailLeadSource(job: Job, source: string) {
    setDetailLeadSource(source);
    setDetailLeadFocused(false);
    await saveJobOption("leadSource", source);
    await updateJobDetails(job, { leadSource: source });
    setDetailSavedMessage(`Lead source saved as ${source}`);
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
      body: JSON.stringify({ author: currentRole ? statusLabel(currentRole) : "Office", content })
    });
    await loadDashboard();
    setDetailPrivateNote("");
    setDetailSavedMessage("Private note added");
  }

  function openJobLineDialog(category: "service" | "material", item?: JobLineItem) {
    setError("");
    setJobLineDialog({ mode: item ? "edit" : "add", category, itemId: item?.id });
    setJobLineForm({
      name: item?.name ?? "",
      search: item?.name ?? "",
      description: item?.description ?? "",
      quantity: String(item?.quantity ?? "1"),
      unitPrice: centsToDollarInput(item?.unitPrice ?? 0),
      unitCost: centsToDollarInput(item?.unitCost ?? 0),
      taxable: category === "material" && item?.taxable !== false
    });
  }

  function chooseJobPriceBookItem(item: PriceBookItem) {
    setJobLineForm((current) => ({
      ...current,
      name: item.name,
      search: item.name,
      description: item.description ?? "",
      unitPrice: centsToDollarInput(item.price),
      unitCost: centsToDollarInput(item.cost),
      taxable: item.itemType === "material" && item.taxable
    }));
    setJobLineDialog((current) => current ? { ...current, category: item.itemType } : current);
  }

  async function saveJobLineItem(job: Job) {
    if (!jobLineDialog) return;
    const name = jobLineForm.name.trim() || jobLineForm.search.trim();
    if (!name) {
      setError("Enter a line item name before saving.");
      return;
    }
    const payload = {
      category: jobLineDialog.category,
      name,
      description: jobLineForm.description.trim() || undefined,
      quantity: Number(jobLineForm.quantity || "1"),
      unitPrice: dollarsToCents(jobLineForm.unitPrice),
      unitCost: dollarsToCents(jobLineForm.unitCost),
      taxable: jobLineDialog.category === "material" && jobLineForm.taxable
    };
    const endpoint = jobLineDialog.mode === "edit" && jobLineDialog.itemId
      ? `/api/jobs/${job.id}/line-items/${jobLineDialog.itemId}`
      : `/api/jobs/${job.id}/line-items`;
    const result = await api<{ job: Job }>(endpoint, {
      method: jobLineDialog.mode === "edit" ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    mergeJob(result.job);
    setSelectedJobId(job.id);
    setJobLineDialog(null);
    setDetailSavedMessage(jobLineDialog.mode === "edit" ? "Line item updated" : "Line item added");
    await loadDashboard();
  }

  async function deleteJobLineItem(job: Job, item: JobLineItem) {
    const confirmed = window.confirm(`Delete ${item.name} from this job?`);
    if (!confirmed) return;
    const result = await api<{ job: Job }>(`/api/jobs/${job.id}/line-items/${item.id}`, { method: "DELETE" });
    mergeJob(result.job);
    setSelectedJobId(job.id);
    setDetailSavedMessage("Line item deleted");
    await loadDashboard();
  }

  async function assignJobTechnician(job: Job, technicianId: string) {
    await updateJobDetails(job, { technicianId: technicianId || null });
    const technicianName = technicians.find((technician) => technician.id === technicianId)?.name ?? "Unassigned";
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "System", content: `Assigned to ${technicianName}.` })
    });
    await loadDashboard();
    setDetailSavedMessage(`Assigned to ${technicianName}`);
  }

  function openAppointmentEditor(job: Job) {
    const start = job.scheduledStart ? new Date(job.scheduledStart) : new Date();
    if (!job.scheduledStart) start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = job.scheduledEnd ? new Date(job.scheduledEnd) : new Date(start.getTime() + 60 * 60 * 1000);
    setAppointmentForm({
      scheduledStart: toDateTimeLocal(start),
      scheduledEnd: toDateTimeLocal(end),
      technicianId: job.technician?.id ?? ""
    });
    setAppointmentDialogOpen(true);
    setAppointmentMenuOpen(false);
    setError("");
  }

  async function saveAppointment(job: Job) {
    if (!appointmentForm.scheduledStart) {
      setError("Choose an appointment start time.");
      return;
    }
    const startDate = new Date(appointmentForm.scheduledStart);
    const endDate = appointmentForm.scheduledEnd
      ? new Date(appointmentForm.scheduledEnd)
      : new Date(startDate.getTime() + 60 * 60 * 1000);
    if (endDate <= startDate) {
      setError("Appointment end time must be after the start time.");
      return;
    }
    await updateJobDetails(job, {
      scheduledStart: startDate.toISOString(),
      scheduledEnd: endDate.toISOString(),
      technicianId: appointmentForm.technicianId || null
    });
    const technicianName = technicians.find((technician) => technician.id === appointmentForm.technicianId)?.name ?? "Unassigned";
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "System", content: `Appointment updated for ${formatDateTime(startDate.toISOString())}; assigned to ${technicianName}.` })
    });
    await loadDashboard();
    setAppointmentDialogOpen(false);
    setDetailSavedMessage("Appointment updated");
  }

  async function deleteAppointment(job: Job) {
    const confirmed = window.confirm("Delete this appointment from the job?");
    if (!confirmed) return;
    const result = await api<{ job: Job }>(`/api/jobs/${job.id}`, {
      method: "PATCH",
      body: JSON.stringify({ scheduledStart: null, scheduledEnd: null, technicianId: null })
    });
    mergeJob(result.job);
    setSelectedJobId(job.id);
    setAppointmentMenuOpen(false);
    await api(`/api/jobs/${job.id}/notes`, {
      method: "POST",
      body: JSON.stringify({ author: "System", content: "Appointment deleted." })
    });
    await loadDashboard();
    setDetailSavedMessage("Appointment deleted");
  }

  async function sendAppointmentOmw(job: Job) {
    setAppointmentMenuOpen(false);
    await updateJobStatus(job, "DISPATCHED");
    setDetailSavedMessage("On my way logged");
  }

  function addAppointmentForJob(job: Job) {
    const start = job.scheduledEnd ? new Date(job.scheduledEnd) : new Date();
    if (!job.scheduledEnd) start.setHours(start.getHours() + 1, 0, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setAppointmentForm({
      scheduledStart: toDateTimeLocal(start),
      scheduledEnd: toDateTimeLocal(end),
      technicianId: job.technician?.id ?? ""
    });
    setAppointmentDialogOpen(true);
    setAppointmentMenuOpen(false);
    setError("");
  }

  async function createInvoiceFromJob(job: Job) {
    const existingInvoice = job.invoices?.[0];
    if (existingInvoice) {
      setDetailSavedMessage(`Invoice #${existingInvoice.invoiceNumber} opened`);
      return existingInvoice;
    }
    const fallbackLineItem: NonNullable<Job["lineItems"]>[number] = {
      id: "fallback",
      category: "service",
      name: job.title || job.jobType || "Job service",
      quantity: "1",
      unitPrice: 0,
      taxable: false
    };
    const lineItems: NonNullable<Job["lineItems"]> = job.lineItems?.length ? job.lineItems : [fallbackLineItem];
    const result = await api<{ invoice: Invoice; reused?: boolean }>("/api/invoices", {
      method: "POST",
      body: JSON.stringify({
        customerId: job.customer.id,
        jobId: job.id,
        status: "DRAFT",
        tax: calculateJobLineTax(job),
        items: lineItems.map((item) => ({
          category: item.category,
          name: item.name,
          description: item.name,
          quantity: Number(item.quantity || "1"),
          unitPrice: item.unitPrice,
          taxable: item.category === "material" && item.taxable !== false
        }))
      })
    });
    setInvoices((current) => [result.invoice, ...current.filter((invoice) => invoice.id !== result.invoice.id)]);
    setJobs((current) => current.map((item) => {
      if (item.id !== job.id) return item;
      const remainingInvoices = (item.invoices ?? []).filter((invoice) => invoice.id !== result.invoice.id);
      return { ...item, invoices: [result.invoice, ...remainingInvoices] };
    }));
    setSelectedJobId(job.id);
    await loadDashboard();
    setDetailSavedMessage(`Invoice #${result.invoice.invoiceNumber} ${result.reused ? "opened" : "created"}`);
    return result.invoice;
  }

  async function openJobInvoice(job: Job) {
    const invoice = await createInvoiceFromJob(job);
    if (!invoice) return;
    setSelectedInvoiceId(invoice.id);
    setActiveView("invoices");
  }

  async function openJobPayment(job: Job) {
    try {
      const invoice = await createInvoiceFromJob(job);
      if (!invoice) return;
      await openInvoicePayment(invoice);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open Stripe payment checkout");
    }
  }

  async function openInvoicePayment(invoice: Invoice) {
    const address = invoice.customer.addresses?.[0];
    setSelectedInvoiceId(invoice.id);
    setPaymentDialogInvoice(invoice);
    setPaymentAmount(centsToDollarInput(invoice.total));
    setPaymentReceiptEmail(invoice.customer.email || "");
    setPaymentMethod(invoiceSettings.acceptCreditCard ? "credit" : "cash");
    setPaymentNote("");
    setPaymentBillingForm({
      nameOnCard: customerName(invoice.customer),
      street: address?.street1 ?? "",
      city: address?.city ?? "",
      state: address?.state ?? "AZ",
      postalCode: address?.postalCode ?? ""
    });
  }

  async function confirmPayment() {
    if (!paymentDialogInvoice) return;
    const amount = currencyToCents(paymentAmount);
    if (amount <= 0) {
      setInvoiceActionMessage("Enter a payment amount greater than $0.00.");
      return;
    }
    try {
      setPaymentProcessing(true);
      setInvoiceActionMessage("");
      if (paymentMethod === "credit") {
        if (!invoiceSettings.acceptCreditCard) {
          setInvoiceActionMessage("Credit card payments are disabled in invoice settings for this location.");
          return;
        }
        const result = await api<{ url?: string }>(`/api/payments/invoices/${paymentDialogInvoice.id}/checkout-session`, { method: "POST" });
        if (result.url) {
          const opened = window.open(result.url, "_blank", "noopener,noreferrer");
          if (!opened) window.location.assign(result.url);
          setPaymentDialogInvoice(null);
          setInvoiceActionMessage("Stripe checkout opened in a secure payment window.");
          return;
        }
        setInvoiceActionMessage("Stripe did not return a checkout URL.");
        return;
      }

      const result = await api<{ payment: PaymentRecord; invoice: Invoice }>(`/api/payments/invoices/${paymentDialogInvoice.id}/manual`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          method: paymentMethod,
          note: paymentNote,
          notifyCustomer: paymentNotifyCustomer
        })
      });
      setInvoices((current) => current.map((invoice) => invoice.id === result.invoice.id ? result.invoice : invoice));
      setJobs((current) => current.map((job) => job.id === result.invoice.job?.id
        ? { ...job, invoices: [result.invoice, ...(job.invoices ?? []).filter((invoice) => invoice.id !== result.invoice.id)] }
        : job));
      setPaymentDialogInvoice(null);
      setInvoiceActionMessage(`${statusLabel(paymentMethod.toUpperCase())} payment recorded for invoice #${result.invoice.invoiceNumber}.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to record payment");
    } finally {
      setPaymentProcessing(false);
    }
  }

  function invoiceLineItems(invoice: Invoice) {
    if (invoice.items?.length) return invoice.items;
    return (invoice.job?.lineItems ?? []).map((item) => ({
      id: item.id,
      category: item.category,
      name: item.name,
      description: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxable: item.taxable
    }));
  }

  function renderInvoiceLogo() {
    if (invoiceSettings.logoDataUrl) {
      return <img className="invoice-logo-image" src={invoiceSettings.logoDataUrl} alt={`${activeLocationAccess?.organization.name || "Company"} logo`} />;
    }
    return <div className="invoice-logo">Affordable<br /><span>Security</span></div>;
  }

  function invoiceCustomerAddress(customer: Customer) {
    const primaryAddress = customer.addresses?.[0];
    if (!primaryAddress) return "";
    return [primaryAddress.street1, primaryAddress.street2, primaryAddress.city, primaryAddress.state, primaryAddress.postalCode].filter(Boolean).join(", ");
  }

  function invoiceRecipient(invoice: Invoice, method: "email" | "text" | "both") {
    const email = invoice.customer.email ?? "";
    const textNumber = invoice.customer.phone ?? invoice.customer.alternatePhone ?? "";
    if (method === "email") return email;
    if (method === "text") return textNumber;
    return [email, textNumber].filter(Boolean).join(", ");
  }

  function invoiceDefaultSubject(invoice: Invoice) {
    const companyName = activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security";
    return renderInvoiceTemplate(invoiceSettings.emailSubjectTemplate, invoice, companyName);
  }

  function invoiceDefaultMessage(invoice: Invoice) {
    const companyName = activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security";
    return renderInvoiceTemplate(invoiceSettings.emailBodyTemplate, invoice, companyName);
  }

  function renderInvoiceTemplate(template: string, invoice: Invoice, companyName: string) {
    const firstName = invoice.customer.firstName || customerName(invoice.customer).split(" ")[0] || "there";
    const dueTerms = invoiceSettings.defaultTermsType === "uponReceipt" ? "upon receipt" : `net ${invoiceSettings.defaultTermsDays}`;
    return [
      ["{{invoiceNumber}}", String(invoice.invoiceNumber)],
      ["{{companyName}}", companyName],
      ["{{invoiceTotal}}", money.format(invoice.total / 100)],
      ["{{customerFirstName}}", firstName],
      ["{{invoiceDueTerms}}", dueTerms],
      ["{{paymentUrl}}", "payment link"]
    ].reduce((text, [tokenValue, replacement]) => text.split(tokenValue).join(replacement), template);
  }

  function openInvoiceSendDialog(invoice: Invoice) {
    setInvoiceSendMethod("email");
    setInvoiceSendTo(invoiceRecipient(invoice, "email"));
    setInvoiceSendSubject(invoiceDefaultSubject(invoice));
    setInvoiceSendMessage(invoiceDefaultMessage(invoice));
    setInvoiceActionMessage("");
    setInvoiceSendDialogOpen(true);
  }

  function changeInvoiceSendMethod(method: "email" | "text" | "both") {
    setInvoiceSendMethod(method);
    if (selectedInvoice) {
      const companyName = activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security";
      setInvoiceSendTo(invoiceRecipient(selectedInvoice, method));
      setInvoiceSendMessage(method === "text" ? renderInvoiceTemplate(invoiceSettings.smsTemplate, selectedInvoice, companyName) : invoiceDefaultMessage(selectedInvoice));
    }
  }

  async function confirmInvoiceSend() {
    if (!selectedInvoice) return;
    setError("");
    setInvoiceActionMessage("");
    try {
      const result = await api<SendInvoiceResponse>(`/api/invoices/${selectedInvoice.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          method: invoiceSendMethod,
          to: invoiceSendTo.trim() || undefined,
          subject: invoiceSendSubject,
          message: invoiceSendMessage
        })
      });
      const deliveryMessages = result.deliveries.filter((item): item is CrmMessage => Boolean(item));
      setInvoices((current) => current.map((invoice) => invoice.id === result.invoice.id ? result.invoice : invoice));
      setMessages((current) => [
        ...deliveryMessages,
        ...current.filter((message) => !deliveryMessages.some((delivery) => delivery.id === message.id))
      ]);
      setSelectedInvoiceId(result.invoice.id);
      setInvoiceSendDialogOpen(false);
      const failedMessages = deliveryMessages.filter((message) => message.status === "FAILED");
      const failed = failedMessages.length;
      const failureDetail = failedMessages.map((message) => `${message.channel}: ${message.error || "delivery failed"}`).join("; ");
      setInvoiceActionMessage(failed
        ? `Invoice #${result.invoice.invoiceNumber} delivery created with ${failed} issue${failed === 1 ? "" : "s"}: ${failureDetail}`
        : result.paymentLinkWarning
          ? `Invoice #${result.invoice.invoiceNumber} delivery created, but Stripe link was not added: ${result.paymentLinkWarning}`
          : `Invoice #${result.invoice.invoiceNumber} delivery created with Stripe payment link.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send invoice.");
    }
  }

  function estimateRecipient(estimate: Estimate, method: "email" | "text" | "both") {
    if (method === "text") return estimate.customer.phone || "";
    if (method === "both") return [estimate.customer.email, estimate.customer.phone].filter(Boolean).join(", ");
    return estimate.customer.email || "";
  }

  function estimateDefaultSubject(estimate: Estimate) {
    return `Estimate #${estimate.estimateNumber} from ${activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security"}`;
  }

  function estimateDefaultMessage(estimate: Estimate, method: "email" | "text" | "both" = "email") {
    const total = money.format(estimateTotal(estimate) / 100);
    const url = `${window.location.origin}/estimate/${estimate.estimateNumber}`;
    if (method === "text") return `Estimate #${estimate.estimateNumber} ${total}: ${url}`;
    return `Hi ${estimate.customer.firstName || customerName(estimate.customer).split(" ")[0] || "there"},\n\nPlease review your estimate from ${activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security"}.\n\nView estimate: ${url}`;
  }

  function openEstimateSendDialog(estimate: Estimate) {
    setEstimateSendMethod("email");
    setEstimateSendTo(estimateRecipient(estimate, "email"));
    setEstimateSendSubject(estimateDefaultSubject(estimate));
    setEstimateSendMessage(estimateDefaultMessage(estimate));
    setEstimateActionMessage("");
    setEstimateSendDialogOpen(true);
  }

  function changeEstimateSendMethod(method: "email" | "text" | "both") {
    setEstimateSendMethod(method);
    if (!selectedEstimate) return;
    setEstimateSendTo(estimateRecipient(selectedEstimate, method));
    setEstimateSendMessage(estimateDefaultMessage(selectedEstimate, method));
  }

  async function confirmEstimateSend() {
    if (!selectedEstimate) return;
    setError("");
    setEstimateActionMessage("");
    try {
      const result = await api<SendEstimateResponse>(`/api/estimates/${selectedEstimate.id}/send`, {
        method: "POST",
        body: JSON.stringify({
          method: estimateSendMethod,
          to: estimateSendTo.trim() || undefined,
          subject: estimateSendSubject,
          message: estimateSendMessage
        })
      });
      const deliveryMessages = result.deliveries.filter((item): item is CrmMessage => Boolean(item));
      setEstimates((current) => current.map((estimate) => estimate.id === result.estimate.id ? result.estimate : estimate));
      setMessages((current) => [
        ...deliveryMessages,
        ...current.filter((message) => !deliveryMessages.some((delivery) => delivery.id === message.id))
      ]);
      setSelectedEstimateId(result.estimate.id);
      setEstimateSendDialogOpen(false);
      const failedMessages = deliveryMessages.filter((message) => message.status === "FAILED");
      const failed = failedMessages.length;
      const failureDetail = failedMessages.map((message) => `${message.channel}: ${message.error || "delivery failed"}`).join("; ");
      setEstimateActionMessage(failed
        ? `Estimate #${result.estimate.estimateNumber} delivery created with ${failed} issue${failed === 1 ? "" : "s"}: ${failureDetail}`
        : `Estimate #${result.estimate.estimateNumber} delivery created with customer link.`);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send estimate.");
    }
  }

  async function sendManualMessage(event: FormEvent) {
    event.preventDefault();
    const trimmedBody = messageDraft.trim();
    if (!selectedThread || (!trimmedBody && !messageAttachments.length)) return;
    setError("");
    try {
      const result = await api<{ message: CrmMessage }>("/api/messages/sms", {
        method: "POST",
        body: JSON.stringify({
          customerId: selectedThread.customer?.id,
          to: selectedThread.phone,
          body: trimmedBody || "Attachment",
          attachments: messageAttachments.map((attachment) => JSON.stringify(attachment))
        })
      });
      setMessages((current) => [result.message, ...current.filter((message) => message.id !== result.message.id)]);
      setMessageDraft("");
      setMessageAttachments([]);
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send text message.");
    }
  }

  async function sendInternalMessage(event: FormEvent) {
    event.preventDefault();
    const trimmedBody = internalDraft.trim();
    if (!trimmedBody && !internalAttachments.length) return;
    if (internalAudience === "direct" && !selectedInternalRecipient) {
      setError("Choose a person to message.");
      return;
    }
    setError("");
    try {
      const result = await api<{ message: CrmMessage }>("/api/messages/internal", {
        method: "POST",
        body: JSON.stringify({
          body: trimmedBody || "Attachment",
          audience: internalAudience,
          recipientUserId: internalAudience === "direct" ? selectedInternalRecipient?.id : undefined,
          attachments: internalAttachments.map((attachment) => JSON.stringify(attachment))
        })
      });
      setInternalMessages((current) => [result.message, ...current.filter((message) => message.id !== result.message.id)]);
      setInternalDraft("");
      setInternalAttachments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send in-house message.");
    }
  }

  function handleMessageComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function handleInternalComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  function parseMessageAttachment(value: string): MessageAttachment {
    try {
      const parsed = JSON.parse(value) as MessageAttachment;
      const dataUrl = parsed.dataUrl ?? parsed.url;
      if (parsed?.name || dataUrl) {
        return {
          ...parsed,
          name: parsed.name || (dataUrl ? dataUrl.split("/").filter(Boolean).pop() || "Attachment" : "Attachment"),
          dataUrl
        };
      }
    } catch {
      // Older messages may only have a saved filename.
    }
    if (/^https?:\/\//i.test(value)) {
      return { name: value.split("/").filter(Boolean).pop() || "Attachment", dataUrl: value };
    }
    return { name: value };
  }

  function isImageAttachment(attachment: MessageAttachment) {
    const type = attachment.type?.toLowerCase() ?? "";
    const url = attachment.dataUrl ?? attachment.url ?? "";
    const name = attachment.name ?? "";
    const imageSource = `${name} ${url}`;
    return Boolean(url && (
      type.startsWith("image/")
      || ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic", "heif"].includes(type)
      || /^data:image\//i.test(url)
      || /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)(?:[?#].*)?/i.test(imageSource)
    ));
  }

  function isVideoAttachment(attachment: MessageAttachment) {
    const type = attachment.type?.toLowerCase() ?? "";
    const url = attachment.dataUrl ?? attachment.url ?? "";
    const name = attachment.name ?? "";
    const source = `${name} ${url}`;
    return Boolean(url && (
      type.startsWith("video/")
      || ["mp4", "mov", "m4v", "webm"].includes(type)
      || /^data:video\//i.test(url)
      || /\.(mp4|mov|m4v|webm)(?:[?#].*)?/i.test(source)
    ));
  }

  function isPdfAttachment(attachment: MessageAttachment) {
    const type = attachment.type?.toLowerCase() ?? "";
    const url = attachment.dataUrl ?? attachment.url ?? "";
    const name = attachment.name ?? "";
    return Boolean(
      type === "application/pdf"
      || type === "pdf"
      || /^data:application\/pdf/i.test(url)
      || /\.pdf(?:[?#].*)?/i.test(name)
    );
  }

  function messageAttachmentUrl(attachment: MessageAttachment, messageId?: string, index?: number) {
    const url = attachment.dataUrl ?? attachment.url ?? "";
    if (!url) return "";
    if (messageId && typeof index === "number") {
      return `/api/webhooks/voipms/media/${encodeURIComponent(messageId)}/${index}`;
    }
    return url;
  }

  function renderMessageAttachment(value: string, messageId?: string, index?: number) {
    const parsedAttachment = parseMessageAttachment(value);
    const attachmentUrl = messageAttachmentUrl(parsedAttachment, messageId, index);
    const imageAttachment = isImageAttachment(parsedAttachment);
    const videoAttachment = isVideoAttachment(parsedAttachment);
    const pdfAttachment = isPdfAttachment(parsedAttachment);
    const mediaAttachment = imageAttachment || videoAttachment || pdfAttachment;
    const attachmentKey = `${messageId ?? "attachment"}-${index ?? value}`;
    if (!attachmentUrl) {
      return <span key={attachmentKey}><Paperclip size={13} /> {parsedAttachment.name}</span>;
    }

    return (
      <a
        key={attachmentKey}
        className={mediaAttachment ? "message-attachment-media" : undefined}
        href={attachmentUrl}
        target="_blank"
        rel="noreferrer"
        download={parsedAttachment.name}
      >
        {imageAttachment && <img src={attachmentUrl} alt={parsedAttachment.name} loading="lazy" />}
        {videoAttachment && <video src={attachmentUrl} controls preload="metadata" />}
        {pdfAttachment && <span className="message-attachment-file">PDF</span>}
        <span className="message-attachment-name"><Paperclip size={13} /> {parsedAttachment.name}</span>
      </a>
    );
  }

  function fileExtension(name: string) {
    const match = name.toLowerCase().match(/\.[^.]+$/);
    return match?.[0] ?? "";
  }

  function fileMimeType(file: File) {
    const explicitType = file.type.toLowerCase();
    if (explicitType) return explicitType;
    return customerMmsTypes[fileExtension(file.name)] ?? "";
  }

  function replaceFileExtension(name: string, extension: string) {
    return name.includes(".") ? name.replace(/\.[^.]+$/, extension) : `${name}${extension}`;
  }

  function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      reader.readAsDataURL(file);
    });
  }

  function loadAttachmentImage(dataUrl: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Unable to prepare that image for MMS."));
      image.src = dataUrl;
    });
  }

  function estimateDataUrlBytes(dataUrl: string) {
    const base64 = dataUrl.split(",")[1] ?? "";
    return Math.ceil(base64.length * 0.75);
  }

  function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Unable to prepare that image for MMS."));
      }, type, quality);
    });
  }

  function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(new Error("Unable to prepare that image for MMS."));
      reader.readAsDataURL(blob);
    });
  }

  async function compressImageForMms(file: File, dataUrl: string, mimeType: string): Promise<MessageAttachment> {
    if (mimeType === "image/gif") {
      if (file.size > customerMmsMaxBytes) {
        throw new Error(`${file.name} is too large for MMS. Animated GIFs cannot be compressed without losing animation.`);
      }
      return { name: file.name, type: mimeType, size: file.size, dataUrl };
    }

    let image: HTMLImageElement;
    try {
      image = await loadAttachmentImage(dataUrl);
    } catch {
      throw new Error(`${file.name} could not be converted for MMS. If this is an iPhone HEIC or Live Photo file, send it as a regular JPEG/photo or choose a smaller compatible file.`);
    }

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error("Unable to prepare that image for MMS.");

    const maxSides = [1800, 1600, 1400, 1200, 1000, 800];
    const qualities = [0.86, 0.76, 0.66, 0.56, 0.46];
    let best: { blob: Blob; dataUrl: string } | null = null;

    for (const maxSide of maxSides) {
      const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
      const width = Math.max(1, Math.round(sourceWidth * scale));
      const height = Math.max(1, Math.round(sourceHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Unable to prepare that image for MMS.");
      context.drawImage(image, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, "image/jpeg", quality);
        const compressedDataUrl = await blobToDataUrl(blob);
        best = { blob, dataUrl: compressedDataUrl };
        if (blob.size <= customerMmsMaxBytes) {
          return {
            name: replaceFileExtension(file.name, ".jpg"),
            type: "image/jpeg",
            size: blob.size,
            dataUrl: compressedDataUrl
          };
        }
      }
    }

    throw new Error(`${file.name} is too large for MMS after compression${best ? ` (${Math.ceil(best.blob.size / 1_000)}KB)` : ""}. Try a smaller image.`);
  }

  async function readCustomerMmsAttachment(file: File): Promise<MessageAttachment> {
    const mimeType = fileMimeType(file);
    const extension = fileExtension(file.name);
    const supportedType = customerMmsTypes[extension];
    const isImage = mimeType.startsWith("image/") || Boolean(customerMmsImageTypes[extension]);
    const isVideo = mimeType.startsWith("video/") || Boolean(customerMmsVideoTypes[extension]);
    const isDocument = mimeType === "application/pdf" || Boolean(customerMmsDocumentTypes[extension]);
    if (!supportedType && !isImage && !isVideo && !isDocument) {
      throw new Error("Customer MMS supports photos, small video clips, and PDFs.");
    }

    const dataUrl = await readFileAsDataUrl(file);
    if (isImage && (file.size > customerMmsMaxBytes || mimeType === "image/webp" || mimeType === "image/heic" || mimeType === "image/heif")) {
      return compressImageForMms(file, dataUrl, mimeType);
    }
    const dataUrlSize = estimateDataUrlBytes(dataUrl);
    if ((isVideo || isDocument) && file.size > customerMmsMaxBytes) {
      throw new Error(`${file.name} is too large for MMS. Photos can be compressed automatically, but PDFs and videos must be 1.3MB or smaller.`);
    }
    if (dataUrlSize > customerMmsMaxBytes && !isImage) {
      throw new Error(`${file.name} is too large for MMS.`);
    }

    return { name: file.name, type: mimeType || file.type || supportedType, size: file.size, dataUrl };
  }

  async function addMessageAttachments(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const slotsAvailable = Math.max(0, customerMmsMaxFiles - messageAttachments.length);
    if (!slotsAvailable) {
      setError(`VoIP.ms MMS can send up to ${customerMmsMaxFiles} attachments at a time.`);
      return;
    }
    const acceptedFiles = selectedFiles.slice(0, slotsAvailable);
    const loaded = await Promise.all(acceptedFiles.map(readCustomerMmsAttachment)).catch((error: Error) => {
      setError(error.message);
      return null;
    });
    if (!loaded) return;
    const convertedOversized = loaded.find((file) => (file.size ?? 0) > customerMmsMaxBytes);
    if (convertedOversized) {
      setError(`${convertedOversized.name} is too large after MMS preparation. Please use an image under 1.3MB.`);
      return;
    }
    setMessageAttachments((current) => [...current, ...loaded].slice(0, customerMmsMaxFiles));
  }

  function removeMessageAttachment(name: string) {
    setMessageAttachments((current) => current.filter((item) => item.name !== name));
  }

  async function addInternalAttachments(files: FileList | null) {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const acceptedFiles = selectedFiles.slice(0, Math.max(0, 5 - internalAttachments.length));
    const oversized = acceptedFiles.find((file) => file.size > 2_000_000);
    if (oversized) {
      setError("In-house message attachments must be 2MB or smaller.");
      return;
    }
    const loaded = await Promise.all(acceptedFiles.map((file) => new Promise<MessageAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        type: file.type,
        size: file.size,
        dataUrl: typeof reader.result === "string" ? reader.result : undefined
      });
      reader.onerror = () => reject(new Error(`Unable to read ${file.name}.`));
      reader.readAsDataURL(file);
    })));
    setInternalAttachments((current) => [...current, ...loaded].slice(0, 5));
  }

  function removeInternalAttachment(name: string) {
    setInternalAttachments((current) => current.filter((item) => item.name !== name));
  }

  function updateMessagingTemplate(key: MessagingTemplateKey, value: string) {
    setMessagingSettings((current) => ({
      ...current,
      templates: { ...current.templates, [key]: value }
    }));
  }

  function updateMessagingAutoSend(key: MessagingTemplateKey, value: boolean) {
    setMessagingSettings((current) => ({
      ...current,
      autoSend: { ...current.autoSend, [key]: value }
    }));
  }

  async function saveMessagingSettings(event?: FormEvent) {
    event?.preventDefault();
    setError("");
    setMessagingSettingsMessage("");
    try {
      const result = await api<{ settings: MessagingSettings }>("/api/messages/settings", {
        method: "PATCH",
        body: JSON.stringify({
          ...messagingSettings,
          availableDids: messagingSettings.availableDids.map((did) => did.trim()).filter(Boolean)
        })
      });
      setMessagingSettings(mergeMessagingSettings(result.settings));
      setMessagingSettingsMessage("Messaging settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save messaging settings.");
    }
  }

  function openJobFromSlot(slot: { date: Date; hour: number; minute: number; technicianId?: string }) {
    const start = new Date(slot.date);
    start.setHours(slot.hour, slot.minute, 0, 0);
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    setJobForm((current) => ({
      ...current,
      technicianId: slot.technicianId ?? current.technicianId,
      scheduledStart: toDateTimeLocal(start),
      scheduledEnd: toDateTimeLocal(end)
    }));
    setSlotPrompt(null);
    setJobPageMode("create");
    setActiveView("jobs");
  }

  function mergeEventRecord(calendarEvent: CalendarEvent) {
    setEvents((current) => [calendarEvent, ...current.filter((item) => item.id !== calendarEvent.id)]
      .sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()));
    if (selectedScheduleEvent?.id === calendarEvent.id) setSelectedScheduleEvent(calendarEvent);
  }

  function openEventEditor(calendarEvent?: CalendarEvent, slot?: { date: Date; hour: number; minute: number; technicianId?: string }) {
    if (calendarEvent) {
      setEventEditingId(calendarEvent.id);
      setEventForm({
        name: calendarEvent.name,
        notes: calendarEvent.notes ?? "",
        eventLocation: calendarEvent.eventLocation ?? "",
        latitude: calendarEvent.latitude === undefined || calendarEvent.latitude === null ? "" : String(calendarEvent.latitude),
        longitude: calendarEvent.longitude === undefined || calendarEvent.longitude === null ? "" : String(calendarEvent.longitude),
        technicianId: calendarEvent.technicianId ?? calendarEvent.technician?.id ?? "",
        scheduledStart: toDateTimeLocal(new Date(calendarEvent.scheduledStart)),
        scheduledEnd: toDateTimeLocal(new Date(calendarEvent.scheduledEnd))
      });
    } else if (slot) {
      const start = new Date(slot.date);
      start.setHours(slot.hour, slot.minute, 0, 0);
      const end = new Date(start);
      end.setHours(start.getHours() + 1);
      setEventEditingId("");
      setEventForm({
        ...blankEventForm(),
        technicianId: slot.technicianId ?? "",
        scheduledStart: toDateTimeLocal(start),
        scheduledEnd: toDateTimeLocal(end)
      });
    } else {
      setEventEditingId("");
      setEventForm(blankEventForm());
    }
    setSlotPrompt(null);
    setSelectedScheduleEvent(null);
    setEventDialogOpen(true);
  }

  function openEventFromSlot(slot: { date: Date; hour: number; minute: number; technicianId?: string }) {
    openEventEditor(undefined, slot);
  }

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!eventForm.name.trim()) {
      setError("Event name is required.");
      return;
    }
    const start = new Date(eventForm.scheduledStart);
    const end = new Date(eventForm.scheduledEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError("Event end time must be after the start time.");
      return;
    }
    try {
      const result = await api<{ event: CalendarEvent }>(eventEditingId ? `/api/events/${eventEditingId}` : "/api/events", {
        method: eventEditingId ? "PATCH" : "POST",
        body: JSON.stringify({
          name: eventForm.name.trim(),
          notes: eventForm.notes.trim() || null,
          eventLocation: eventForm.eventLocation.trim() || null,
          latitude: eventForm.latitude ? Number(eventForm.latitude) : null,
          longitude: eventForm.longitude ? Number(eventForm.longitude) : null,
          technicianId: eventForm.technicianId || null,
          scheduledStart: start.toISOString(),
          scheduledEnd: end.toISOString()
        })
      });
      mergeEventRecord(result.event);
      setEventDialogOpen(false);
      setEventEditingId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save event.");
    }
  }

  async function deleteEvent(calendarEvent: CalendarEvent) {
    if (!window.confirm(`Delete event "${calendarEvent.name}"?`)) return;
    setError("");
    try {
      await api(`/api/events/${calendarEvent.id}`, { method: "DELETE" });
      setEvents((current) => current.filter((item) => item.id !== calendarEvent.id));
      setSelectedScheduleEvent(null);
      setEventDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete event.");
    }
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

  function renderInvoiceSendPage(invoice: Invoice) {
    const items = invoiceLineItems(invoice);
    const serviceItems = items.filter((item) => (item.category ?? "service") !== "material");
    const materialItems = items.filter((item) => (item.category ?? "service") === "material");
    const subtotal = invoice.subtotal ?? items.reduce((sum, item) => sum + Number(item.quantity || "1") * item.unitPrice, 0);
    const tax = invoice.tax ?? Math.max(invoice.total - subtotal, 0);
    const companyName = activeLocationAccess?.organization.name || activeLocationAccess?.location.name || "Affordable Security Locksmith";
    const companyPhone = activeLocationAccess?.location.phone || "(928) 580-2775";
    const companyEmail = "service@5802775.com";
    const companyWebsite = activeLocationAccess?.location.website || "https://www.affordablesecurity1.com";
    const companyAddress = [activeLocationAccess?.location.street1, activeLocationAccess?.location.city, activeLocationAccess?.location.state, activeLocationAccess?.location.postalCode].filter(Boolean).join(", ");
    const customerAddress = invoiceCustomerAddress(invoice.customer) || (invoice.job?.address ? [invoice.job.address.street1, invoice.job.address.city, invoice.job.address.state, invoice.job.address.postalCode].filter(Boolean).join(", ") : "");
    const serviceDate = invoice.job?.scheduledStart ?? invoice.createdAt;
    const invoiceMessage = invoiceSettings.invoiceMessage || activeLocationAccess?.location.termsOfService || "Thank you for choosing Affordable Security Locksmith and Alarm. We stand behind our work with a 6-month warranty. If you experience any issues related to the service provided, please contact us for assistance. Your satisfaction is our priority!";

    return (
      <div className="invoice-send-page">
        <header className="invoice-send-topbar">
          <button className="icon-button" type="button" onClick={() => setSelectedInvoiceId("")} aria-label="Close invoice"><X size={22} /></button>
          <h1>Send invoice</h1>
          <div className="invoice-top-actions">
            <button className="icon-button danger" type="button" onClick={() => deleteInvoice(invoice)} aria-label="Delete invoice"><Trash2 size={20} /></button>
            <button className="icon-button" type="button" onClick={() => window.print()} aria-label="Print invoice"><Printer size={20} /></button>
            <button className="icon-button" type="button" onClick={() => setError("PDF download is not connected yet. Use Print for now, or connect PDF generation before using downloads.")} aria-label="Download invoice"><Download size={20} /></button>
            <button className="primary" type="button" onClick={() => openInvoiceSendDialog(invoice)}>Send</button>
          </div>
        </header>
        <div className="invoice-send-body">
          <aside className="invoice-settings-rail">
            <section>
              <div className="panel-header"><h2>Details</h2><Pencil size={18} /></div>
              <dl className="invoice-detail-list">
                <dt>Invoice #</dt><dd>{invoice.invoiceNumber}</dd>
                <dt>Invoice date</dt><dd>{formatDate(invoice.createdAt)}</dd>
                <dt>Invoice due</dt><dd>{invoiceSettings.defaultTermsType === "uponReceipt" ? "Upon receipt" : `Net ${invoiceSettings.defaultTermsDays}`}</dd>
                <dt>Amount due</dt><dd className="amount">{money.format(invoice.total / 100)}</dd>
              </dl>
            </section>
            {invoiceSettings.includeImages && (
              <section>
                <div className="panel-header"><h2>Attachments</h2><Pencil size={18} /></div>
                <p className="muted">invoice-{invoice.invoiceNumber}.pdf</p>
              </section>
            )}
            {invoiceSettings.showSummaryOfWork && (
              <section>
                <div className="panel-header"><h2>Invoice message</h2><Pencil size={18} /></div>
                <p>{invoiceMessage}</p>
              </section>
            )}
            <section>
              <h2>Payment options</h2>
              <label><input type="checkbox" checked={invoiceSettings.acceptCreditCard} readOnly /> Accept credit card</label>
              <label><input type="checkbox" checked={invoiceSettings.saveCardOnFile} readOnly /> Customer can save card on file</label>
              <label><input type="checkbox" checked={invoiceSettings.acceptAch} readOnly /> Accept ACH</label>
            </section>
            <section>
              <h2>Job and invoice</h2>
              <label><input type="checkbox" checked={invoiceSettings.showJobNumber} readOnly /> Job number</label>
              <label><input type="checkbox" checked={invoiceSettings.showInvoiceNumber} readOnly /> Invoice number</label>
              <label><input type="checkbox" checked={invoiceSettings.showServiceDate} readOnly /> Service date</label>
              <label><input type="checkbox" checked={invoiceSettings.showInvoiceDate} readOnly /> Invoice date</label>
              <label><input type="checkbox" checked={invoiceSettings.showSummaryOfWork} readOnly /> Summary of work</label>
            </section>
          </aside>
          <section className="invoice-preview-paper">
            <div className="invoice-preview-head">
              <div>
                {renderInvoiceLogo()}
                {invoiceSettings.showBusinessName && <h2>{companyName}</h2>}
              </div>
              <dl className="invoice-amount-box">
                {invoice.job && invoiceSettings.showJobNumber && <><dt>Job</dt><dd>#{invoice.job.jobNumber}</dd></>}
                {invoiceSettings.showInvoiceNumber && <><dt>Invoice</dt><dd>#{invoice.invoiceNumber}</dd></>}
                {invoiceSettings.showServiceDate && <><dt>Service date</dt><dd>{formatDate(serviceDate)}</dd></>}
                {invoiceSettings.showInvoiceDate && <><dt>Invoice date</dt><dd>{formatDate(invoice.createdAt)}</dd></>}
                <dt>Payment terms</dt><dd>{invoiceSettings.defaultTermsType === "uponReceipt" ? "Upon receipt" : `Net ${invoiceSettings.defaultTermsDays}`}</dd>
                <dt>Amount due</dt><dd>{money.format(invoice.total / 100)}</dd>
              </dl>
            </div>
            <div className="invoice-parties">
              <div>
                {invoiceSettings.showCustomerDisplayName && <strong>{customerName(invoice.customer)}</strong>}
                {invoiceSettings.showCustomerCompanyName && invoice.customer.companyName && <strong>{invoice.customer.companyName}</strong>}
                {customerAddress && <span>{customerAddress}</span>}
                <span>{invoice.customer.phone}</span>
              </div>
              <div>
                <strong>Contact us</strong>
                <span>{companyAddress}</span>
                <span>{companyPhone}</span>
                <span>{companyEmail}</span>
                {invoice.job?.technician && invoiceSettings.showTechnicianName && <span>Service completed by: {invoice.job.technician.name}</span>}
              </div>
            </div>
            <h3>Invoice</h3>
            {invoiceSettings.showServiceLineItems && <table className="invoice-preview-table">
              <thead><tr><th>Services</th><th>{invoiceSettings.showServiceQuantity ? "Qty" : ""}</th><th>{invoiceSettings.showServiceUnitPrice ? "Unit price" : ""}</th><th>{invoiceSettings.showServiceAmount ? "Amount" : ""}</th></tr></thead>
              <tbody>
                {serviceItems.map((item) => (
                  <tr key={item.id}>
                    <td>{invoiceSettings.showServiceName && <strong>{item.name}</strong>}{invoiceSettings.showServiceDescription && item.description && <span>{item.description}</span>}</td>
                    <td>{invoiceSettings.showServiceQuantity ? Number(item.quantity || "1") : ""}</td>
                    <td>{invoiceSettings.showServiceUnitPrice ? money.format(item.unitPrice / 100) : ""}</td>
                    <td>{invoiceSettings.showServiceAmount ? money.format((Number(item.quantity || "1") * item.unitPrice) / 100) : ""}</td>
                  </tr>
                ))}
                {serviceItems.length === 0 && <tr><td colSpan={4}>No services added yet.</td></tr>}
              </tbody>
            </table>}
            {invoiceSettings.showMaterialLineItems && <table className="invoice-preview-table">
              <thead><tr><th>Materials</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead>
              <tbody>
                {materialItems.map((item) => (
                  <tr key={item.id}>
                    <td>{invoiceSettings.showMaterialName && <strong>{item.name}</strong>}{invoiceSettings.showMaterialDescription && item.description && <span>{item.description}</span>}</td>
                    <td>{Number(item.quantity || "1")}</td>
                    <td>{money.format(item.unitPrice / 100)}</td>
                    <td>{money.format((Number(item.quantity || "1") * item.unitPrice) / 100)}</td>
                  </tr>
                ))}
                {materialItems.length === 0 && <tr><td colSpan={4}>No materials added yet.</td></tr>}
              </tbody>
            </table>}
            <div className="invoice-preview-totals">
              <span>Subtotal</span><strong>{money.format(subtotal / 100)}</strong>
              <span>Total tax</span><strong>{money.format(tax / 100)}</strong>
              <span>Job total</span><strong>{money.format(invoice.total / 100)}</strong>
              <span>Amount due</span><strong>{money.format(invoice.total / 100)}</strong>
            </div>
            <footer>
              {invoiceSettings.showSummaryOfWork && <p>{invoiceMessage}</p>}
              <div><span>{companyName}</span><span>{companyWebsite}</span></div>
            </footer>
          </section>
        </div>
        {invoiceActionMessage && <p className="inline-confirm">{invoiceActionMessage}</p>}
      </div>
    );
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
          <button className={activeView === "map" ? "active" : ""} onClick={() => setActiveView("map")}><Map size={18} /> Map</button>

          <span className="nav-section">Communication</span>
          <button className={activeView === "messages" ? "active" : ""} onClick={() => setActiveView("messages")}><MessageSquareText size={18} /> Messages</button>
          <button><Phone size={18} /> Phone</button>
          <button><TrendingUp size={18} /> Marketing</button>

          <span className="nav-section">Operations</span>
          <button className={activeView === "jobs" ? "active" : ""} onClick={() => setActiveView("jobs")}><Wrench size={18} /> Jobs</button>
          <button className={activeView === "customers" ? "active" : ""} onClick={() => setActiveView("customers")}><Users size={18} /> Clients & Leads</button>
          <button className={activeView === "employees" ? "active" : ""} onClick={() => setActiveView("employees")}><UserPlus size={18} /> Employees</button>
          <button className={activeView === "invoices" ? "active" : ""} onClick={() => setActiveView("invoices")}><ReceiptText size={18} /> Invoices</button>
          <button className={activeView === "estimates" ? "active" : ""} onClick={() => setActiveView("estimates")}><FileText size={18} /> Estimates</button>
          <button><WalletCards size={18} /> Payments</button>
          <button className={activeView === "events" ? "active" : ""} onClick={() => setActiveView("events")}><CalendarDays size={18} /> Events</button>
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
        <button className="ghost" onClick={() => clearSession()}>
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
              <button onClick={() => { setActiveView("messages"); setAddMenuOpen(false); }}><MessageSquareText size={16} /> Message</button>
              <button onClick={() => { setActiveView("customers"); setAddMenuOpen(false); }}><Users size={16} /> Client or Lead</button>
              <button onClick={() => { setAddMenuOpen(false); setActiveView("employees"); openEmployeeModal("employee"); }}><UserPlus size={16} /> Employee</button>
              <button onClick={() => { setActiveView("jobs"); setJobPageMode("create"); setAddMenuOpen(false); }}><Wrench size={16} /> Job</button>
              <button onClick={() => { setActiveView("invoices"); setAddMenuOpen(false); }}><ReceiptText size={16} /> Invoice</button>
              <button onClick={() => { setActiveView("estimates"); setEstimatePageMode("create"); setSelectedEstimateId(""); setAddMenuOpen(false); }}><FileText size={16} /> Estimate</button>
              <button onClick={() => { openEventEditor(); setAddMenuOpen(false); }}><CalendarDays size={16} /> Event</button>
            </div>
          </div>
          <div className="topbar-spacer" />
          <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
          <button className="profile-button" aria-label="Profile"><span>BW</span><ChevronDown size={16} /></button>
        </header>

        <div className="page-titlebar">
          <div className="breadcrumb"><Home size={17} /> {activeView === "dispatch" ? "Dashboard" : activeView === "servicePlans" ? "Service Plans" : activeView[0].toUpperCase() + activeView.slice(1)}</div>
          <div className="topbar-actions">
            <select className="location-switcher" value={activeLocationId} onChange={(event) => switchLocation(event.target.value)}>
              {locations.map((item) => (
                <option key={item.location.id} value={item.location.id}>
                  {locationDisplayName(item.location)}
                </option>
              ))}
            </select>
            {activeView === "dispatch" ? (
              <label className="date-pill dashboard-date-input">
                <input
                  aria-label="Dashboard date"
                  type="date"
                  value={dashboardDate}
                  onChange={(event) => {
                    setDashboardDate(event.target.value);
                    setDashboardDateRange("selectedDay");
                  }}
                />
                <CalendarDays size={16} />
              </label>
            ) : (
              <div className="date-pill">{new Date().toLocaleDateString([], { month: "2-digit", day: "2-digit", year: "numeric" })} <CalendarDays size={16} /></div>
            )}
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        {activeView === "dispatch" && (
          <section className="dashboard-page">
            <div className="dashboard-hero">
              <div>
                <h1>Business snapshot</h1>
                <p>{dashboardDateRangeLabel} performance for {activeLocationAccess?.location.name ?? "this location"}.</p>
              </div>
              <div className="dashboard-range-controls">
                <select
                  aria-label="Dashboard date range"
                  value={dashboardDateRange}
                  onChange={(event) => setDashboardDateRange(event.target.value)}
                >
                  {dashboardDateRanges.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
                <button className="outline-button" type="button" onClick={() => setDashboardDateRange("today")}>Today</button>
                <button className="outline-button" type="button" onClick={() => setDashboardDateRange("weekToDate")}>Week</button>
                <button className="outline-button" type="button" onClick={() => setDashboardDateRange("monthToDate")}>Month</button>
                <button className="outline-button" type="button" onClick={() => setDashboardDateRange("quarterToDate")}>Quarter</button>
                <button className="outline-button" type="button" onClick={() => setDashboardDateRange("yearToDate")}>Year</button>
              </div>
            </div>

            <div className="stats-grid dashboard-kpi-grid">
              <StatCard
                label="Job revenue earned"
                value={money.format((summary?.salesCents ?? 0) / 100)}
                caption="Open revenue report"
                icon={CircleDollarSign}
                onClick={() => openDashboardReport("job-revenue-earned")}
              />
              <StatCard
                label="Jobs completed"
                value={String(summary?.completedJobs ?? 0)}
                caption="View completed jobs"
                icon={CheckCheck}
                onClick={() => openJobsFiltered("COMPLETED")}
              />
              <StatCard
                label="Average job size"
                value={money.format((summary?.averageJobSizeCents ?? 0) / 100)}
                caption="Open average job report"
                icon={TrendingUp}
                onClick={() => openDashboardReport("average-job-size")}
              />
              <StatCard
                label="New jobs booked"
                value={String(summary?.bookedJobs ?? 0)}
                caption="View scheduled jobs"
                icon={Wrench}
                onClick={() => openJobsFiltered("SCHEDULED")}
              />
            </div>

            <div className="stats-grid dashboard-secondary-grid">
              <StatCard label="Collected payments" value={money.format((summary?.collectedCents ?? 0) / 100)} caption="Open invoices" icon={BadgeDollarSign} onClick={() => setActiveView("invoices")} />
              <StatCard label="Cancellation rate" value={percent.format(summary?.cancellationRate ?? 0)} caption={`${summary?.canceledJobs ?? 0} canceled jobs`} icon={Percent} onClick={() => openJobsFiltered("CANCELED")} />
              <StatCard label="New clients" value={String(summary?.customers ?? 0)} caption="Open client list" icon={Users} onClick={() => setActiveView("customers")} />
              <StatCard label="New leads" value={String(summary?.leadJobs ?? 0)} caption="View lead jobs" icon={UserPlus} onClick={() => openJobsFiltered("LEAD")} />
            </div>

            <div className="dashboard-content-grid">
              <section className="panel wide">
                <div className="panel-header">
                  <h2>Schedule</h2>
                  <button className="link-button" onClick={() => setActiveView("schedule")}>View schedule</button>
                </div>
                <div className="dashboard-schedule-list">
                  {dashboardScheduledJobs.map((job) => (
                    <button className="dashboard-schedule-row" type="button" key={job.id} onClick={() => openJobDetail(job)}>
                      <strong>{job.scheduledStart ? new Date(job.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unscheduled"}</strong>
                      <span>Job {job.jobNumber} / {customerName(job.customer)}</span>
                      <small>{job.technician?.name ?? "Unassigned"}</small>
                    </button>
                  ))}
                  {dashboardScheduledJobs.length === 0 && <p className="empty">No scheduled jobs for this location.</p>}
                </div>
              </section>

              <section className="panel chart-panel">
                <div className="panel-header">
                  <h2>Jobs by type</h2>
                  <button className="link-button" onClick={() => openDashboardReport("job-type", "jobs")}>View report</button>
                </div>
                {summary?.jobsByType.length ? (
                  <div className="metric-list">
                    {summary.jobsByType.map((item) => (
                      <button className="metric-row metric-row-button" type="button" key={item.label} onClick={() => openDashboardReport("job-type", "jobs")}>
                        <span>{item.label}</span>
                        <strong>{item.count}</strong>
                        <em>{percent.format(item.percent)}</em>
                      </button>
                    ))}
                  </div>
                ) : <div className="empty-chart"><span>!</span> No jobs in this range</div>}
              </section>

              <section className="panel chart-panel">
                <div className="panel-header">
                  <h2>Jobs by source</h2>
                  <button className="link-button" onClick={() => openDashboardReport("job-lead-source", "leads")}>View report</button>
                </div>
                {summary?.jobsBySource.length ? (
                  <div className="metric-list">
                    {summary.jobsBySource.map((item, index) => (
                      <button className="metric-row metric-row-button source-row" type="button" key={item.label} onClick={() => openDashboardReport("job-lead-source", "leads")}>
                        <span><i className={sourceColor(index)} /> {item.label}</span>
                        <strong>{item.count}</strong>
                        <em>{percent.format(item.percent)}</em>
                      </button>
                    ))}
                  </div>
                ) : <div className="empty-chart"><span>!</span> No job sources in this range</div>}
              </section>
            </div>
          </section>
        )}

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
                  const dayEvents = scheduledEvents.filter((calendarEvent) => sameCalendarDay(new Date(calendarEvent.scheduledStart), day));
                  const visibleEventSlots = Math.max(0, 4 - dayJobs.length);
                  const hiddenItems = Math.max(0, dayJobs.length + dayEvents.length - 4);
                  return (
                    <button className={day.getMonth() === scheduleDate.getMonth() ? "month-day" : "month-day muted"} key={day.toISOString()} onClick={() => { setScheduleDate(day); setCalendarMode("day"); }}>
                      <span>{dayLabels[day.getDay()]} {day.getDate()}</span>
                      {dayJobs.slice(0, 4).map((job) => (
                        <em key={job.id} onClick={(event) => { event.stopPropagation(); setSelectedScheduleJob(job); }}>{job.customer.firstName} {job.customer.lastName}</em>
                      ))}
                      {dayEvents.slice(0, visibleEventSlots).map((calendarEvent) => (
                        <em className="month-event" key={calendarEvent.id} onClick={(event) => { event.stopPropagation(); setSelectedScheduleEvent(calendarEvent); }}>{calendarEvent.name}</em>
                      ))}
                      {hiddenItems > 0 && <small>+{hiddenItems} more</small>}
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
                {scheduleColumns.map((column) => <button className="calendar-cell all-day-cell" key={`all-${column.id}`} onClick={() => setSlotPrompt({ date: column.date, hour: 9, minute: 0, technicianId: column.technicianId })} />)}
                {calendarSlots.map(({ hour, minute }) => (
                  <Fragment key={`row-${hour}-${minute}`}>
                    <div className={minute === 0 ? "calendar-time" : "calendar-time calendar-time-subslot"} key={`label-${hour}-${minute}`}>
                      {minute === 0 ? formatHour(hour) : ""}
                    </div>
                    {scheduleColumns.map((column) => {
                      const slotJobs = scheduledJobs.filter((job) => {
                        if (!job.scheduledStart) return false;
                        const start = new Date(job.scheduledStart);
                        const techMatches = calendarMode !== "employees" || (column.technicianId ? job.technician?.id === column.technicianId : !job.technician?.id);
                        return techMatches && sameCalendarDay(start, column.date) && sameCalendarSlot(start, hour, minute);
                      });
                      const slotEvents = scheduledEvents.filter((calendarEvent) => {
                        const start = new Date(calendarEvent.scheduledStart);
                        const eventTechId = calendarEvent.technicianId ?? calendarEvent.technician?.id;
                        const techMatches = calendarMode !== "employees" || (column.technicianId ? eventTechId === column.technicianId : !eventTechId);
                        return techMatches && sameCalendarDay(start, column.date) && sameCalendarSlot(start, hour, minute);
                      });
                      const now = new Date();
                      const isCurrentSlot = sameCalendarDay(column.date, now) && sameCalendarSlot(now, hour, minute);
                      const currentOffset = `${(now.getMinutes() - minute) / 15 * 100}%`;
                      return (
                        <button className={minute === 0 ? "calendar-cell calendar-hour-cell" : "calendar-cell calendar-subslot"} key={`${column.id}-${hour}-${minute}`} onClick={() => setSlotPrompt({ date: column.date, hour, minute, technicianId: column.technicianId })}>
                          {isCurrentSlot && <span className="current-time-line" style={{ top: currentOffset }} />}
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
                          {slotEvents.map((calendarEvent) => (
                            <span
                              className="calendar-job calendar-event"
                              key={calendarEvent.id}
                              role="button"
                              tabIndex={0}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedScheduleEvent(calendarEvent);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setSelectedScheduleEvent(calendarEvent);
                                }
                              }}
                            >
                              <strong>{calendarEvent.name}</strong>
                              <em>{new Date(calendarEvent.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}-{new Date(calendarEvent.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</em>
                              <small>{calendarEvent.technician?.name ?? "Unassigned"}</small>
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
              <p>{slotPrompt.date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })} at {formatHour(slotPrompt.hour, slotPrompt.minute)}</p>
              <div className="create-options">
                <button onClick={() => openJobFromSlot(slotPrompt)}><Wrench size={18} /> Job</button>
                <button onClick={() => openEventFromSlot(slotPrompt)}><CalendarDays size={18} /> Event</button>
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

        {selectedScheduleEvent && (
          <div className="modal-backdrop" onClick={() => setSelectedScheduleEvent(null)}>
            <div className="schedule-job-modal schedule-event-modal" onClick={(event) => event.stopPropagation()}>
              <div className="schedule-job-title">
                <div>
                  <h2><CalendarDays size={22} /> {selectedScheduleEvent.name}</h2>
                  <p>{eventTimeLabel(selectedScheduleEvent)}</p>
                </div>
                <div className="table-actions">
                  <button className="link-button" type="button" onClick={() => openEventEditor(selectedScheduleEvent)}>Edit</button>
                  <button className="danger-link" type="button" onClick={() => deleteEvent(selectedScheduleEvent)}>Delete</button>
                </div>
              </div>
              <div className="schedule-job-details">
                <span><MapPin size={18} /> {selectedScheduleEvent.eventLocation || "No location saved"}</span>
                <span><UserPlus size={18} /> {selectedScheduleEvent.technician?.name ?? "Unassigned"}</span>
                <span><StickyNote size={18} /> {selectedScheduleEvent.notes || "No notes"}</span>
              </div>
            </div>
          </div>
        )}

        {eventDialogOpen && (
          <div className="event-create-overlay">
            <form className="event-create-shell" onSubmit={saveEvent}>
              <header className="event-create-header">
                <button type="button" className="icon-button" onClick={() => setEventDialogOpen(false)} aria-label="Close event editor"><X size={20} /></button>
                <h1>{eventEditingId ? "Edit event" : "New event"}</h1>
                <button className="primary" type="submit" disabled={!eventForm.name.trim()}>Save event</button>
              </header>
              <div className="event-create-grid">
                <section className="panel event-card">
                  <div className="panel-header"><h2><CalendarDays size={20} /> Schedule</h2></div>
                  <div className="event-schedule-row">
                    <span>From</span>
                    <input type="date" value={formDatePart(eventForm.scheduledStart)} onChange={(event) => setEventForm((current) => ({ ...current, scheduledStart: mergeDateAndTime(current.scheduledStart, "date", event.target.value) }))} required />
                    <input type="time" step={900} value={formTimePart(eventForm.scheduledStart)} onChange={(event) => setEventForm((current) => ({ ...current, scheduledStart: mergeDateAndTime(current.scheduledStart, "time", event.target.value) }))} required />
                  </div>
                  <div className="event-schedule-row">
                    <span>To</span>
                    <input type="date" value={formDatePart(eventForm.scheduledEnd)} onChange={(event) => setEventForm((current) => ({ ...current, scheduledEnd: mergeDateAndTime(current.scheduledEnd, "date", event.target.value) }))} required />
                    <input type="time" step={900} value={formTimePart(eventForm.scheduledEnd)} onChange={(event) => setEventForm((current) => ({ ...current, scheduledEnd: mergeDateAndTime(current.scheduledEnd, "time", event.target.value) }))} required />
                  </div>
                  <p className="timezone-note">Timezone: {activeLocationAccess?.location.timezone ?? "America/Phoenix"}</p>
                  <div className="event-team-row">
                    <UserPlus size={20} />
                    <select value={eventForm.technicianId} onChange={(event) => setEventForm((current) => ({ ...current, technicianId: event.target.value }))}>
                      <option value="">Unassigned</option>
                      {technicians.filter((tech) => tech.active).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                    </select>
                  </div>
                  <span className="assignment-chip">{technicians.find((tech) => tech.id === eventForm.technicianId)?.name ?? "Unassigned"}</span>
                </section>

                <section className="panel event-card event-details-card">
                  <div className="panel-header"><h2><ListChecks size={20} /> Event details</h2></div>
                  <label>Name<input value={eventForm.name} onChange={(event) => setEventForm((current) => ({ ...current, name: event.target.value }))} autoFocus required /></label>
                  <label>Note<textarea value={eventForm.notes} onChange={(event) => setEventForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <label>
                    Location
                    {renderAddressAutocomplete({
                      lookupKey: "event-location",
                      value: eventForm.eventLocation,
                      placeholder: "Street address, city, or place",
                      onChange: (value) => setEventForm((current) => ({ ...current, eventLocation: value, latitude: "", longitude: "" })),
                      onSelect: (place) => setEventForm((current) => ({
                        ...current,
                        eventLocation: place.formattedAddress,
                        latitude: place.latitude === undefined ? "" : String(place.latitude),
                        longitude: place.longitude === undefined ? "" : String(place.longitude)
                      }))
                    })}
                  </label>
                </section>
              </div>
            </form>
          </div>
        )}

        {activeView === "map" && (
          <section className="map-page">
            <div className="section-actions">
              <div className="breadcrumb"><Map size={17} /> Map</div>
              <button className="primary" onClick={() => setActiveView("schedule")}><CalendarDays size={18} /> View schedule</button>
            </div>
            <div className="map-page-grid">
              <section className="panel route-map-board">
                <div className="panel-header"><h2>Today's route map</h2><span>{todaysDispatchStops.length} stops</span></div>
                <div className="map-stop-list">
                  {(todaysDispatchStops.length ? todaysDispatchStops : dispatchStops.slice(0, 8)).map((stop, index) => (
                    <button key={stop.id} className={stop.type === "event" ? "map-stop-card event-stop" : "map-stop-card"} onClick={stop.onOpen}>
                      <strong>{index + 1}. {stop.title}</strong>
                      <span>{new Date(stop.time).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} - {stop.technician}</span>
                      <small>{stop.location}</small>
                    </button>
                  ))}
                  {!dispatchStops.length && <p className="empty-state">Create jobs or events with locations to build the route map.</p>}
                </div>
              </section>
              <section className="panel">
                <div className="panel-header"><h2>Stops</h2></div>
                <div className="record-list">
                  {dispatchStops.slice(0, 12).map((stop) => (
                    <button key={stop.id} className="record-row" onClick={stop.onOpen}>
                      <strong>{stop.title}</strong>
                      <span>{stop.detail}</span>
                      <small>{stop.location}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}

        {activeView === "events" && (
          <section className="events-page">
            <div className="section-actions">
              <div className="breadcrumb"><CalendarDays size={17} /> Events</div>
              <button className="primary" onClick={() => openEventEditor()}><Plus size={18} /> Create Event</button>
            </div>
            <section className="panel events-panel">
              <div className="toolbar-line">
                <label className="search-control"><Search size={17} /><input placeholder="Search events..." value={eventSearch} onChange={(event) => setEventSearch(event.target.value)} /></label>
              </div>
              <table className="record-table">
                <thead><tr><th>Name</th><th>Scheduled</th><th>Location</th><th>Team member</th><th>Actions</th></tr></thead>
                <tbody>
                  {filteredEvents.map((calendarEvent) => (
                    <tr key={calendarEvent.id}>
                      <td><div className="event-title-cell"><strong>{calendarEvent.name}</strong><small>{calendarEvent.notes || "No notes"}</small></div></td>
                      <td>{eventTimeLabel(calendarEvent)}</td>
                      <td>{calendarEvent.eventLocation || "No location"}</td>
                      <td>{calendarEvent.technician?.name ?? "Unassigned"}</td>
                      <td>
                        <div className="table-actions">
                          <button className="icon-button" onClick={() => openEventEditor(calendarEvent)} aria-label={`Edit ${calendarEvent.name}`}><Pencil size={16} /></button>
                          <button className="icon-button danger" onClick={() => deleteEvent(calendarEvent)} aria-label={`Delete ${calendarEvent.name}`}><Trash2 size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filteredEvents.length && <tr><td colSpan={5}>No events yet.</td></tr>}
                </tbody>
              </table>
            </section>
          </section>
        )}

        {activeView === "messages" && (
          <section className="messages-page">
            <div className="section-actions">
              <div className="breadcrumb"><MessageSquareText size={17} /> Messages</div>
              <button className="outline-button" type="button" onClick={() => { setSettingsSection("messagingSettings"); setActiveView("settings"); }}>SMS Settings</button>
            </div>
            <div className="message-mode-tabs">
              <button type="button" className={messageMode === "customers" ? "active" : ""} onClick={() => setMessageMode("customers")}>
                Customer texts {customerUnreadTotal > 0 && <span>{customerUnreadTotal > 99 ? "99+" : customerUnreadTotal}</span>}
              </button>
              <button type="button" className={messageMode === "internal" ? "active" : ""} onClick={() => setMessageMode("internal")}>
                In-house
              </button>
            </div>
            {messageMode === "customers" && (
            <div className="messages-layout">
              <aside className="message-thread-list">
                <div className="thread-list-head">
                  <strong>Conversations</strong>
                  <span>{messageThreads.length}</span>
                </div>
                {messageThreads.length ? messageThreads.map((thread) => {
                  const lastMessage = thread.messages[thread.messages.length - 1];
                  return (
                    <button
                      key={thread.id}
                      type="button"
                      className={["message-thread", selectedThread?.id === thread.id ? "active" : "", thread.unread ? "unread" : ""].filter(Boolean).join(" ")}
                      onClick={() => setSelectedMessageThread(thread.id)}
                    >
                      <div className="message-thread-title">
                        <span>{thread.label}</span>
                        {thread.unread > 0 && <strong className="thread-unread-badge">{thread.unread > 99 ? "99+" : thread.unread}</strong>}
                      </div>
                      <small>{lastMessage?.body ?? "No messages yet"}</small>
                      <em>{lastMessage ? formatDateTime(lastMessage.createdAt) : ""}</em>
                    </button>
                  );
                }) : <div className="empty-state small">No text conversations yet.</div>}
              </aside>
              <div className="message-conversation">
                {selectedThread ? (
                  <>
                    <div className="conversation-head">
                      <div>
                        <h2>{selectedThread.label}</h2>
                        <span>{selectedThread.phone}</span>
                      </div>
                      {selectedThread.customer && (
                        <button className="outline-button" type="button" onClick={() => {
                          const customer = selectedThread.customer;
                          if (!customer) return;
                          setSelectedCustomerId(customer.id);
                          setActiveView("customers");
                        }}>Customer profile</button>
                      )}
                    </div>
                    <div className="message-list">
                      {selectedThread.messages.map((message) => (
                        <div key={message.id} className={`message-bubble ${message.direction.toLowerCase()}`}>
                          <p>{message.body}</p>
                          {(message.attachments ?? []).length > 0 && (
                            <div className="message-attachments">
                              {(message.attachments ?? []).map((attachment, index) => renderMessageAttachment(attachment, message.id, index))}
                            </div>
                          )}
                          <span>{formatDateTime(message.createdAt)} · {message.status ?? (message.direction === "INBOUND" ? "Received" : "Sent")}</span>
                          {message.error && <strong>{message.error}</strong>}
                        </div>
                      ))}
                    </div>
                    <form className="message-composer" onSubmit={sendManualMessage}>
                      <label className="composer-attach-button" title="Attach files">
                        <Paperclip size={18} />
                        <input type="file" multiple accept="image/*,video/mp4,video/quicktime,video/x-m4v,video/webm,application/pdf,.pdf,.mov,.mp4,.m4v,.webm,.heic,.heif" onChange={(event) => {
                          void addMessageAttachments(event.currentTarget.files);
                          event.currentTarget.value = "";
                        }} />
                      </label>
                      <div className="composer-input-stack">
                        <textarea
                          value={messageDraft}
                          onChange={(event) => setMessageDraft(event.target.value)}
                          onKeyDown={handleMessageComposerKeyDown}
                          placeholder="Type a text message..."
                        />
                        {messageAttachments.length > 0 && (
                          <div className="composer-attachments">
                            {messageAttachments.map((attachment) => (
                              <button key={attachment.name} type="button" onClick={() => removeMessageAttachment(attachment.name)}>
                                <Paperclip size={13} /> {attachment.name} <span>×</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <button className="primary" type="submit" disabled={!messageDraft.trim() && !messageAttachments.length}>Send text</button>
                    </form>
                  </>
                ) : (
                  <div className="empty-state">
                    <MessageSquareText size={34} />
                    <strong>No messages yet</strong>
                    <p>Automated and manual customer texts will show here after VoIP.ms is configured.</p>
                  </div>
                )}
              </div>
            </div>
            )}
            {messageMode === "internal" && (
              <div className="internal-messages-layout">
                <aside className="internal-sidebar">
                  <div className="thread-list-head">
                    <strong>In-house</strong>
                    <span>{internalRecipients.length}</span>
                  </div>
                  <div className="internal-channel-tabs">
                    <button type="button" className={internalAudience === "team" ? "active" : ""} onClick={() => setInternalAudience("team")}>Team</button>
                    {canUseAdminChannel && (
                      <button type="button" className={internalAudience === "admin" ? "active" : ""} onClick={() => setInternalAudience("admin")}>Admins</button>
                    )}
                  </div>
                  <div className="internal-roster-search">
                    <Search size={16} />
                    <input
                      value={internalRecipientSearch}
                      onChange={(event) => setInternalRecipientSearch(event.target.value)}
                      placeholder="Search people..."
                    />
                  </div>
                  <div className="internal-recipient-list">
                    {filteredInternalRecipients.length ? filteredInternalRecipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        type="button"
                        className={`internal-recipient-option ${internalAudience === "direct" && recipient.id === internalRecipientId ? "active" : ""}`}
                        onClick={() => {
                          setInternalAudience("direct");
                          setInternalRecipientId(recipient.id);
                        }}
                      >
                        <span>{recipient.name}</span>
                        <small>{recipient.kind} · {recipient.email || recipient.phone || "No contact saved"}</small>
                      </button>
                    )) : (
                      <div className="internal-recipient-empty">No matching team members.</div>
                    )}
                  </div>
                </aside>
                <div className="message-conversation">
                  <div className="conversation-head">
                    <div>
                      <h2>{internalAudience === "direct" ? selectedInternalRecipient?.name ?? "Direct message" : internalAudience === "admin" ? "Admin channel" : "Team channel"}</h2>
                      <span>{internalAudience === "direct" ? selectedInternalRecipient?.email || selectedInternalRecipient?.phone || "Private in-house message" : "Team chat stays inside this location."}</span>
                    </div>
                    <div className="internal-head-actions">
                      <span className="internal-channel-pill">{internalAudience === "direct" ? "Direct" : internalAudience === "admin" ? "Admins" : "Team"}</span>
                    </div>
                  </div>
                  <div className="message-list">
                    {visibleInternalMessages.length ? visibleInternalMessages.map((message) => (
                      <div key={message.id} className="message-bubble internal">
                        <small>{message.templateKey || "Team member"}{message.channel === "internal-direct" && message.providerRef ? ` → ${message.providerRef}` : ""}</small>
                        <p>{message.body}</p>
                        {(message.attachments ?? []).length > 0 && (
                          <div className="message-attachments">
                            {(message.attachments ?? []).map((attachment, index) => renderMessageAttachment(attachment, message.id, index))}
                          </div>
                        )}
                        <span>{formatDateTime(message.createdAt)} · Internal</span>
                      </div>
                    )) : (
                      <div className="empty-state small">No in-house messages yet.</div>
                    )}
                  </div>
                  <form className="message-composer internal-composer" onSubmit={sendInternalMessage}>
                    <label className="composer-attach-button" title="Attach files">
                      <Paperclip size={18} />
                      <input type="file" multiple onChange={(event) => {
                        void addInternalAttachments(event.currentTarget.files);
                        event.currentTarget.value = "";
                      }} />
                    </label>
                    <div className="composer-input-stack">
                      <textarea
                        value={internalDraft}
                        onChange={(event) => setInternalDraft(event.target.value)}
                        onKeyDown={handleInternalComposerKeyDown}
                        placeholder={internalAudience === "admin" ? "Message owners and admins..." : internalAudience === "direct" ? `Message ${selectedInternalRecipient?.name ?? "a team member"}...` : "Message the team..."}
                      />
                      {internalAttachments.length > 0 && (
                        <div className="composer-attachments">
                          {internalAttachments.map((attachment) => (
                            <button key={attachment.name} type="button" onClick={() => removeInternalAttachment(attachment.name)}>
                              <Paperclip size={13} /> {attachment.name} <span>×</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button className="primary" type="submit" disabled={(!internalDraft.trim() && !internalAttachments.length) || (internalAudience === "direct" && !selectedInternalRecipient)}>Send</button>
                  </form>
                </div>
              </div>
            )}
          </section>
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
                    {renderAddressAutocomplete({
                      lookupKey: "customer-create-address",
                      value: customerForm.street1,
                      placeholder: "Street address",
                      className: "span-2",
                      onChange: (value) => setCustomerForm((current) => ({ ...current, street1: value, latitude: "", longitude: "" })),
                      onSelect: (place) => setCustomerForm((current) => ({ ...current, ...placeToAddressPatch(place) }))
                    })}
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
                    <button className="outline-button" onClick={() => { setActiveView("estimates"); setEstimatePageMode("create"); setSelectedEstimateId(""); selectJobCustomer(selectedCustomer); }}><Plus size={17} /> Estimate</button>
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
                        <StreetViewPreview className="customer-map-placeholder" address={selectedCustomer.addresses?.[0]} fallback={addressLine(selectedCustomer.addresses?.[0])} />
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
                          {renderAddressAutocomplete({
                            lookupKey: "customer-profile-address",
                            value: customerAddressForm.street1,
                            placeholder: "Street address",
                            required: true,
                            onChange: (value) => setCustomerAddressForm((current) => ({ ...current, street1: value, latitude: "", longitude: "" })),
                            onSelect: (place) => setCustomerAddressForm((current) => ({ ...current, ...placeToAddressPatch(place) }))
                          })}
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

                {customerProfileTab === "estimates" && (
                  <section className="panel">
                    <div className="panel-header"><h2>Estimates</h2><FileText size={18} /></div>
                    <div className="profile-table">
                      {selectedCustomerEstimates.map((estimate) => (
                        <article key={estimate.id} role="button" tabIndex={0} onClick={() => { setSelectedEstimateId(estimate.id); setEstimatePageMode("list"); setActiveView("estimates"); }}>
                          <strong>Estimate #{estimate.estimateNumber} {estimate.title}</strong>
                          <span>{formatDate(estimate.createdAt)} / {statusLabel(estimate.status)}</span>
                          <span>{money.format(estimateTotal(estimate) / 100)}</span>
                        </article>
                      ))}
                      {selectedCustomerEstimates.length === 0 && <p className="empty">No estimates for this customer yet.</p>}
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

                {(customerProfileTab === "notes" || customerProfileTab === "leads") && (
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
                      <button className="primary" type="button" onClick={() => openJobInvoice(selectedJob)}><ReceiptText size={17} /> Invoice</button>
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
                        <StreetViewPreview address={selectedJob.address ?? selectedJob.customer.addresses?.[0]} fallback={selectedJob.address?.city || selectedJob.customer.addresses?.[0]?.city || "Service area"} />
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
                        <div className="typeahead detail-typeahead">
                          <form className="detail-inline-form single" onSubmit={(event) => { event.preventDefault(); saveJobDetailLeadSource(selectedJob); }}>
                            <input
                              value={detailLeadSource}
                              onFocus={() => setDetailLeadFocused(true)}
                              onChange={(event) => { setDetailLeadSource(event.target.value); setDetailLeadFocused(true); }}
                              onBlur={() => {
                                window.setTimeout(() => setDetailLeadFocused(false), 150);
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
                          {detailLeadFocused && detailLeadSuggestions.length > 0 && (
                            <div className="typeahead-results">
                              {detailLeadSuggestions.map((source) => (
                                <button type="button" key={source} onMouseDown={(event) => event.preventDefault()} onClick={() => selectJobDetailLeadSource(selectedJob, source)}>
                                  <strong>{source}</strong>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
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
                        <button type="button" onClick={() => openJobInvoice(selectedJob)}><ReceiptText size={22} /><strong>Invoice</strong><span>{selectedJobInvoice ? `#${selectedJobInvoice.invoiceNumber}` : "Create draft"}</span></button>
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
                        {detailSavedMessage === "Summary of work saved" && <p className="inline-confirm">Saved</p>}
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Appointments <span className="count-chip">{selectedJob.scheduledStart ? 1 : 0}</span></h2><button className="outline-button" type="button" onClick={() => addAppointmentForJob(selectedJob)}><Plus size={17} /> Appointment</button></div>
                        <div className="appointment-table">
                          <span>#</span><span>Date</span><span>Time</span><span>Arrival window</span><span>Employees</span><span>Edit</span><span>More</span>
                          {selectedJob.scheduledStart ? (
                            <>
                              <strong>1</strong>
                              <strong>{new Date(selectedJob.scheduledStart).toLocaleDateString([], { weekday: "short", month: "2-digit", day: "2-digit", year: "numeric" })}</strong>
                              <strong>{new Date(selectedJob.scheduledStart).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{selectedJob.scheduledEnd ? ` - ${new Date(selectedJob.scheduledEnd).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}</strong>
                              <strong>1h</strong>
                              <strong className="appointment-employee-cell">
                                <select value={selectedJob.technician?.id ?? ""} onChange={(event) => assignJobTechnician(selectedJob, event.target.value)} aria-label="Appointment employee">
                                  <option value="">Unassigned</option>
                                  {technicians.filter((tech) => tech.active && tech.fieldTech).map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
                                </select>
                              </strong>
                              <strong>
                                <button className="icon-button appointment-row-button" type="button" onClick={() => openAppointmentEditor(selectedJob)} aria-label="Edit appointment">
                                  <CalendarDays size={17} />
                                </button>
                              </strong>
                              <strong className="appointment-menu-cell">
                                <button className="icon-button appointment-row-button" type="button" onClick={() => setAppointmentMenuOpen((open) => !open)} aria-label="Appointment actions">
                                  <MoreHorizontal size={18} />
                                </button>
                                {appointmentMenuOpen && (
                                  <div className="appointment-menu">
                                    <button type="button" onClick={() => sendAppointmentOmw(selectedJob)}><Navigation size={17} /> Send OMW</button>
                                    <button className="danger" type="button" onClick={() => deleteAppointment(selectedJob)}><Trash2 size={17} /> Delete</button>
                                  </div>
                                )}
                              </strong>
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
                            <button className="outline-button" type="button" onClick={() => openJobInvoice(selectedJob)}>{selectedJobInvoice ? "View invoice" : "Create invoice"}</button>
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

                      <section className="panel line-items-panel job-detail-line-items">
                        <div className="line-items-header">
                          <h2>Line Items</h2>
                          <div className="action-buttons">
                            <button className="outline-button" type="button" onClick={() => openJobLineDialog("service")}><Plus size={16} /> Service</button>
                            <button className="outline-button" type="button" onClick={() => openJobLineDialog("material")}><Plus size={16} /> Material</button>
                          </div>
                        </div>
                        {(["service", "material"] as const).map((category) => {
                          const items = (selectedJob.lineItems ?? []).filter((item) => item.category === category);
                          return (
                            <div className="line-category" key={category}>
                              <div className="line-category-head">
                                <strong>{category === "service" ? "Services" : "Materials"}</strong>
                                <button className="text-add-button" type="button" onClick={() => openJobLineDialog(category)}>
                                  <Plus size={16} /> Add {category}
                                </button>
                              </div>
                              {items.map((item) => {
                                const total = Number(item.quantity || "0") * item.unitPrice;
                                return (
                                  <article className="line-item-row detail-line-item-row" key={item.id}>
                                    <div>
                                      <strong>{item.name}</strong>
                                      {item.description && <span>{item.description}</span>}
                                      {item.unitCost ? <small>Unit cost {money.format(item.unitCost / 100)}</small> : null}
                                    </div>
                                    <span>{category === "material" && item.taxable !== false ? "Taxable material" : category === "material" ? "Non-taxable material" : "Service"}</span>
                                    <span>Qty {item.quantity}</span>
                                    <strong>{money.format(item.unitPrice / 100)}</strong>
                                    <strong>{money.format(total / 100)}</strong>
                                    <div className="icon-actions">
                                      <button className="icon-button" type="button" aria-label={`Edit ${item.name}`} onClick={() => openJobLineDialog(category, item)}><Pencil size={16} /></button>
                                      <button className="icon-button danger" type="button" aria-label={`Delete ${item.name}`} onClick={() => deleteJobLineItem(selectedJob, item)}><Trash2 size={16} /></button>
                                    </div>
                                  </article>
                                );
                              })}
                              {!items.length && <p className="empty line-empty">No {category} line items yet.</p>}
                            </div>
                          );
                        })}
                        <div className="line-category-head">
                          <button className="text-add-button" type="button" onClick={() => {
                            openJobLineDialog("service");
                            setJobLineForm((current) => ({ ...current, name: "Discount", search: "Discount", unitPrice: "0.00" }));
                          }}>Add discount</button>
                          <button className="text-add-button" type="button" onClick={() => openJobPayment(selectedJob)}>Add deposit</button>
                          <button className="text-add-button" type="button" onClick={() => {
                            openJobLineDialog("service");
                            setJobLineForm((current) => ({ ...current, name: "Service plan", search: "Service plan" }));
                          }}>Add service plan</button>
                        </div>
                        <div className="totals-box">
                          <span><span>Subtotal</span><strong>{money.format(calculateJobLineSubtotal(selectedJob) / 100)}</strong></span>
                          <span><span>Tax rate <em>Materials only</em></span><strong>{money.format(calculateJobLineTax(selectedJob) / 100)}</strong></span>
                          <span className="grand-total"><span>Total</span><strong>{money.format((calculateJobLineSubtotal(selectedJob) + calculateJobLineTax(selectedJob)) / 100)}</strong></span>
                        </div>
                        {["Line item added", "Line item updated", "Line item deleted"].includes(detailSavedMessage) && <p className="inline-confirm line-save-confirm">{detailSavedMessage}</p>}
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Private Notes</h2><button className="text-button" type="button" onClick={() => addJobPrivateNote(selectedJob)}>Add note</button></div>
                        <textarea
                          className="detail-textarea compact"
                          placeholder="Add an internal private note"
                          value={detailPrivateNote}
                          onChange={(event) => setDetailPrivateNote(event.target.value)}
                        />
                        {detailSavedMessage === "Private note added" && <p className="inline-confirm">Private note added</p>}
                        <div className="job-note-list">
                          {(selectedJob.notes ?? []).filter((note) => note.author !== "System").map((note) => (
                            <article key={note.id}>
                              <strong>{note.author}</strong>
                              <span>{formatDateTime(note.createdAt)}</span>
                              <p>{note.content}</p>
                            </article>
                          ))}
                          {selectedJob.internalNotes && (
                            <article>
                              <strong>Legacy private notes</strong>
                              <span>Imported note</span>
                              <p>{selectedJob.internalNotes}</p>
                            </article>
                          )}
                          {!selectedJob.internalNotes && !(selectedJob.notes ?? []).some((note) => note.author !== "System") && <p className="empty">No private notes yet.</p>}
                        </div>
                      </section>

                      <section className="panel">
                        <div className="panel-header"><h2>Activity Feed</h2><MoreHorizontal size={18} /></div>
                        <div className="activity-feed">
                          <article><Wrench size={17} /><div><strong>Job #{selectedJob.jobNumber} created</strong><span>{formatDateTime(selectedJob.createdAt)} / total = {money.format(jobInvoiceTotal(selectedJob) / 100)}</span></div></article>
                          {selectedJob.scheduledStart && <article><CalendarDays size={17} /><div><strong>Job scheduled</strong><span>{formatDateTime(selectedJob.scheduledStart)}</span></div></article>}
                          {selectedJob.technician && <article><UserPlus size={17} /><div><strong>Assigned to {selectedJob.technician.name}</strong><span>{formatDateTime(selectedJob.createdAt)}</span></div></article>}
                          {(selectedJob.notes ?? []).map((note) => <article key={note.id}><StickyNote size={17} /><div><strong>{note.author}</strong><span>{formatDateTime(note.createdAt)}</span><p>{note.content}</p></div></article>)}
                          {selectedJobInvoice && <article><ReceiptText size={17} /><div><strong>Invoice #{selectedJobInvoice.invoiceNumber} linked</strong><span>{formatDateTime(selectedJobInvoice.createdAt)}</span></div></article>}
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
                        <StreetViewPreview
                          className="job-customer-map"
                          address={selectedJobCustomer.addresses?.find((address) => address.id === jobForm.addressId) ?? selectedJobCustomer.addresses?.[0]}
                          fallback={selectedJobCustomer.addresses?.[0]?.city || "Service address"}
                        />
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
                        {renderAddressAutocomplete({
                          lookupKey: "job-inline-address",
                          value: jobClientForm.street1,
                          placeholder: "Street address",
                          className: "span-2",
                          required: true,
                          onChange: (value) => setJobClientForm((current) => ({ ...current, street1: value, latitude: "", longitude: "" })),
                          onSelect: (place) => setJobClientForm((current) => ({ ...current, ...placeToAddressPatch(place) }))
                        })}
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

        {activeView === "estimates" && (
          estimatePageMode === "create" ? (
            <section className="jobs-page job-create-page">
              <div className="section-actions">
                <div className="breadcrumb"><FileText size={17} /> Estimates / New Estimate</div>
                <div className="action-buttons">
                  <select value={jobTemplateId} onChange={(event) => applyJobTemplate(event.target.value)} aria-label="Estimate template">
                    <option value="">Estimate Template</option>
                    {jobTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
                  </select>
                  <button className="outline-button" type="button" onClick={() => setEstimatePageMode("list")}>Back to Estimates</button>
                  <button className="primary" type="submit" form="create-estimate-form">Save Estimate</button>
                </div>
              </div>

              <form id="create-estimate-form" className="job-create-layout compact-job-create" onSubmit={createEstimate}>
                <div className="job-create-column">
                  <section className="panel job-side-card">
                    <div className="panel-header"><h2><Users size={18} /> Customer</h2>{selectedJobCustomer && <button className="text-button" type="button" onClick={clearJobCustomer}>Clear</button>}</div>
                    {!createClientInline && !selectedJobCustomer && (
                      <div className="record-form">
                        <div className="typeahead">
                          <input placeholder="Name, email, phone or address" value={jobClientSearch} onChange={(event) => {
                            setJobClientSearch(event.target.value);
                            setJobForm({ ...jobForm, customerId: "", addressId: "" });
                            setJobAddressSearch("");
                          }} />
                          {jobClientSearch && !jobForm.customerId && (
                            <div className="typeahead-results">
                              {clientMatches.map((customer) => (
                                <button type="button" key={customer.id} onClick={() => selectJobCustomer(customer)}>
                                  <strong>{customerName(customer)}</strong>
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
                        <StreetViewPreview
                          className="job-customer-map"
                          address={selectedJobCustomer.addresses?.find((address) => address.id === jobForm.addressId) ?? selectedJobCustomer.addresses?.[0]}
                          fallback={selectedJobCustomer.addresses?.[0]?.city || "Service address"}
                        />
                        <div className="job-customer-body">
                          <div className="job-customer-title"><strong>{customerName(selectedJobCustomer)}</strong><button className="outline-button" type="button" onClick={() => openCustomerProfile(selectedJobCustomer)}>View details</button></div>
                          <p>{addressLine(selectedJobCustomer.addresses?.find((address) => address.id === jobForm.addressId) ?? selectedJobCustomer.addresses?.[0])}</p>
                          <p><Phone size={16} /> {selectedJobCustomer.phone}</p>
                          {selectedJobCustomer.email && <p><Mail size={16} /> {selectedJobCustomer.email}</p>}
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
                        {renderAddressAutocomplete({
                          lookupKey: "estimate-inline-address",
                          value: jobClientForm.street1,
                          placeholder: "Street address",
                          className: "span-2",
                          onChange: (value) => setJobClientForm((current) => ({ ...current, street1: value, latitude: "", longitude: "" })),
                          onSelect: (place) => setJobClientForm((current) => ({ ...current, ...placeToAddressPatch(place) }))
                        })}
                        <input placeholder="City" value={jobClientForm.city} onChange={(event) => setJobClientForm({ ...jobClientForm, city: event.target.value })} />
                        <input placeholder="State" value={jobClientForm.state} onChange={(event) => setJobClientForm({ ...jobClientForm, state: event.target.value })} />
                        <input placeholder="Postal code" value={jobClientForm.postalCode} onChange={(event) => setJobClientForm({ ...jobClientForm, postalCode: event.target.value })} />
                      </div>
                    )}
                    <div className="or-divider">OR</div>
                    <button className="primary centered-action" type="button" onClick={() => {
                      setCreateClientInline((current) => !current);
                      setJobForm((current) => ({ ...current, customerId: "", addressId: "" }));
                      setJobClientSearch("");
                      setJobAddressSearch("");
                    }}><Plus size={18} /> {createClientInline ? "Select Existing Client" : "Create New Client"}</button>
                  </section>

                  <section className="panel schedule-card">
                    <div className="panel-header"><h2><CalendarDays size={19} /> Visit Window</h2><Pencil size={18} /></div>
                    <div className="schedule-compact">
                      <div className="schedule-row"><span>From</span><input type="date" value={jobForm.scheduledStart.slice(0, 10)} onChange={(event) => {
                        const time = jobForm.scheduledStart.slice(11) || "10:00";
                        setJobForm({ ...jobForm, scheduledStart: `${event.target.value}T${time}` });
                      }} /><input type="time" value={jobForm.scheduledStart.slice(11) || "10:00"} onChange={(event) => {
                        const date = jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                        setJobForm({ ...jobForm, scheduledStart: `${date}T${event.target.value}` });
                      }} /></div>
                      <div className="schedule-row"><span>To</span><input type="date" value={(jobForm.scheduledEnd || jobForm.scheduledStart).slice(0, 10)} onChange={(event) => {
                        const time = jobForm.scheduledEnd.slice(11) || "11:00";
                        setJobForm({ ...jobForm, scheduledEnd: `${event.target.value}T${time}` });
                      }} /><input type="time" value={jobForm.scheduledEnd.slice(11) || "11:00"} onChange={(event) => {
                        const date = jobForm.scheduledEnd.slice(0, 10) || jobForm.scheduledStart.slice(0, 10) || new Date().toISOString().slice(0, 10);
                        setJobForm({ ...jobForm, scheduledEnd: `${date}T${event.target.value}` });
                      }} /></div>
                      <div className="schedule-team-row"><Users size={21} /><select value={jobForm.technicianId} onChange={(event) => setJobForm({ ...jobForm, technicianId: event.target.value })}><option value="">Edit team</option>{technicians.filter((tech) => tech.active && tech.fieldTech).map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></div>
                    </div>
                  </section>
                </div>

                <div className="job-main-column">
                  <section className="panel private-note-panel">
                    <div className="panel-header"><h2><StickyNote size={18} /> Estimate notes</h2></div>
                    <textarea placeholder="Private/internal notes for this estimate" value={jobForm.internalNotes} onChange={(event) => setJobForm({ ...jobForm, internalNotes: event.target.value })} />
                  </section>
                  <section className="panel job-detail-card">
                    <div className="record-form compact-fields">
                      <label>Estimate Title<input value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} placeholder="Residential rekey, commercial repair" required /></label>
                      <label>Job Type<input list="job-type-options" value={jobForm.jobType} onChange={(event) => setJobForm({ ...jobForm, jobType: event.target.value })} onBlur={() => saveJobOption("jobType", jobForm.jobType).catch(() => undefined)} required /></label>
                      <label>Lead Source<input list="lead-source-options" value={jobForm.leadSource} onChange={(event) => setJobForm({ ...jobForm, leadSource: event.target.value })} onBlur={() => addJobLeadSource(jobForm.leadSource).catch(() => undefined)} /></label>
                      <label>Description<input placeholder="Visible estimate description" value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} /></label>
                    </div>
                    <div className="tag-editor estimate-tag-editor">
                      <div className="tag-list">{splitTags(jobForm.tags).map((tag) => <button type="button" key={tag} onClick={() => setJobForm({ ...jobForm, tags: splitTags(jobForm.tags).filter((item) => item !== tag).join(", ") })}>{tag}</button>)}</div>
                      <input list="tag-options" placeholder="Tags (press enter)" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addJobTag(tagDraft).catch((err: Error) => setError(err.message));
                        }
                      }} />
                    </div>
                  </section>
                  <section className="panel line-items-panel">
                    <div className="line-items-header"><h2>Line items</h2><FileText size={18} /></div>
                    {(["service", "material"] as const).map((category) => (
                      <div className="line-category" key={category}>
                        <div className="line-category-head"><strong>{category === "service" ? "Services" : "Materials"}</strong><div className="line-actions"><select onChange={(event) => { addPriceBookItemToJob(event.target.value); event.currentTarget.value = ""; }}><option value="">Add from price book</option>{priceBookItems.filter((item) => item.itemType === category).map((item) => <option key={item.id} value={item.id}>{item.name} / {money.format(item.price / 100)}</option>)}</select><button type="button" className="text-add-button" onClick={() => addJobLine(category)}><Plus size={18} /> Add {category}</button></div></div>
                        {jobLines.filter((item) => item.category === category).map((item) => (
                          <div className="line-item-row" key={item.id}>
                            <input placeholder="Name" value={item.name} onChange={(event) => updateJobLine(item.id, { name: event.target.value })} />
                            <input placeholder="Description" value={item.description} onChange={(event) => updateJobLine(item.id, { description: event.target.value })} />
                            <input placeholder="Qty" value={item.quantity} onChange={(event) => updateJobLine(item.id, { quantity: event.target.value })} />
                            <input placeholder="Price" value={item.unitPrice} onChange={(event) => updateJobLine(item.id, { unitPrice: event.target.value })} />
                            <label className="line-tax-toggle"><input type="checkbox" checked={item.category === "material" && item.taxable !== false} disabled={item.category !== "material"} onChange={(event) => updateJobLine(item.id, { taxable: event.target.checked })} /> Taxable</label>
                            <button type="button" className="text-button" onClick={() => setJobLines((current) => current.filter((line) => line.id !== item.id))}><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                    ))}
                    <div className="totals-box"><span>Subtotal <strong>{money.format(jobLineSubtotal / 100)}</strong></span><span>Tax rate <em>Taxable materials (9.4%)</em> <strong>{money.format(jobLineTax / 100)}</strong></span><span className="grand-total">Estimate total <strong>{money.format(jobLineTotal / 100)}</strong></span></div>
                  </section>
                  <section className="panel">
                    <div className="panel-header"><h2>Deposit request</h2><CreditCard size={18} /></div>
                    <div className="record-form compact-fields">
                      <label>Down payment
                        <select value={jobForm.depositType} onChange={(event) => setJobForm({ ...jobForm, depositType: event.target.value as "NONE" | "PERCENT" | "FIXED" })}>
                          <option value="NONE">No deposit required</option>
                          <option value="PERCENT">Percentage down</option>
                          <option value="FIXED">Custom dollar amount</option>
                        </select>
                      </label>
                      {jobForm.depositType === "PERCENT" && (
                        <label>Deposit percent
                          <input value={jobForm.depositPercent} onChange={(event) => setJobForm({ ...jobForm, depositPercent: event.target.value })} placeholder="50" inputMode="numeric" />
                        </label>
                      )}
                      {jobForm.depositType === "FIXED" && (
                        <label>Deposit amount
                          <input value={jobForm.depositAmount} onChange={(event) => setJobForm({ ...jobForm, depositAmount: event.target.value })} placeholder="250.00" inputMode="decimal" />
                        </label>
                      )}
                    </div>
                    <div className="totals-box">
                      <span>Estimate total <strong>{money.format(jobLineTotal / 100)}</strong></span>
                      <span className="grand-total">Deposit due <strong>{money.format((jobForm.depositType === "PERCENT" ? Math.round(jobLineTotal * (Number(jobForm.depositPercent || "50") / 100)) : jobForm.depositType === "FIXED" ? Math.min(dollarsToCents(jobForm.depositAmount), jobLineTotal) : 0) / 100)}</strong></span>
                    </div>
                  </section>
                </div>
              </form>
            </section>
          ) : (
            <section className="jobs-page">
              <div className="section-actions">
                <div className="breadcrumb"><FileText size={17} /> {selectedEstimate ? `Estimates / #${selectedEstimate.estimateNumber}` : "Estimates"}</div>
                <div className="action-buttons">
                  {selectedEstimate && <button className="outline-button" type="button" onClick={() => setSelectedEstimateId("")}>All Estimates</button>}
                  <button className="primary" onClick={() => { setSelectedEstimateId(""); setEstimatePageMode("create"); }}><Plus size={18} /> Create Estimate</button>
                </div>
              </div>

              {selectedEstimate ? (
                <div className="job-detail-view">
                  <section className="job-detail-titlebar">
                    <div>
                      <span className="breadcrumb">Customers / {customerName(selectedEstimate.customer)} / Estimates / Estimate #{selectedEstimate.estimateNumber}</span>
                      <h1>Estimate #{selectedEstimate.estimateNumber} • {selectedEstimate.title}</h1>
                      <span className={`status-pill job-status-${selectedEstimate.status.toLowerCase()}`}>{statusLabel(selectedEstimate.status)}</span>
                      <span className={`status-pill job-status-${(selectedEstimate.workflowStatus ?? "DRAFT").toLowerCase()}`}>{estimateWorkflowLabel(selectedEstimate.workflowStatus)}</span>
                    </div>
                    <div className="job-detail-actions">
                      <button className="outline-button" type="button" onClick={() => window.open(`/estimate/${selectedEstimate.estimateNumber}`, "_blank", "noopener,noreferrer")}>View customer link</button>
                      <button className="primary" type="button" onClick={() => openEstimateSendDialog(selectedEstimate)}>Send estimate</button>
                      <button className="outline-button" type="button" onClick={() => declineEstimate(selectedEstimate)}>Decline</button>
                      <button className="primary" type="button" onClick={() => approveEstimate(selectedEstimate)}>Approve</button>
                      <button className="primary" type="button" disabled={selectedEstimate.workflowStatus !== "FINISHED" && selectedEstimate.status !== "APPROVED"} onClick={() => convertEstimateToJob(selectedEstimate)}>Copy to job</button>
                    </div>
                  </section>
                  {estimateActionMessage && <p className="inline-confirm">{estimateActionMessage}</p>}
                  <div className="job-detail-layout">
                    <aside className="job-detail-side">
                      <section className="panel job-detail-customer">
                        <div className="panel-header"><h2><Users size={18} /> Customer</h2><button className="outline-button" type="button" onClick={() => openCustomerProfile(selectedEstimate.customer)}>View details</button></div>
                        <StreetViewPreview address={selectedEstimate.address ?? selectedEstimate.customer.addresses?.[0]} fallback={selectedEstimate.address?.city || selectedEstimate.customer.addresses?.[0]?.city || "Service area"} />
                        <h3>{customerName(selectedEstimate.customer)}</h3>
                        <p><MapPin size={16} /> {addressLine(selectedEstimate.address ?? selectedEstimate.customer.addresses?.[0])}</p>
                        <p><Phone size={16} /> {selectedEstimate.customer.phone}</p>
                        {selectedEstimate.customer.email && <p><Mail size={16} /> {selectedEstimate.customer.email}</p>}
                      </section>
                    </aside>
                    <main className="job-detail-main">
                      <section className="panel job-workflow-panel">
                        <div className="panel-header"><h2>Estimate workflow</h2><ListChecks size={18} /></div>
                        <div className="workflow-steps">
                          {[
                            ["SCHEDULED", "Scheduled"],
                            ["EN_ROUTE", "En route"],
                            ["FINISHED", "Finished"]
                          ].map(([workflowStatus, label]) => (
                            <button
                              key={workflowStatus}
                              className={selectedEstimate.workflowStatus === workflowStatus ? "active" : ""}
                              type="button"
                              onClick={() => updateEstimateWorkflow(selectedEstimate, workflowStatus as Estimate["workflowStatus"])}
                            >
                              <strong>{label}</strong>
                              <span>{workflowStatus === "SCHEDULED" ? "Estimate visit booked" : workflowStatus === "EN_ROUTE" ? "On the way to estimate" : "Ready to copy into job"}</span>
                            </button>
                          ))}
                        </div>
                      </section>
                      <section className="panel">
                        <div className="panel-header"><h2>Summary of work</h2><StickyNote size={18} /></div>
                        <textarea
                          className="detail-textarea compact"
                          value={detailSummary || selectedEstimate.description || ""}
                          onChange={(event) => setDetailSummary(event.target.value)}
                          placeholder="Summarize what the quote is about and what you found."
                        />
                        <div className="action-buttons"><button className="primary" type="button" onClick={() => updateEstimate(selectedEstimate, { description: detailSummary || selectedEstimate.description || "" })}>Save summary</button></div>
                      </section>
                      <section className="panel">
                        <div className="panel-header"><h2>Estimate options</h2><button className="text-button" type="button" onClick={() => addEstimateOption(selectedEstimate)}>Create another option</button></div>
                        <div className="profile-table">
                          {(selectedEstimate.options?.length ? selectedEstimate.options : [{ id: "default", title: selectedEstimate.title, description: selectedEstimate.description, sortOrder: 0, lineItems: selectedEstimate.lineItems ?? [] }]).map((option, index) => (
                            <article key={option.id}>
                              <strong>{option.title || `Option #${index + 1}`}{selectedEstimate.approvedOptionId === option.id ? " / Approved" : ""}</strong>
                              <span>{option.description || "No option description yet."}</span>
                              <span>{money.format(estimateOptionTotal(option) / 100)} / {(option.lineItems ?? []).length} line item{(option.lineItems ?? []).length === 1 ? "" : "s"}</span>
                            </article>
                          ))}
                        </div>
                      </section>
                      <section className="panel approval-panel">
                        <div className="panel-header"><h2>Customer approval</h2><CheckCheck size={18} /></div>
                        {selectedEstimate.approvalSignature ? (
                          <div className="signature-result">
                            <img src={selectedEstimate.approvalSignature} alt="Customer approval signature" />
                            <span>Approved by {selectedEstimate.approvalName || customerName(selectedEstimate.customer)} on {formatDateTime(selectedEstimate.approvedAt)}</span>
                            {selectedEstimate.approvalIpAddress && <span>IP address: {selectedEstimate.approvalIpAddress}</span>}
                          </div>
                        ) : (
                          <>
                            <input placeholder="Signer name" value={signatureName} onChange={(event) => setSignatureName(event.target.value)} />
                            <canvas
                              ref={signatureCanvasRef}
                              className="signature-pad"
                              width={720}
                              height={220}
                              onPointerDown={beginSignature}
                              onPointerMove={drawSignature}
                              onPointerUp={endSignature}
                              onPointerCancel={endSignature}
                            />
                            <div className="action-buttons"><button className="outline-button" type="button" onClick={clearSignature}>Clear signature</button><button className="primary" type="button" onClick={() => approveEstimate(selectedEstimate)}>Approve estimate</button></div>
                          </>
                        )}
                        {selectedEstimate.status === "DECLINED" && <p className="inline-confirm danger">This estimate was declined on {formatDateTime(selectedEstimate.declinedAt)}.</p>}
                      </section>
                      <section className="panel invoice-summary-card">
                        <div className="panel-header"><h2>Estimate line items</h2><ReceiptText size={18} /></div>
                        <div className="profile-table">
                          {(selectedEstimate.lineItems ?? []).map((item) => <article key={item.id}><strong>{item.name}</strong><span>{item.category} / Qty {item.quantity} / {money.format(item.unitPrice / 100)}</span></article>)}
                          {!(selectedEstimate.lineItems?.length) && <p className="empty">No line items on this estimate yet.</p>}
                        </div>
                        <div className="invoice-lines">
                          <span>Subtotal</span><strong>{money.format(calculateEstimateSubtotal(selectedEstimate) / 100)}</strong>
                          <span>Tax</span><strong>{money.format(calculateEstimateTax(selectedEstimate) / 100)}</strong>
                          {estimateDepositDue(selectedEstimate) > 0 && (
                            <>
                              <span>Deposit due</span><strong>{money.format(estimateDepositDue(selectedEstimate) / 100)}</strong>
                            </>
                          )}
                          <span>Total</span><strong>{money.format(estimateTotal(selectedEstimate) / 100)}</strong>
                        </div>
                      </section>
                      <section className="panel">
                        <div className="panel-header"><h2>Deposit terms</h2><CreditCard size={18} /></div>
                        <div className="record-form compact-fields">
                          <label>Down payment
                            <select value={estimateDepositDraft.type} onChange={(event) => setEstimateDepositDraft((current) => ({ ...current, type: event.target.value as "NONE" | "PERCENT" | "FIXED" }))}>
                              <option value="NONE">No deposit required</option>
                              <option value="PERCENT">Percentage down</option>
                              <option value="FIXED">Custom dollar amount</option>
                            </select>
                          </label>
                          {estimateDepositDraft.type === "PERCENT" && (
                            <label>Deposit percent
                              <input value={estimateDepositDraft.percent} onChange={(event) => setEstimateDepositDraft((current) => ({ ...current, percent: event.target.value }))} inputMode="numeric" />
                            </label>
                          )}
                          {estimateDepositDraft.type === "FIXED" && (
                            <label>Deposit amount
                              <input value={estimateDepositDraft.amount} onChange={(event) => setEstimateDepositDraft((current) => ({ ...current, amount: event.target.value }))} inputMode="decimal" />
                            </label>
                          )}
                        </div>
                        <div className="totals-box">
                          <span>Estimate total <strong>{money.format(estimateTotal(selectedEstimate) / 100)}</strong></span>
                          <span className="grand-total">Deposit due <strong>{money.format((estimateDepositDraft.type === "PERCENT" ? Math.round(estimateTotal(selectedEstimate) * (Number(estimateDepositDraft.percent || "50") / 100)) : estimateDepositDraft.type === "FIXED" ? Math.min(dollarsToCents(estimateDepositDraft.amount), estimateTotal(selectedEstimate)) : 0) / 100)}</strong></span>
                        </div>
                        <div className="action-buttons"><button className="primary" type="button" onClick={() => saveEstimateDepositTerms(selectedEstimate)}>Save deposit terms</button></div>
                      </section>
                      <section className="panel">
                        <div className="panel-header"><h2>Estimate details</h2><FileText size={18} /></div>
                        <p>{selectedEstimate.description || "No visible description yet."}</p>
                        <div className="job-detail-tags">{(selectedEstimate.tags ?? []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                        <p className="muted">Flow: estimate approval creates the quote record; converting creates the job/work order. The invoice is generated from the job when you are ready to bill or take payment.</p>
                      </section>
                    </main>
                  </div>
                </div>
              ) : (
                <>
                  <div className="job-summary-panel">
                    {[
                      ["DRAFT", "Draft", estimateCounts.draft],
                      ["SENT", "Sent", estimateCounts.sent],
                      ["APPROVED", "Approved", estimateCounts.approved],
                      ["DECLINED", "Declined", estimateCounts.declined],
                      ["CONVERTED", "Converted", estimateCounts.converted]
                    ].map(([status, label, count]) => <button key={status} onClick={() => setEstimateStatusFilter(status as string)} className={estimateStatusFilter === status ? "selected" : ""}><FileText size={21} /><strong>{count}</strong><span>{label}</span></button>)}
                  </div>
                  <div className="jobs-table-panel">
                    <div className="jobs-tools"><div className="search-box table-search"><Search size={18} /><input placeholder="Search estimates, clients, addresses" value={estimateSearch} onChange={(event) => setEstimateSearch(event.target.value)} /></div><button className="outline-button" onClick={() => setEstimateStatusFilter("all")}>All</button></div>
                    <div className="jobs-table">
                      <div className="jobs-table-row jobs-table-head"><span>Estimate #</span><span>Client</span><span>Created</span><span>Address</span><span>Status</span><span>Total</span><span>Converted Job</span></div>
                      {filteredEstimates.map((estimate) => (
                        <div className="jobs-table-row clickable-row estimate-row" key={estimate.id} role="button" tabIndex={0} onClick={() => setSelectedEstimateId(estimate.id)}>
                          <strong>{estimate.estimateNumber}</strong>
                          <span>{customerName(estimate.customer)}</span>
                          <span>{formatDate(estimate.createdAt)}</span>
                          <span>{addressLine(estimate.address ?? estimate.customer.addresses?.[0])}</span>
                          <span className={`status-pill job-status-${estimate.status.toLowerCase()}`}>{statusLabel(estimate.status)} / {estimateWorkflowLabel(estimate.workflowStatus)}</span>
                          <strong>{money.format(estimateTotal(estimate) / 100)}</strong>
                          <span>{estimate.convertedJob ? `#${estimate.convertedJob.jobNumber}` : "-"}</span>
                        </div>
                      ))}
                      {filteredEstimates.length === 0 && <p className="empty table-empty">No estimates match this search.</p>}
                    </div>
                  </div>
                </>
              )}
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
                    <small className="employee-access-copy">
                      {employee.allLocations
                        ? "All locations"
                        : employee.locationAccess?.length
                          ? employee.locationAccess.map((location) => locationDisplayName(location)).join(", ")
                          : employee.userId ? "Current location" : "Roster only"}
                    </small>
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
              <section className="location-access-panel">
                <strong>Location Access</strong>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={employeeForm.allLocations}
                    disabled={!["OWNER", "ADMIN"].includes(employeeForm.role)}
                    onChange={(event) => setEmployeeForm({ ...employeeForm, allLocations: event.target.checked })}
                  />
                  All current and future locations
                </label>
                {!employeeForm.allLocations && (
                  <div className="location-access-list">
                    {locations.map((item) => (
                      <label key={item.location.id} className="location-access-option">
                        <input
                          type="checkbox"
                          checked={employeeForm.locationIds.includes(item.location.id)}
                          onChange={(event) => {
                            const nextLocationIds = event.target.checked
                              ? [...employeeForm.locationIds, item.location.id]
                              : employeeForm.locationIds.filter((id) => id !== item.location.id);
                            setEmployeeForm({ ...employeeForm, locationIds: nextLocationIds });
                          }}
                        />
                        {locationDisplayName(item.location)}
                      </label>
                    ))}
                  </div>
                )}
                <p>Super admins can use all locations. Staff can be limited to only the locations checked here.</p>
              </section>
              {employeeModal === "owner" && !employeeEditingId && (
                <>
                  <h3 className="modal-subhead">New Location</h3>
                  <div className="employee-form-grid">
                    <label>Location Name
                      <input value={employeeForm.locationName} onChange={(event) => setEmployeeForm({ ...employeeForm, locationName: event.target.value })} placeholder="San Diego" required />
                    </label>
                    <label>Switcher Name
                      <input value={employeeForm.locationDisplayName} onChange={(event) => setEmployeeForm({ ...employeeForm, locationDisplayName: event.target.value })} placeholder="San Diego" />
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
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("messagingSettings")}>
                    <span className="settings-icon pink"><MessageSquareText size={22} /></span>
                    <strong>SMS Notifications</strong>
                  </button>
                  <button type="button" className="settings-card" onClick={() => setSettingsSection("invoiceSettings")}>
                    <span className="settings-icon red"><CreditCard size={22} /></span>
                    <strong>Invoice Settings</strong>
                  </button>
                </div>

                <div className="settings-integrations">
                  <h2>Integrations</h2>
                  <div className="settings-grid compact">
                    <button type="button" className="settings-card"><span className="settings-icon green"><CalendarDays size={22} /></span><strong>Google</strong></button>
                    <button type="button" className="settings-card"><span className="settings-icon blue"><CreditCard size={22} /></span><strong>Quickbooks</strong></button>
                    <button type="button" className="settings-card" onClick={() => setSettingsSection("stripe")}><span className="settings-icon purple"><BadgeDollarSign size={22} /></span><strong>Stripe</strong></button>
                  </div>
                </div>
              </>
            ) : settingsSection === "messagingSettings" ? (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Communication</span>
                  <button className="active" onClick={() => setSettingsSection("messagingSettings")}>SMS Settings</button>
                  <button onClick={() => setActiveView("messages")}>Messages</button>
                  <span>Integrations</span>
                  <button onClick={() => setSettingsSection("stripe")}>Stripe</button>
                  <button onClick={() => setSettingsSection("invoiceSettings")}>Invoice Settings</button>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                </aside>

                <form className="settings-panel messaging-settings-panel" onSubmit={saveMessagingSettings}>
                  <div className="settings-panel-head">
                    <div>
                      <p className="settings-kicker">Messages</p>
                      <h2>SMS Settings</h2>
                      <p>VoIP.ms text messaging is configured separately for this active location.</p>
                    </div>
                    <button className="primary" type="submit">Save</button>
                  </div>

                  {messagingSettingsMessage && <p className="inline-confirm">{messagingSettingsMessage}</p>}

                  <section className="invoice-settings-card span-2">
                    <h3>VoIP.ms connection</h3>
                    <label className="setting-toggle-row">
                      <span>
                        <strong>Enable SMS for this location</strong>
                        <small>Automated and manual texts use this location's outbound DID.</small>
                      </span>
                      <input type="checkbox" checked={messagingSettings.smsEnabled} onChange={(event) => setMessagingSettings({ ...messagingSettings, smsEnabled: event.target.checked })} />
                    </label>
                    <div className="provider-grid">
                      <label>API username<input value={messagingSettings.username} onChange={(event) => setMessagingSettings({ ...messagingSettings, username: event.target.value })} /></label>
                      <label>API password<input type="password" value={messagingSettings.apiPassword} onChange={(event) => setMessagingSettings({ ...messagingSettings, apiPassword: event.target.value })} /></label>
                      <label>Outbound DID<input value={messagingSettings.defaultDid} onChange={(event) => setMessagingSettings({ ...messagingSettings, defaultDid: event.target.value })} placeholder="9285802775" /></label>
                      <label>Preferred area code<input value={messagingSettings.areaCode} onChange={(event) => setMessagingSettings({ ...messagingSettings, areaCode: event.target.value })} placeholder="928" /></label>
                      <label className="span-2">Available inbound DIDs<input value={messagingSettings.availableDids.join(", ")} onChange={(event) => setMessagingSettings({ ...messagingSettings, availableDids: event.target.value.split(",").map((did) => did.trim()).filter(Boolean) })} placeholder="9285802775, 7605551212" /></label>
                    </div>
                    <div className="settings-note">Inbound VoIP.ms webhooks are matched to this location by DID. Outbound texts use the outbound DID above.</div>
                  </section>

                  <section className="invoice-settings-card span-2">
                    <h3>Automation templates</h3>
                    <div className="template-settings-grid">
                      {(Object.keys(messagingTemplateLabels) as MessagingTemplateKey[]).map((key) => (
                        <div className="template-settings-card" key={key}>
                          <label className="setting-toggle-row">
                            <span>
                              <strong>{messagingTemplateLabels[key]}</strong>
                              <small>Send automatically when this workflow event happens.</small>
                            </span>
                            <input type="checkbox" checked={messagingSettings.autoSend[key]} onChange={(event) => updateMessagingAutoSend(key, event.target.checked)} />
                          </label>
                          <textarea value={messagingSettings.templates[key]} onChange={(event) => updateMessagingTemplate(key, event.target.value)} />
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="invoice-settings-card span-2">
                    <h3>Review email</h3>
                    <label className="setting-toggle-row">
                      <span>
                        <strong>Queue review email after completed jobs</strong>
                        <small>Email delivery can be connected later; the request is logged now.</small>
                      </span>
                      <input type="checkbox" checked={messagingSettings.reviewEmail.enabled} onChange={(event) => setMessagingSettings({ ...messagingSettings, reviewEmail: { ...messagingSettings.reviewEmail, enabled: event.target.checked } })} />
                    </label>
                    <label>Subject<input value={messagingSettings.reviewEmail.subject} onChange={(event) => setMessagingSettings({ ...messagingSettings, reviewEmail: { ...messagingSettings.reviewEmail, subject: event.target.value } })} /></label>
                    <label>Message<textarea value={messagingSettings.reviewEmail.body} onChange={(event) => setMessagingSettings({ ...messagingSettings, reviewEmail: { ...messagingSettings.reviewEmail, body: event.target.value } })} /></label>
                  </section>
                </form>
              </div>
            ) : settingsSection === "stripe" ? (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Integrations</span>
                  <button className="active" onClick={() => setSettingsSection("stripe")}>Stripe</button>
                  <button onClick={() => setSettingsSection("invoiceSettings")}>Invoice Settings</button>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                </aside>

                <div className="settings-panel stripe-settings-panel">
                  <div className="panel-header">
                    <div>
                      <span className="breadcrumb">Settings / Stripe Settings</span>
                      <h2>Connect with Stripe</h2>
                      <p className="muted">Stripe is connected separately for each location. Payments from this location's invoices will use this location's connected Stripe account.</p>
                    </div>
                  </div>

                  {stripeMessage && <div className="success-banner">{stripeMessage}</div>}

                  <div className="stripe-connect-row">
                    <div className="stripe-brand-row">
                      <span className="app-mark">A</span>
                      <span className="connection-arrow">{"->"}</span>
                      <strong className="stripe-wordmark">stripe</strong>
                    </div>
                    <div className="stripe-actions">
                      {!stripeStatus?.configured ? (
                        <span className="status-pill warning">Needs setup</span>
                      ) : stripeStatus.connected ? (
                        <>
                          <span className="status-pill connected">Connected</span>
                          <button className="danger-outline" type="button" onClick={disconnectStripe}>Disconnect</button>
                        </>
                      ) : (
                        <button className="primary" type="button" onClick={connectStripe}>Connect Stripe</button>
                      )}
                    </div>
                  </div>

                  <div className="stripe-manage-card">
                    <div>
                      <h3>{stripeStatus?.connected ? "Stripe account connected" : "Take online payments with Stripe"}</h3>
                      <p>{stripeStatus?.connected
                        ? "View your balance, payouts, banking details, and Stripe account settings from Stripe."
                        : "Connect this location to a Stripe account before sending payable invoices or collecting card payments."}</p>
                      {stripeStatus?.accountId && <code>{stripeStatus.accountId}</code>}
                    </div>
                    {stripeStatus?.connected ? (
                      <button className="outline-button" type="button" onClick={manageStripe}>Manage Stripe</button>
                    ) : (
                      <button className="outline-button" type="button" onClick={connectStripe} disabled={!stripeStatus?.configured}>Start setup</button>
                    )}
                  </div>

                  {stripeStatus?.connected && (
                    <div className="stripe-status-grid">
                      <div><span>Charges</span><strong>{stripeStatus.chargesEnabled ? "Enabled" : "Needs review"}</strong></div>
                      <div><span>Payouts</span><strong>{stripeStatus.payoutsEnabled ? "Enabled" : "Needs review"}</strong></div>
                      <div><span>Verification</span><strong>{stripeStatus.detailsSubmitted ? "Submitted" : "Incomplete"}</strong></div>
                    </div>
                  )}

                  {!stripeStatus?.configured && (
                    <div className="info-banner">
                      Start setup is locked until Render has `STRIPE_SECRET_KEY` and `STRIPE_CONNECT_CLIENT_ID`. In Stripe, configure the OAuth redirect URL as `{window.location.origin}/api/integrations/stripe/oauth/callback`.
                    </div>
                  )}
                </div>
              </div>
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
                      <label>Location Switcher Name
                        <input value={companySettingsForm.displayName} onChange={(event) => setCompanySettingsForm({ ...companySettingsForm, displayName: event.target.value })} placeholder="Yuma, San Diego, Phoenix..." />
                      </label>
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
            ) : settingsSection === "invoiceSettings" ? (
              <div className="settings-layout">
                <aside className="settings-menu">
                  <span>Global Settings</span>
                  <button onClick={() => setSettingsSection("company")}>Company</button>
                  <button onClick={() => setActiveView("api")}>API Access</button>
                  <button className="active" onClick={() => setSettingsSection("invoiceSettings")}>Invoices</button>
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

                <form className="invoice-settings-page settings-panel" onSubmit={saveInvoiceSettings}>
                  <div className="settings-panel-head">
                    <div>
                      <p className="settings-kicker">Invoices</p>
                      <h2>Invoice Settings</h2>
                      <p>Control how invoices look, what customers see, and the default email and SMS messages for this location.</p>
                    </div>
                    <button className="primary" type="submit">Save</button>
                  </div>

                  <div className="invoice-settings-tabs" role="tablist" aria-label="Invoice settings tabs">
                    {([
                      ["configuration", "Configuration"],
                      ["automation", "Automations"],
                      ["customerView", "Customer view"],
                      ["delivery", "Email and SMS"]
                    ] as const).map(([tab, label]) => (
                      <button
                        key={tab}
                        type="button"
                        className={invoiceSettings.tab === tab ? "active" : ""}
                        onClick={() => updateInvoiceSetting("tab", tab)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {invoiceSettingsMessage && <p className="inline-confirm">{invoiceSettingsMessage}</p>}

                  {invoiceSettings.tab === "configuration" && (
                    <div className="invoice-settings-grid">
                      <section className="invoice-settings-card span-2">
                        <h3>Brand and message</h3>
                        <div className="logo-row compact-logo-row">
                          <div className="logo-preview">{invoiceSettings.logoDataUrl ? <img src={invoiceSettings.logoDataUrl} alt="Invoice logo preview" /> : "A"}</div>
                          <div>
                            <strong>Invoice logo</strong>
                            <span>Uploads are saved into this location's invoice settings.</span>
                          </div>
                          <label className="outline-button file-button">Choose logo
                            <input type="file" accept="image/*" onChange={(event) => handleInvoiceLogoUpload(event.currentTarget.files?.[0])} />
                          </label>
                        </div>
                        <label>Invoice message
                          <textarea value={invoiceSettings.invoiceMessage} onChange={(event) => updateInvoiceSetting("invoiceMessage", event.target.value)} placeholder="Warranty, payment, and thank-you message printed on invoices." />
                        </label>
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Preferences</h3>
                        <label className="setting-toggle-row"><span><strong>Progressive invoicing</strong><small>Allow multiple invoices on one job.</small></span><input type="checkbox" checked={invoiceSettings.progressiveInvoicing} onChange={(event) => updateInvoiceSetting("progressiveInvoicing", event.target.checked)} /></label>
                        <label className="setting-toggle-row"><span><strong>Match invoice and job number</strong><small>Use the job number for future invoices.</small></span><input type="checkbox" checked={invoiceSettings.matchInvoiceAndJobNumber} onChange={(event) => updateInvoiceSetting("matchInvoiceAndJobNumber", event.target.checked)} /></label>
                        <label className="setting-toggle-row"><span><strong>Include images</strong><small>Show job photos on printed/downloaded invoices.</small></span><input type="checkbox" checked={invoiceSettings.includeImages} onChange={(event) => updateInvoiceSetting("includeImages", event.target.checked)} /></label>
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Payment options</h3>
                        <label className="setting-toggle-row"><span><strong>Accept credit card</strong><small>Show card payment as an option.</small></span><input type="checkbox" checked={invoiceSettings.acceptCreditCard} onChange={(event) => updateInvoiceSetting("acceptCreditCard", event.target.checked)} /></label>
                        <label className="setting-toggle-row"><span><strong>Save card on file</strong><small>Allow customers to keep a card for later.</small></span><input type="checkbox" checked={invoiceSettings.saveCardOnFile} onChange={(event) => updateInvoiceSetting("saveCardOnFile", event.target.checked)} /></label>
                        <label className="setting-toggle-row"><span><strong>Accept ACH</strong><small>Show bank payment as an option.</small></span><input type="checkbox" checked={invoiceSettings.acceptAch} onChange={(event) => updateInvoiceSetting("acceptAch", event.target.checked)} /></label>
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Tipping</h3>
                        <label className="setting-toggle-row"><span><strong>Accept tips</strong><small>Let customers add tips to online payments.</small></span><input type="checkbox" checked={invoiceSettings.acceptTips} onChange={(event) => updateInvoiceSetting("acceptTips", event.target.checked)} /></label>
                        <label className="setting-toggle-row"><span><strong>Separate tipping screen</strong><small>Ask for tips as a separate checkout step.</small></span><input type="checkbox" checked={invoiceSettings.separateTippingScreen} onChange={(event) => updateInvoiceSetting("separateTippingScreen", event.target.checked)} /></label>
                      </section>
                    </div>
                  )}

                  {invoiceSettings.tab === "automation" && (
                    <div className="invoice-settings-grid">
                      <section className="invoice-settings-card">
                        <h3>Invoice reminders</h3>
                        <p className="muted">Reminder settings are saved for this location. Delivery starts once an email provider is connected.</p>
                        <label className="setting-toggle-row"><span><strong>Send unpaid invoice reminders</strong><small>Use these rules when invoice email delivery is connected.</small></span><input type="checkbox" checked={invoiceSettings.autoReminders} onChange={(event) => updateInvoiceSetting("autoReminders", event.target.checked)} /></label>
                        <div className="inline-input-grid">
                          <label>Every
                            <input type="number" min="1" max="30" value={invoiceSettings.reminderCadenceDays} onChange={(event) => updateInvoiceSetting("reminderCadenceDays", Number(event.target.value))} />
                          </label>
                          <label>Max reminders
                            <input type="number" min="1" max="30" value={invoiceSettings.maxReminders} onChange={(event) => updateInvoiceSetting("maxReminders", Number(event.target.value))} />
                          </label>
                        </div>
                      </section>
                      <section className="invoice-settings-card">
                        <h3>Automatic payments</h3>
                        <label className="setting-toggle-row"><span><strong>Auto charge card on due date</strong><small>Uses saved Stripe cards once customer card storage is connected.</small></span><input type="checkbox" checked={invoiceSettings.autoChargeCard} onChange={(event) => updateInvoiceSetting("autoChargeCard", event.target.checked)} /></label>
                      </section>
                      <section className="invoice-settings-card span-2">
                        <h3>Reminder message</h3>
                        <label>Subject
                          <input value={invoiceSettings.reminderSubjectTemplate} onChange={(event) => updateInvoiceSetting("reminderSubjectTemplate", event.target.value)} />
                        </label>
                        <label>Body
                          <textarea value={invoiceSettings.reminderBodyTemplate} onChange={(event) => updateInvoiceSetting("reminderBodyTemplate", event.target.value)} />
                        </label>
                      </section>
                    </div>
                  )}

                  {invoiceSettings.tab === "customerView" && (
                    <div className="invoice-settings-grid">
                      <section className="invoice-settings-card">
                        <h3>Default terms</h3>
                        <label className="radio-row"><input type="radio" checked={invoiceSettings.defaultTermsType === "uponReceipt"} onChange={() => updateInvoiceSetting("defaultTermsType", "uponReceipt")} /> Upon receipt</label>
                        <label className="radio-row"><input type="radio" checked={invoiceSettings.defaultTermsType === "net"} onChange={() => updateInvoiceSetting("defaultTermsType", "net")} /> Net</label>
                        <input type="number" min="0" max="365" disabled={invoiceSettings.defaultTermsType !== "net"} value={invoiceSettings.defaultTermsDays} onChange={(event) => updateInvoiceSetting("defaultTermsDays", Number(event.target.value))} />
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Job and invoice</h3>
                        {([
                          ["showJobNumber", "Job number"],
                          ["showInvoiceNumber", "Invoice number"],
                          ["showServiceDate", "Service date"],
                          ["showInvoiceDate", "Invoice date"],
                          ["showSummaryOfWork", "Summary of work"]
                        ] as const).map(([key, label]) => (
                          <label className="check-row" key={key}><input type="checkbox" checked={invoiceSettings[key]} onChange={(event) => updateInvoiceSetting(key, event.target.checked)} /> {label}</label>
                        ))}
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Business and customer</h3>
                        {([
                          ["showBusinessName", "Business name"],
                          ["showTechnicianName", "Technician name"],
                          ["showCustomerDisplayName", "Customer display name"],
                          ["showCustomerCompanyName", "Customer company name"]
                        ] as const).map(([key, label]) => (
                          <label className="check-row" key={key}><input type="checkbox" checked={invoiceSettings[key]} onChange={(event) => updateInvoiceSetting(key, event.target.checked)} /> {label}</label>
                        ))}
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Services</h3>
                        {([
                          ["showServiceLineItems", "Line items"],
                          ["showServiceName", "Service name"],
                          ["showServiceDescription", "Description"],
                          ["showServiceQuantity", "Quantity"],
                          ["showServiceUnitPrice", "Unit price"],
                          ["showServiceAmount", "Line item amount"]
                        ] as const).map(([key, label]) => (
                          <label className="check-row" key={key}><input type="checkbox" checked={invoiceSettings[key]} onChange={(event) => updateInvoiceSetting(key, event.target.checked)} /> {label}</label>
                        ))}
                      </section>

                      <section className="invoice-settings-card">
                        <h3>Materials</h3>
                        {([
                          ["showMaterialLineItems", "Line items"],
                          ["showMaterialName", "Material name"],
                          ["showMaterialDescription", "Description"]
                        ] as const).map(([key, label]) => (
                          <label className="check-row" key={key}><input type="checkbox" checked={invoiceSettings[key]} onChange={(event) => updateInvoiceSetting(key, event.target.checked)} /> {label}</label>
                        ))}
                      </section>

                      <section className="invoice-settings-card">
                        <h3>View format</h3>
                        <label className="radio-row"><input type="radio" checked={invoiceSettings.customerViewFormat === "email"} onChange={() => updateInvoiceSetting("customerViewFormat", "email")} /> Email optimized</label>
                        <label className="radio-row"><input type="radio" checked={invoiceSettings.customerViewFormat === "envelope"} onChange={() => updateInvoiceSetting("customerViewFormat", "envelope")} /> Envelope optimized</label>
                      </section>

                      <section className="invoice-settings-card span-2">
                        <h3>Customer preview</h3>
                        <div className="invoice-setting-preview">
                          <div>
                            {renderInvoiceLogo()}
                            {invoiceSettings.showBusinessName && <strong>{activeLocationAccess?.organization.name || "Affordable Security Locksmith"}</strong>}
                            <p>{invoiceSettings.showCustomerDisplayName ? "John Doe" : ""}{invoiceSettings.showCustomerCompanyName ? "\nJohn's Company" : ""}<br />456 State St<br />California, CA 90265</p>
                          </div>
                          <dl>
                            {invoiceSettings.showJobNumber && <><dt>Job</dt><dd>#12</dd></>}
                            {invoiceSettings.showInvoiceNumber && <><dt>Invoice</dt><dd>#1012</dd></>}
                            {invoiceSettings.showServiceDate && <><dt>Service date</dt><dd>{formatDate(new Date().toISOString())}</dd></>}
                            {invoiceSettings.showInvoiceDate && <><dt>Invoice date</dt><dd>{formatDate(new Date().toISOString())}</dd></>}
                            <dt>Payment terms</dt><dd>{invoiceSettings.defaultTermsType === "uponReceipt" ? "Upon receipt" : `Net ${invoiceSettings.defaultTermsDays}`}</dd>
                            <dt>Amount due</dt><dd>$401.00</dd>
                          </dl>
                          <div className="invoice-setting-preview-lines">
                            {invoiceSettings.showServiceLineItems && (
                              <div>
                                <strong>Services</strong>
                                <span>{invoiceSettings.showServiceName ? "Sample service" : ""}</span>
                                <span>{invoiceSettings.showServiceDescription ? "In this sample service..." : ""}</span>
                                <span>{invoiceSettings.showServiceQuantity ? "Qty 1" : ""}</span>
                                <span>{invoiceSettings.showServiceUnitPrice ? "$390.00" : ""}</span>
                              </div>
                            )}
                            {invoiceSettings.showMaterialLineItems && (
                              <div>
                                <strong>Materials</strong>
                                <span>{invoiceSettings.showMaterialName ? "Material item" : ""}</span>
                                <span>{invoiceSettings.showMaterialDescription ? "Sample material" : ""}</span>
                                <span>Qty 2</span>
                                <span>$10.00</span>
                              </div>
                            )}
                            <div className="invoice-setting-preview-total"><span>Amount due</span><strong>$401.00</strong></div>
                          </div>
                        </div>
                      </section>
                    </div>
                  )}

                  {invoiceSettings.tab === "delivery" && (
                    <div className="invoice-settings-grid">
                      <section className="invoice-settings-card span-2">
                        <h3>Email preview</h3>
                        <label>Subject
                          <input value={invoiceSettings.emailSubjectTemplate} onChange={(event) => updateInvoiceSetting("emailSubjectTemplate", event.target.value)} />
                        </label>
                        <label>Body
                          <textarea value={invoiceSettings.emailBodyTemplate} onChange={(event) => updateInvoiceSetting("emailBodyTemplate", event.target.value)} />
                        </label>
                        <div className="template-token-row">
                          {["{{invoiceNumber}}", "{{companyName}}", "{{invoiceTotal}}", "{{customerFirstName}}", "{{invoiceDueTerms}}"].map((tokenValue) => <span className="template-token" key={tokenValue}>{tokenValue}</span>)}
                        </div>
                      </section>
                      <section className="invoice-settings-card span-2">
                        <h3>SMS preview</h3>
                        <textarea value={invoiceSettings.smsTemplate} onChange={(event) => updateInvoiceSetting("smsTemplate", event.target.value)} />
                      </section>
                    </div>
                  )}
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

        {appointmentDialogOpen && selectedJob && (
          <div className="modal-backdrop" onClick={() => setAppointmentDialogOpen(false)}>
            <div className="appointment-modal" onClick={(event) => event.stopPropagation()}>
              <header>
                <div>
                  <h2>Edit appointment</h2>
                  <p>Update the scheduled window or dispatch this job to a different field tech.</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setAppointmentDialogOpen(false)} aria-label="Close appointment editor"><X size={20} /></button>
              </header>
              <div className="appointment-form-grid">
                <label>Start
                  <input
                    type="datetime-local"
                    value={appointmentForm.scheduledStart}
                    onChange={(event) => setAppointmentForm((current) => ({ ...current, scheduledStart: event.target.value }))}
                  />
                </label>
                <label>End
                  <input
                    type="datetime-local"
                    value={appointmentForm.scheduledEnd}
                    onChange={(event) => setAppointmentForm((current) => ({ ...current, scheduledEnd: event.target.value }))}
                  />
                </label>
              </div>
              <label>Field tech
                <select value={appointmentForm.technicianId} onChange={(event) => setAppointmentForm((current) => ({ ...current, technicianId: event.target.value }))}>
                  <option value="">Unassigned</option>
                  {technicians.filter((tech) => tech.active && tech.fieldTech).map((tech) => <option value={tech.id} key={tech.id}>{tech.name}</option>)}
                </select>
              </label>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setAppointmentDialogOpen(false)}>Cancel</button>
                <button className="primary" type="button" onClick={() => saveAppointment(selectedJob)}>Save appointment</button>
              </div>
            </div>
          </div>
        )}

        {jobLineDialog && selectedJob && (
          <div className="modal-backdrop">
            <div className="line-item-modal">
              <header>
                <div>
                  <h2>{jobLineDialog.mode === "edit" ? "Edit" : "Add"} {jobLineDialog.category}</h2>
                  <p>Choose from the price book or save a one-off item for this job.</p>
                </div>
                <button className="icon-button" type="button" onClick={() => setJobLineDialog(null)} aria-label="Close line item"><X size={20} /></button>
              </header>
              <label>{jobLineDialog.category === "service" ? "Service name" : "Material name"}
                <input
                  autoFocus
                  value={jobLineForm.search}
                  onChange={(event) => setJobLineForm((current) => ({ ...current, search: event.target.value, name: event.target.value }))}
                  placeholder="Search price book or type a new line item"
                />
              </label>
              {jobLineForm.search.trim() && (
                <div className="line-item-search-results">
                  {priceBookItems
                    .filter((item) => item.itemType === jobLineDialog.category)
                    .filter((item) => {
                      const query = jobLineForm.search.trim().toLowerCase();
                      return item.name.toLowerCase().includes(query) || (item.description ?? "").toLowerCase().includes(query);
                    })
                    .slice(0, 6)
                    .map((item) => (
                      <button type="button" key={item.id} onClick={() => chooseJobPriceBookItem(item)}>
                        <span>
                          <strong>{item.name}</strong>
                          <small>{item.category?.name ?? (item.itemType === "service" ? "Service" : "Material")}</small>
                        </span>
                        <strong>{money.format(item.price / 100)}</strong>
                      </button>
                    ))}
                  {!priceBookItems.some((item) => item.itemType === jobLineDialog.category && item.name.toLowerCase().includes(jobLineForm.search.trim().toLowerCase())) && (
                    <p className="empty">No price book match. This will save as a one-off item.</p>
                  )}
                </div>
              )}
              <div className="line-item-form-grid">
                <label>Quantity
                  <input inputMode="decimal" value={jobLineForm.quantity} onChange={(event) => setJobLineForm((current) => ({ ...current, quantity: event.target.value }))} />
                </label>
                <label>Unit price
                  <input inputMode="decimal" value={jobLineForm.unitPrice} onChange={(event) => setJobLineForm((current) => ({ ...current, unitPrice: event.target.value }))} />
                </label>
                <label>Unit cost
                  <input inputMode="decimal" value={jobLineForm.unitCost} onChange={(event) => setJobLineForm((current) => ({ ...current, unitCost: event.target.value }))} />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={jobLineDialog.category === "material" && jobLineForm.taxable}
                    disabled={jobLineDialog.category !== "material"}
                    onChange={(event) => setJobLineForm((current) => ({ ...current, taxable: event.target.checked }))}
                  />
                  Taxable material
                </label>
              </div>
              <label>Description
                <textarea value={jobLineForm.description} onChange={(event) => setJobLineForm((current) => ({ ...current, description: event.target.value }))} placeholder="Description shown on the job and invoice" />
              </label>
              <div className="line-item-modal-summary">
                <span>Line total</span>
                <strong>{money.format((Number(jobLineForm.quantity || "0") * dollarsToCents(jobLineForm.unitPrice)) / 100)}</strong>
              </div>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setJobLineDialog(null)}>Cancel</button>
                <button className="primary" type="button" disabled={!jobLineForm.name.trim() && !jobLineForm.search.trim()} onClick={() => saveJobLineItem(selectedJob)}>Save line item</button>
              </div>
            </div>
          </div>
        )}

        {estimateSendDialogOpen && selectedEstimate && (
          <div className="modal-backdrop">
            <div className="send-invoice-modal">
              <header>
                <h2>Send estimate</h2>
                <button className="icon-button" type="button" onClick={() => setEstimateSendDialogOpen(false)} aria-label="Close send estimate"><X size={20} /></button>
              </header>
              <fieldset className="send-methods">
                <legend>Send by</legend>
                <label><input type="radio" name="estimate-send-method" checked={estimateSendMethod === "email"} onChange={() => changeEstimateSendMethod("email")} /> Email</label>
                <label><input type="radio" name="estimate-send-method" checked={estimateSendMethod === "text"} onChange={() => changeEstimateSendMethod("text")} /> Text</label>
                <label><input type="radio" name="estimate-send-method" checked={estimateSendMethod === "both"} onChange={() => changeEstimateSendMethod("both")} /> Email &amp; Text</label>
              </fieldset>
              <label>To
                <input value={estimateSendTo} onChange={(event) => setEstimateSendTo(event.target.value)} placeholder={estimateSendMethod === "text" ? "Customer mobile number" : "Customer email address"} />
              </label>
              <label>Subject
                <input value={estimateSendSubject} onChange={(event) => setEstimateSendSubject(event.target.value)} />
              </label>
              <label>Message
                <textarea value={estimateSendMessage} onChange={(event) => setEstimateSendMessage(event.target.value)} />
              </label>
              <div className="send-attachment-row">
                <FileText size={18} />
                <div>
                  <strong>estimate-{selectedEstimate.estimateNumber}</strong>
                  <span>Customer link: /estimate/{selectedEstimate.estimateNumber}</span>
                </div>
              </div>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setEstimateSendDialogOpen(false)}>Cancel</button>
                <button className="primary" type="button" disabled={!estimateSendTo.trim()} onClick={confirmEstimateSend}>Send</button>
              </div>
            </div>
          </div>
        )}

        {invoiceSendDialogOpen && selectedInvoice && (
          <div className="modal-backdrop">
            <div className="send-invoice-modal">
              <header>
                <h2>Send invoice</h2>
                <button className="icon-button" type="button" onClick={() => setInvoiceSendDialogOpen(false)} aria-label="Close send invoice"><X size={20} /></button>
              </header>
              <fieldset className="send-methods">
                <legend>Send by</legend>
                <label><input type="radio" name="invoice-send-method" checked={invoiceSendMethod === "email"} onChange={() => changeInvoiceSendMethod("email")} /> Email</label>
                <label><input type="radio" name="invoice-send-method" checked={invoiceSendMethod === "text"} onChange={() => changeInvoiceSendMethod("text")} /> Text</label>
                <label><input type="radio" name="invoice-send-method" checked={invoiceSendMethod === "both"} onChange={() => changeInvoiceSendMethod("both")} /> Email &amp; Text</label>
              </fieldset>
              <label>To
                <input value={invoiceSendTo} onChange={(event) => setInvoiceSendTo(event.target.value)} placeholder={invoiceSendMethod === "text" ? "Customer mobile number" : "Customer email address"} />
              </label>
              <label>Subject
                <input value={invoiceSendSubject} onChange={(event) => setInvoiceSendSubject(event.target.value)} />
              </label>
              <label>Message
                <textarea value={invoiceSendMessage} onChange={(event) => setInvoiceSendMessage(event.target.value)} />
              </label>
              <div className="send-attachments">
                <span>Attachments</span>
                <strong>invoice-{selectedInvoice.invoiceNumber}.pdf</strong>
              </div>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setInvoiceSendDialogOpen(false)}>Cancel</button>
                <button className="primary" type="button" disabled={!invoiceSendTo.trim()} onClick={confirmInvoiceSend}>Send</button>
              </div>
            </div>
          </div>
        )}

        {paymentDialogInvoice && (
          <div className="modal-backdrop">
            <div className="payment-modal">
              <header>
                <h2>Payment</h2>
                <button className="icon-button" type="button" onClick={() => setPaymentDialogInvoice(null)} aria-label="Close payment"><X size={20} /></button>
              </header>
              {invoiceActionMessage && <div className="info-banner">{invoiceActionMessage}</div>}
              <div className="payment-field-stack">
                <label>Amount
                  <input inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                </label>
                <label>Email receipt
                  <input type="email" value={paymentReceiptEmail} onChange={(event) => setPaymentReceiptEmail(event.target.value)} placeholder="customer@email.com" />
                </label>
              </div>
              <div className="payment-tabs" role="tablist" aria-label="Payment method">
                {(["credit", "cash", "check", "other"] as const).map((method) => (
                  <button
                    key={method}
                    className={paymentMethod === method ? "active" : ""}
                    type="button"
                    onClick={() => setPaymentMethod(method)}
                  >
                    {method === "credit" ? "Credit" : statusLabel(method.toUpperCase())}
                  </button>
                ))}
              </div>
              {paymentMethod === "credit" ? (
                <div className="payment-card-entry">
                  <div className="secure-payment-card">
                    <CreditCard size={22} />
                    <div>
                      <strong>Secure card checkout</strong>
                      <span>Card number, expiration date, CVC, Apple Pay, and saved-card handling are collected by Stripe in a secure checkout window.</span>
                    </div>
                  </div>
                  <div className="payment-grid">
                    <label>Name on card
                      <input value={paymentBillingForm.nameOnCard} onChange={(event) => setPaymentBillingForm({ ...paymentBillingForm, nameOnCard: event.target.value })} />
                    </label>
                    <label>Postal code
                      <input value={paymentBillingForm.postalCode} onChange={(event) => setPaymentBillingForm({ ...paymentBillingForm, postalCode: event.target.value })} />
                    </label>
                    <label className="span-2">Street
                      <input value={paymentBillingForm.street} onChange={(event) => setPaymentBillingForm({ ...paymentBillingForm, street: event.target.value })} />
                    </label>
                    <label>City
                      <input value={paymentBillingForm.city} onChange={(event) => setPaymentBillingForm({ ...paymentBillingForm, city: event.target.value })} />
                    </label>
                    <label>State
                      <input value={paymentBillingForm.state} onChange={(event) => setPaymentBillingForm({ ...paymentBillingForm, state: event.target.value })} />
                    </label>
                  </div>
                  {!stripeStatus?.connected && (
                    <div className="info-banner">Connect this location to Stripe before charging cards. Cash, check, and other payments can still be recorded.</div>
                  )}
                </div>
              ) : (
                <div className="manual-payment-entry">
                  <label>{paymentMethod === "cash" ? "Cash note" : paymentMethod === "check" ? "Check number or note" : "Payment note"}
                    <input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder={paymentMethod === "check" ? "Check #, bank, or memo" : "Optional"} />
                  </label>
                  <p className="muted">This records a successful {paymentMethod} payment in the CRM and marks the invoice paid when the recorded payments cover the invoice total.</p>
                </div>
              )}
              <label className="check-row payment-notify">
                <input type="checkbox" checked={paymentNotifyCustomer} onChange={(event) => setPaymentNotifyCustomer(event.target.checked)} />
                Notify customer
              </label>
              <div className="modal-actions">
                <button className="outline-button" type="button" onClick={() => setPaymentDialogInvoice(null)}>Cancel</button>
                <button className="primary" type="button" disabled={paymentProcessing || (paymentMethod === "credit" && (!invoiceSettings.acceptCreditCard || !stripeStatus?.connected))} onClick={confirmPayment}>
                  {paymentProcessing ? "Processing..." : paymentMethod === "credit" && !stripeStatus?.connected ? "Connect Stripe first" : paymentMethod === "credit" ? "Charge card" : `Record ${paymentMethod} payment`}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeView === "invoices" && (
          selectedInvoice ? renderInvoiceSendPage(selectedInvoice) : (
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
                    <article key={invoice.id} className="clickable-row" onClick={() => setSelectedInvoiceId(invoice.id)}>
                      <div>
                        <strong>Invoice #{invoice.invoiceNumber}</strong>
                        <span>{invoice.customer.firstName} {invoice.customer.lastName} / {money.format(invoice.total / 100)} / {invoice.status}</span>
                      </div>
                      <button
                        className="icon-button danger"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteInvoice(invoice);
                        }}
                        aria-label={`Delete invoice ${invoice.invoiceNumber}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </article>
                  ))}
                  {invoices.length === 0 && <p className="empty">No invoices yet.</p>}
                </div>
              </section>
            </div>
          )
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
