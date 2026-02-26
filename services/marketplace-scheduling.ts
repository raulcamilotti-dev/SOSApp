/**
 * Marketplace Scheduling Service
 *
 * Fetches partner availability and generates bookable time slots
 * for service items in the marketplace checkout flow.
 *
 * Tables used:
 * - partner_availability (weekday schedules)
 * - partner_time_off (blocked date ranges)
 * - service_appointments (existing bookings)
 */

import { api } from "./api";
import { buildSearchParams, CRUD_ENDPOINT, normalizeCrudList } from "./crud";
import { listPartnerServices, type PartnerService } from "./partner-services";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

export interface PartnerAvailability {
  id: string;
  tenant_id: string;
  partner_id: string;
  /** 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  weekday: number;
  /** HH:mm:ss */
  start_time: string;
  /** HH:mm:ss */
  end_time: string;
  is_active: boolean;
}

export interface PartnerTimeOff {
  id: string;
  tenant_id: string;
  partner_id: string;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
  reason?: string;
}

export interface ExistingAppointment {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
}

/** A single bookable time slot */
export interface TimeSlot {
  /** ISO datetime for slot start */
  start: string;
  /** ISO datetime for slot end */
  end: string;
  /** Human-readable label, e.g. "09:00 – 10:00" */
  label: string;
}

/** Grouped time slots by date */
export interface DaySlots {
  /** YYYY-MM-DD */
  date: string;
  /** Human label, e.g. "Seg, 17 Mar" */
  dateLabel: string;
  /** Weekday number (0-6) */
  weekday: number;
  slots: TimeSlot[];
}

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

/** How many days ahead to show availability */
const LOOKAHEAD_DAYS = 14;

/** Minimum slot duration in case product has no duration set (30 min) */
const DEFAULT_SLOT_MINUTES = 60;

/** Weekday names in pt-BR (index = JS getDay()) */
const WEEKDAY_LABELS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MONTH_LABELS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

/* ═══════════════════════════════════════════════════════
 * DATA FETCHING
 * ═══════════════════════════════════════════════════════ */

/**
 * Fetch the weekly availability schedule for a partner.
 */
export async function getPartnerAvailability(
  tenantId: string,
  partnerId: string,
): Promise<PartnerAvailability[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_availability",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "partner_id", value: partnerId },
        { field: "is_active", value: "true", operator: "equal" },
      ],
      { sortColumn: "weekday ASC, start_time ASC", autoExcludeDeleted: true },
    ),
  });
  return normalizeCrudList<PartnerAvailability>(res.data);
}

/**
 * Fetch time-off / blocked dates for a partner within the lookahead window.
 */
export async function getPartnerTimeOff(
  tenantId: string,
  partnerId: string,
): Promise<PartnerTimeOff[]> {
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + LOOKAHEAD_DAYS);

  const todayStr = formatDateISO(today);
  const futureStr = formatDateISO(futureDate);

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "partner_time_off",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "partner_id", value: partnerId },
        // end_date >= today (still relevant)
        { field: "end_date", value: todayStr, operator: "gte" },
        // start_date <= future window
        { field: "start_date", value: futureStr, operator: "lte" },
      ],
      { autoExcludeDeleted: true },
    ),
  });
  return normalizeCrudList<PartnerTimeOff>(res.data);
}

/**
 * Fetch existing appointments for a partner within the lookahead window
 * that would block new bookings (scheduled, confirmed, or in_progress).
 */
export async function getPartnerAppointments(
  tenantId: string,
  partnerId: string,
): Promise<ExistingAppointment[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const futureDate = new Date(today);
  futureDate.setDate(futureDate.getDate() + LOOKAHEAD_DAYS);

  const todayISO = today.toISOString();
  const futureISO = futureDate.toISOString();

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "service_appointments",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "partner_id", value: partnerId },
        { field: "scheduled_start", value: futureISO, operator: "lt" },
        { field: "scheduled_end", value: todayISO, operator: "gt" },
        {
          field: "status",
          value: "scheduled,confirmed,in_progress",
          operator: "in",
        },
      ],
      { autoExcludeDeleted: true, sortColumn: "scheduled_start ASC" },
    ),
  });
  return normalizeCrudList<ExistingAppointment>(res.data);
}

/* ═══════════════════════════════════════════════════════
 * SLOT GENERATION
 * ═══════════════════════════════════════════════════════ */

/**
 * Generate all available time slots for a partner in the next N days,
 * considering their weekly schedule, time off, and existing appointments.
 *
 * @param tenantId - Tenant UUID
 * @param partnerId - Partner UUID
 * @param durationMinutes - Duration of the service in minutes
 * @returns Array of DaySlots grouped by date
 */
export async function getAvailableSlots(
  tenantId: string,
  partnerId: string | null,
  durationMinutes?: number | null,
): Promise<DaySlots[]> {
  // Guard: partnerId must be a valid non-empty string (UUID)
  if (!partnerId || partnerId === "null" || partnerId === "undefined") {
    console.warn("[getAvailableSlots] Invalid partnerId:", partnerId);
    return [];
  }

  const duration = durationMinutes ?? DEFAULT_SLOT_MINUTES;

  // Fetch all data in parallel
  const [availability, timeOff, appointments] = await Promise.all([
    getPartnerAvailability(tenantId, partnerId),
    getPartnerTimeOff(tenantId, partnerId),
    getPartnerAppointments(tenantId, partnerId),
  ]);

  if (availability.length === 0) return [];

  // Build weekday → availability windows map
  const weekdayMap = new Map<number, { start: string; end: string }[]>();
  for (const av of availability) {
    const existing = weekdayMap.get(av.weekday) ?? [];
    existing.push({ start: av.start_time, end: av.end_time });
    weekdayMap.set(av.weekday, existing);
  }

  // Build time-off date set (YYYY-MM-DD strings that are completely blocked)
  const timeOffDates = new Set<string>();
  for (const to of timeOff) {
    const start = new Date(to.start_date + "T00:00:00");
    const end = new Date(to.end_date + "T23:59:59");
    const cursor = new Date(start);
    while (cursor <= end) {
      timeOffDates.add(formatDateISO(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  // Generate slots for each day in the lookahead window
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const now = new Date();

  const result: DaySlots[] = [];

  for (let d = 0; d < LOOKAHEAD_DAYS; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = formatDateISO(date);
    const weekday = date.getDay(); // 0 = Sunday

    // Skip if no availability defined for this weekday
    const windows = weekdayMap.get(weekday);
    if (!windows || windows.length === 0) continue;

    // Skip if partner is on time-off this day
    if (timeOffDates.has(dateStr)) continue;

    // Get existing appointments for this day
    const dayAppts = appointments.filter((appt) => {
      const apptDate = new Date(appt.scheduled_start);
      return formatDateISO(apptDate) === dateStr;
    });

    // Generate slots for each availability window
    const daySlots: TimeSlot[] = [];

    for (const window of windows) {
      const windowStart = parseTimeToDate(date, window.start);
      const windowEnd = parseTimeToDate(date, window.end);

      // Generate contiguous slots within this window
      let slotStart = new Date(windowStart);
      while (true) {
        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + duration);

        // Slot must fit within the window
        if (slotEnd > windowEnd) break;

        // Skip past slots (for today)
        if (slotStart < now) {
          slotStart = new Date(slotEnd);
          continue;
        }

        // Check for overlap with existing appointments
        const hasConflict = dayAppts.some((appt) => {
          const apptStart = new Date(appt.scheduled_start);
          const apptEnd = new Date(appt.scheduled_end);
          return slotStart < apptEnd && slotEnd > apptStart;
        });

        if (!hasConflict) {
          daySlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            label: `${formatTime(slotStart)} – ${formatTime(slotEnd)}`,
          });
        }

        // Move to next slot
        slotStart = new Date(slotEnd);
      }
    }

    if (daySlots.length > 0) {
      result.push({
        date: dateStr,
        dateLabel: `${WEEKDAY_LABELS_SHORT[weekday]}, ${date.getDate()} ${MONTH_LABELS_SHORT[date.getMonth()]}`,
        weekday,
        slots: daySlots,
      });
    }
  }

  return result;
}

/* ═══════════════════════════════════════════════════════
 * PARTNER DISCOVERY + SLOTS PER SERVICE
 * ═══════════════════════════════════════════════════════ */

/** A partner that can perform a given service, with their available slots */
export interface PartnerWithSlots {
  partnerId: string;
  partnerName: string;
  /** Custom duration from partner_services (null = use service default) */
  customDuration: number | null;
  /** Custom price from partner_services (null = use service default) */
  customPrice: number | null;
  /** Available time slots for this partner */
  slots: DaySlots[];
}

/** Result of looking up scheduling options for a single service item */
export interface ServiceSchedulingOptions {
  /** The service ID from the cart item */
  serviceId: string;
  /** The service/product name for display */
  serviceName: string;
  /** Duration in minutes for this service */
  durationMinutes: number;
  /** Available partners with their slots (sorted by name) */
  partners: PartnerWithSlots[];
}

/**
 * For a list of schedulable service items, find which partners offer each
 * service (via partner_services), fetch their names, and generate available
 * time slots per partner.
 *
 * This replaces the old single-partner resolution chain and lets the
 * customer choose which partner to book when multiple are available.
 *
 * @param tenantId - Tenant UUID
 * @param serviceItems - Cart items that require scheduling
 * @returns Scheduling options grouped by service item
 */
export async function getSchedulingOptionsForServices(
  tenantId: string,
  serviceItems: {
    service_id: string;
    product_name?: string;
    duration_minutes?: number | null;
  }[],
): Promise<ServiceSchedulingOptions[]> {
  if (!tenantId || serviceItems.length === 0) return [];

  // Deduplicate service IDs (multiple cart items could be the same service)
  const uniqueServiceIds = [...new Set(serviceItems.map((s) => s.service_id))];

  // Build a name lookup from the cart items
  const serviceNameMap = new Map<string, string>();
  const serviceDurationMap = new Map<string, number>();
  for (const item of serviceItems) {
    if (!serviceNameMap.has(item.service_id)) {
      serviceNameMap.set(item.service_id, item.product_name ?? "Serviço");
    }
    if (!serviceDurationMap.has(item.service_id)) {
      serviceDurationMap.set(
        item.service_id,
        item.duration_minutes ?? DEFAULT_SLOT_MINUTES,
      );
    }
  }

  // For each unique service, find linked partners from partner_services
  const results: ServiceSchedulingOptions[] = [];

  for (const serviceId of uniqueServiceIds) {
    const links = await listPartnerServices(tenantId, {
      serviceId,
    });
    const activeLinks = links.filter((l) => l.is_active !== false);

    if (activeLinks.length === 0) {
      // No partner offers this service — include with empty partners
      results.push({
        serviceId,
        serviceName: serviceNameMap.get(serviceId) ?? "Serviço",
        durationMinutes:
          serviceDurationMap.get(serviceId) ?? DEFAULT_SLOT_MINUTES,
        partners: [],
      });
      continue;
    }

    // Fetch partner names in batch
    const partnerIds = activeLinks.map((l) => l.partner_id);
    let partnerNames = new Map<string, string>();
    try {
      const nameRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "partners",
        ...buildSearchParams(
          [
            { field: "id", value: partnerIds.join(","), operator: "in" },
            { field: "tenant_id", value: tenantId },
          ],
          { autoExcludeDeleted: true },
        ),
      });
      const partners = normalizeCrudList<{
        id: string;
        name?: string;
        company_name?: string;
      }>(nameRes.data);
      for (const p of partners) {
        partnerNames.set(p.id, p.name || p.company_name || "Parceiro");
      }
    } catch {
      // Fallback: use generic names
      for (const id of partnerIds) {
        partnerNames.set(id, "Parceiro");
      }
    }

    // Build a link map for custom duration/price
    const linkMap = new Map<string, PartnerService>();
    for (const link of activeLinks) {
      linkMap.set(link.partner_id, link);
    }

    const defaultDuration =
      serviceDurationMap.get(serviceId) ?? DEFAULT_SLOT_MINUTES;

    // Load slots for each partner in parallel
    const partnerSlotsPromises = partnerIds.map(async (partnerId) => {
      const link = linkMap.get(partnerId);
      const duration = link?.custom_duration_minutes ?? defaultDuration;
      try {
        const slots = await getAvailableSlots(tenantId, partnerId, duration);
        return {
          partnerId,
          partnerName: partnerNames.get(partnerId) ?? "Parceiro",
          customDuration: link?.custom_duration_minutes ?? null,
          customPrice: link?.custom_price ?? null,
          slots,
        } satisfies PartnerWithSlots;
      } catch {
        return {
          partnerId,
          partnerName: partnerNames.get(partnerId) ?? "Parceiro",
          customDuration: link?.custom_duration_minutes ?? null,
          customPrice: link?.custom_price ?? null,
          slots: [],
        } satisfies PartnerWithSlots;
      }
    });

    const partnerSlots = await Promise.all(partnerSlotsPromises);

    // Sort partners by name for consistent display
    partnerSlots.sort((a, b) => a.partnerName.localeCompare(b.partnerName));

    results.push({
      serviceId,
      serviceName: serviceNameMap.get(serviceId) ?? "Serviço",
      durationMinutes: defaultDuration,
      partners: partnerSlots,
    });
  }

  return results;
}

/* ═══════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════ */

/** Format date as YYYY-MM-DD */
function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a time string (HH:mm or HH:mm:ss) onto a given date */
function parseTimeToDate(date: Date, timeStr: string): Date {
  const parts = timeStr.split(":");
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] ?? "0", 10);
  const s = parseInt(parts[2] ?? "0", 10);
  const result = new Date(date);
  result.setHours(h, m, s, 0);
  return result;
}

/** Format a Date as HH:mm */
function formatTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
