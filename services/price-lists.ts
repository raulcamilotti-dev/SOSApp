/**
 * Price Lists Service
 *
 * Manages differentiated pricing by customer.
 *
 * Architecture:
 * - price_lists: Named lists with priority, date range, active flag
 * - price_list_items: Individual price entries (per product or per category)
 * - customer_price_lists: Links customers to their applicable lists
 *
 * Price resolution order:
 * 1. Find customer's active price lists (sorted by priority DESC)
 * 2. For each list, find matching item (product-specific > category-wide)
 * 3. First match wins (highest priority with most specific rule)
 * 4. Fallback: product's default sell_price
 *
 * Price types:
 * - "fixed": absolute price (e.g., R$ 45.00)
 * - "discount_percent": percentage OFF sell_price (e.g., 10% off)
 * - "markup_percent": percentage ON cost_price (e.g., 30% markup)
 *
 * Tables: price_lists, price_list_items, customer_price_lists
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PriceList {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  priority: number;
  valid_from: string | null; // ISO date
  valid_until: string | null; // ISO date
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export type PriceType = "fixed" | "discount_percent" | "markup_percent";

export interface PriceListItem {
  id: string;
  price_list_id: string;
  service_id: string | null;
  service_category_id: string | null;
  price_type: PriceType;
  price_value: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface CustomerPriceList {
  id: string;
  customer_id: string;
  price_list_id: string;
  created_at?: string;
  deleted_at?: string | null;
}

export interface ResolvedPrice {
  /** The effective price (already computed) */
  price: number;
  /** Where this came from */
  source: "price_list" | "default";
  /** Price list name (if from a price list) */
  priceListName?: string;
  /** The price type used */
  priceType?: PriceType;
  /** The raw value from price_list_items */
  rawValue?: number;
}

/* ------------------------------------------------------------------ */
/*  Price Lists CRUD                                                   */
/* ------------------------------------------------------------------ */

export async function listPriceLists(tenantId: string): Promise<PriceList[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "price_lists",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
      sortColumn: "priority DESC",
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<PriceList>(res.data);
}

export async function createPriceList(params: {
  tenantId: string;
  name: string;
  description?: string;
  priority?: number;
  validFrom?: string | null;
  validUntil?: string | null;
  isActive?: boolean;
}): Promise<PriceList> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "price_lists",
    payload: {
      tenant_id: params.tenantId,
      name: params.name,
      description: params.description ?? null,
      priority: params.priority ?? 1,
      valid_from: params.validFrom ?? null,
      valid_until: params.validUntil ?? null,
      is_active: params.isActive ?? true,
    },
  });
  return normalizeCrudOne<PriceList>(res.data);
}

export async function updatePriceList(
  id: string,
  updates: Partial<Omit<PriceList, "id" | "tenant_id" | "created_at">>,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "price_lists",
    payload: {
      id,
      ...updates,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deletePriceList(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "price_lists",
    payload: {
      id,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Price List Items CRUD                                              */
/* ------------------------------------------------------------------ */

export async function listPriceListItems(
  priceListId: string,
): Promise<PriceListItem[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "price_list_items",
    ...buildSearchParams([{ field: "price_list_id", value: priceListId }], {
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<PriceListItem>(res.data);
}

export async function createPriceListItem(params: {
  priceListId: string;
  serviceId?: string | null;
  serviceCategoryId?: string | null;
  priceType: PriceType;
  priceValue: number;
}): Promise<PriceListItem> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "price_list_items",
    payload: {
      price_list_id: params.priceListId,
      service_id: params.serviceId ?? null,
      service_category_id: params.serviceCategoryId ?? null,
      price_type: params.priceType,
      price_value: params.priceValue,
    },
  });
  return normalizeCrudOne<PriceListItem>(res.data);
}

export async function updatePriceListItem(
  id: string,
  updates: Partial<
    Pick<
      PriceListItem,
      "price_type" | "price_value" | "service_id" | "service_category_id"
    >
  >,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "price_list_items",
    payload: {
      id,
      ...updates,
      updated_at: new Date().toISOString(),
    },
  });
}

export async function deletePriceListItem(id: string): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "price_list_items",
    payload: {
      id,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Customer ↔ Price List Links                                        */
/* ------------------------------------------------------------------ */

export async function getCustomerPriceLists(
  customerId: string,
): Promise<CustomerPriceList[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "customer_price_lists",
    ...buildSearchParams([{ field: "customer_id", value: customerId }], {
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<CustomerPriceList>(res.data);
}

/** List all customer links for a specific price list */
export async function getPriceListCustomers(
  priceListId: string,
): Promise<CustomerPriceList[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "customer_price_lists",
    ...buildSearchParams([{ field: "price_list_id", value: priceListId }], {
      autoExcludeDeleted: true,
    }),
  });
  return normalizeCrudList<CustomerPriceList>(res.data);
}

export async function linkCustomerToPriceList(
  customerId: string,
  priceListId: string,
): Promise<CustomerPriceList> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "customer_price_lists",
    payload: {
      customer_id: customerId,
      price_list_id: priceListId,
    },
  });
  return normalizeCrudOne<CustomerPriceList>(res.data);
}

export async function unlinkCustomerFromPriceList(
  linkId: string,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "customer_price_lists",
    payload: {
      id: linkId,
      deleted_at: new Date().toISOString(),
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Price Resolution                                                   */
/* ------------------------------------------------------------------ */

/**
 * Resolve the effective price for a product for a specific customer.
 *
 * Algorithm:
 * 1. Get all price lists linked to this customer
 * 2. Filter active lists within valid date range
 * 3. Sort by priority DESC (highest first)
 * 4. For each list, look for a matching item:
 *    a. Product-specific match (service_id = productId) — most specific
 *    b. Category match (service_category_id = product's category) — broader
 * 5. First match found → compute price → return
 * 6. No match → return product's default sell_price
 *
 * @param serviceId - Product ID (from services table)
 * @param customerId - Customer ID (for price list lookup)
 * @param tenantId - Tenant ID
 * @returns Resolved price with source info
 */
export async function resolvePrice(
  serviceId: string,
  customerId: string | null,
  tenantId: string,
): Promise<ResolvedPrice> {
  // 1. Get the product's base prices
  const productRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "services",
    ...buildSearchParams([{ field: "id", value: serviceId }]),
  });
  const products = normalizeCrudList<Record<string, unknown>>(productRes.data);
  const product = products[0];

  const defaultSellPrice = product ? Number(product.sell_price ?? 0) : 0;
  const costPrice = product
    ? Number(product.cost_price ?? product.average_cost ?? 0)
    : 0;
  const categoryId = product ? String(product.service_category_id ?? "") : "";

  // No customer → default price
  if (!customerId) {
    return { price: defaultSellPrice, source: "default" };
  }

  // 2. Get customer's price list links
  const links = await getCustomerPriceLists(customerId);
  if (links.length === 0) {
    return { price: defaultSellPrice, source: "default" };
  }

  const priceListIds = links.map((l) => l.price_list_id);

  // 3. Fetch linked price lists (active, non-deleted)
  const listsRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "price_lists",
    ...buildSearchParams(
      [
        { field: "id", value: priceListIds.join(","), operator: "in" },
        { field: "is_active", value: "true" },
        { field: "tenant_id", value: tenantId },
      ],
      {
        sortColumn: "priority DESC",
        autoExcludeDeleted: true,
        combineType: "AND",
      },
    ),
  });
  const lists = normalizeCrudList<PriceList>(listsRes.data);

  if (lists.length === 0) {
    return { price: defaultSellPrice, source: "default" };
  }

  // 4. Filter by valid date range
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const validLists = lists.filter((list) => {
    if (list.valid_from && list.valid_from > today) return false;
    if (list.valid_until && list.valid_until < today) return false;
    return true;
  });

  if (validLists.length === 0) {
    return { price: defaultSellPrice, source: "default" };
  }

  // 5. For each list (priority DESC), find matching item
  for (const list of validLists) {
    const itemsRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "price_list_items",
      ...buildSearchParams([{ field: "price_list_id", value: list.id }], {
        autoExcludeDeleted: true,
      }),
    });
    const items = normalizeCrudList<PriceListItem>(itemsRes.data);

    // a. Try product-specific match first
    const productMatch = items.find((item) => item.service_id === serviceId);
    if (productMatch) {
      const price = computePrice(
        productMatch.price_type,
        productMatch.price_value,
        defaultSellPrice,
        costPrice,
      );
      return {
        price,
        source: "price_list",
        priceListName: list.name,
        priceType: productMatch.price_type,
        rawValue: productMatch.price_value,
      };
    }

    // b. Try category match
    if (categoryId) {
      const categoryMatch = items.find(
        (item) => !item.service_id && item.service_category_id === categoryId,
      );
      if (categoryMatch) {
        const price = computePrice(
          categoryMatch.price_type,
          categoryMatch.price_value,
          defaultSellPrice,
          costPrice,
        );
        return {
          price,
          source: "price_list",
          priceListName: list.name,
          priceType: categoryMatch.price_type,
          rawValue: categoryMatch.price_value,
        };
      }
    }
  }

  // 6. No match → fallback
  return { price: defaultSellPrice, source: "default" };
}

/* ------------------------------------------------------------------ */
/*  Helper: Compute price by type                                      */
/* ------------------------------------------------------------------ */

function computePrice(
  type: PriceType,
  value: number,
  sellPrice: number,
  costPrice: number,
): number {
  switch (type) {
    case "fixed":
      return value;
    case "discount_percent":
      // e.g., value=10 → 10% off sell_price
      return Math.max(0, sellPrice * (1 - value / 100));
    case "markup_percent":
      // e.g., value=30 → 30% markup on cost_price
      return costPrice * (1 + value / 100);
    default:
      return sellPrice;
  }
}
