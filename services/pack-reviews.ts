/* ------------------------------------------------------------------ */
/*  Pack Reviews Service                                               */
/*                                                                     */
/*  B.3 — Pack Reviews & Ratings                                       */
/*  Submit, list, respond-to, and mark-helpful reviews for             */
/*  marketplace template packs. Auto-recalculates rating_avg and       */
/*  rating_count on marketplace_packs after every write.               */
/* ------------------------------------------------------------------ */

import { api, getApiErrorMessage } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    type CrudFilter,
} from "./crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PackReview {
  id: string;
  pack_id: string;
  install_id: string;
  tenant_id: string;
  reviewer_id: string;
  rating: number;
  title: string | null;
  comment: string | null;
  is_verified_purchase: boolean;
  helpful_count: number;
  builder_response: string | null;
  builder_responded_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PackReviewListOptions {
  /** Page size (default 20) */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
  /** Sort: newest first (default) or highest-rated */
  sort?: "newest" | "highest" | "lowest" | "helpful";
}

export interface SubmitReviewInput {
  packId: string;
  installId: string;
  tenantId: string;
  reviewerId: string;
  rating: number;
  title?: string;
  comment?: string;
}

export interface SubmitReviewResult {
  success: boolean;
  review?: PackReview;
  error?: string;
}

export interface RespondToReviewResult {
  success: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABLE_REVIEWS = "pack_reviews";
const TABLE_PACKS = "marketplace_packs";
const TABLE_INSTALLS = "marketplace_installs";

/* ------------------------------------------------------------------ */
/*  Submit Review                                                      */
/* ------------------------------------------------------------------ */

/**
 * Submit a review for a marketplace pack.
 *
 * Validations:
 *  - Rating must be 1-5
 *  - Install must exist, be active, and belong to the tenant
 *  - One review per install + reviewer (UNIQUE constraint)
 *
 * After creation, recalculates rating_avg and rating_count on the pack.
 */
export async function submitPackReview(
  input: SubmitReviewInput,
): Promise<SubmitReviewResult> {
  const { packId, installId, tenantId, reviewerId, rating, title, comment } =
    input;

  // 1. Validate rating range
  if (!rating || rating < 1 || rating > 5) {
    return { success: false, error: "A nota deve ser entre 1 e 5." };
  }

  // 2. Validate install exists, is active, and belongs to tenant + pack
  try {
    const installRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_INSTALLS,
      ...buildSearchParams([
        { field: "id", value: installId },
        { field: "pack_id", value: packId },
        { field: "tenant_id", value: tenantId },
      ]),
    });
    const installs = normalizeCrudList<{
      id: string;
      status: string;
      uninstalled_at: string | null;
    }>(installRes.data);

    const install = installs[0];
    if (!install) {
      return {
        success: false,
        error: "Instalação não encontrada para este pack/tenant.",
      };
    }
    if (install.status !== "active") {
      return {
        success: false,
        error: "Somente instalações ativas podem avaliar.",
      };
    }
  } catch (err) {
    return {
      success: false,
      error: getApiErrorMessage(err, "Erro ao validar instalação."),
    };
  }

  // 3. Check for existing review (prevent duplicates before hitting UNIQUE)
  try {
    const existingRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_REVIEWS,
      ...buildSearchParams(
        [
          { field: "install_id", value: installId },
          { field: "reviewer_id", value: reviewerId },
        ],
        { autoExcludeDeleted: true },
      ),
    });
    const existing = normalizeCrudList<{ id: string }>(existingRes.data);
    if (existing.length > 0) {
      return {
        success: false,
        error: "Você já avaliou este pack nesta instalação.",
      };
    }
  } catch {
    // Proceed — let the DB UNIQUE constraint catch real duplicates
  }

  // 4. Create review
  try {
    const createRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: TABLE_REVIEWS,
      payload: {
        pack_id: packId,
        install_id: installId,
        tenant_id: tenantId,
        reviewer_id: reviewerId,
        rating,
        title: title?.trim() || null,
        comment: comment?.trim() || null,
        is_verified_purchase: true,
        helpful_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const reviews = normalizeCrudList<PackReview>(createRes.data);
    const created = reviews[0] ?? null;

    // 5. Recalculate pack rating
    await recalculatePackRating(packId);

    return { success: true, review: created ?? undefined };
  } catch (err) {
    const msg = getApiErrorMessage(err, "Erro ao salvar avaliação.");
    // Duplicate key → user-friendly message
    if (msg.toLowerCase().includes("unique") || msg.includes("duplicate")) {
      return {
        success: false,
        error: "Você já avaliou este pack nesta instalação.",
      };
    }
    return { success: false, error: msg };
  }
}

/* ------------------------------------------------------------------ */
/*  List Reviews                                                       */
/* ------------------------------------------------------------------ */

/**
 * Get reviews for a specific pack, sorted and paginated.
 */
export async function getPackReviews(
  packId: string,
  options?: PackReviewListOptions,
): Promise<PackReview[]> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  let sortColumn = "created_at DESC"; // default: newest
  if (options?.sort === "highest") sortColumn = "rating DESC";
  if (options?.sort === "lowest") sortColumn = "rating ASC";
  if (options?.sort === "helpful") sortColumn = "helpful_count DESC";

  const filters: CrudFilter[] = [{ field: "pack_id", value: packId }];

  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_REVIEWS,
    ...buildSearchParams(filters, {
      sortColumn,
      autoExcludeDeleted: true,
    }),
    limit,
    offset,
  });

  return normalizeCrudList<PackReview>(res.data);
}

/**
 * Get the current user's review for a pack (if any).
 * Used to determine if user can submit or has already reviewed.
 */
export async function getUserReviewForPack(
  packId: string,
  reviewerId: string,
): Promise<PackReview | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_REVIEWS,
    ...buildSearchParams(
      [
        { field: "pack_id", value: packId },
        { field: "reviewer_id", value: reviewerId },
      ],
      { autoExcludeDeleted: true },
    ),
  });

  const reviews = normalizeCrudList<PackReview>(res.data);
  return reviews[0] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Builder Response                                                   */
/* ------------------------------------------------------------------ */

/**
 * Builder responds to a review.
 * Only the pack builder should call this (enforced at UI level).
 */
export async function respondToReview(
  reviewId: string,
  builderId: string,
  responseText: string,
): Promise<RespondToReviewResult> {
  if (!responseText.trim()) {
    return { success: false, error: "A resposta não pode ser vazia." };
  }

  // Verify review exists and fetch pack to validate builder
  try {
    const reviewRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_REVIEWS,
      ...buildSearchParams([{ field: "id", value: reviewId }]),
    });
    const reviews = normalizeCrudList<PackReview>(reviewRes.data);
    const review = reviews[0];
    if (!review) {
      return { success: false, error: "Avaliação não encontrada." };
    }

    // Verify builder owns the pack
    const packRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_PACKS,
      ...buildSearchParams([
        { field: "id", value: review.pack_id },
        { field: "builder_id", value: builderId },
      ]),
    });
    const packs = normalizeCrudList<{ id: string }>(packRes.data);
    if (packs.length === 0) {
      return {
        success: false,
        error: "Somente o criador do pack pode responder.",
      };
    }

    // Update review with response
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE_REVIEWS,
      payload: {
        id: reviewId,
        builder_response: responseText.trim(),
        builder_responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: getApiErrorMessage(err, "Erro ao responder avaliação."),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Mark Helpful                                                       */
/* ------------------------------------------------------------------ */

/**
 * Increment helpful_count on a review (MVP: simple increment, no dedupe).
 */
export async function markReviewHelpful(reviewId: string): Promise<boolean> {
  try {
    // Fetch current count
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_REVIEWS,
      ...buildSearchParams([{ field: "id", value: reviewId }]),
    });
    const reviews = normalizeCrudList<PackReview>(res.data);
    const review = reviews[0];
    if (!review) return false;

    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE_REVIEWS,
      payload: {
        id: reviewId,
        helpful_count: (review.helpful_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      },
    });

    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Recalculate Pack Rating                                            */
/* ------------------------------------------------------------------ */

/**
 * Recalculate rating_avg and rating_count for a pack from its reviews.
 * Called after submitting or deleting a review.
 */
export async function recalculatePackRating(packId: string): Promise<void> {
  try {
    // Fetch all non-deleted reviews for this pack
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_REVIEWS,
      ...buildSearchParams([{ field: "pack_id", value: packId }], {
        autoExcludeDeleted: true,
      }),
    });
    const reviews = normalizeCrudList<{ rating: number }>(res.data);

    const count = reviews.length;
    const avg =
      count > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;

    // Round to 2 decimal places
    const roundedAvg = Math.round(avg * 100) / 100;

    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE_PACKS,
      payload: {
        id: packId,
        rating_avg: roundedAvg,
        rating_count: count,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    // Non-fatal: rating display will be stale but not broken
    if (__DEV__) {
      console.warn("[pack-reviews] recalculatePackRating failed:", err);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Rating Summary (for display)                                       */
/* ------------------------------------------------------------------ */

/**
 * Get a breakdown of ratings for a pack (1-5 star distribution).
 */
export async function getPackRatingBreakdown(
  packId: string,
): Promise<Record<number, number>> {
  const breakdown: Record<number, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: TABLE_REVIEWS,
      ...buildSearchParams([{ field: "pack_id", value: packId }], {
        autoExcludeDeleted: true,
      }),
    });
    const reviews = normalizeCrudList<{ rating: number }>(res.data);

    for (const review of reviews) {
      const r = Math.min(5, Math.max(1, Math.round(review.rating)));
      breakdown[r] = (breakdown[r] ?? 0) + 1;
    }
  } catch {
    // Return zeroed breakdown on failure
  }

  return breakdown;
}
