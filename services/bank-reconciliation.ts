/**
 * Bank Reconciliation Service
 *
 * Matches OFX bank transactions against existing accounts_receivable (AR) and
 * accounts_payable (AP) entries, allowing users to:
 *
 * 1. AUTO-MATCH: System suggests matches based on amount + date proximity
 * 2. MANUAL MATCH: User selects an existing AR/AP entry for a transaction
 * 3. CREATE NEW: User creates a new AR (credit) or AP (debit) from transaction
 * 4. IGNORE: Mark a transaction as "ignored" (already reconciled or irrelevant)
 *
 * Best practices implemented:
 * - Amount matching with configurable tolerance (default 0.01 BRL)
 * - Date proximity scoring (closer dates rank higher)
 * - Description fuzzy matching via keyword overlap
 * - Duplicate detection by FITID to prevent re-importing
 * - Reconciliation state persisted in `bank_reconciliation_imports` + `bank_reconciliation_items`
 * - Full audit trail (who reconciled, when, which AR/AP was linked)
 */

import { api } from "./api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "./crud";
import type { AccountPayable, AccountReceivable } from "./financial";
import { createAccountPayable, createAccountReceivable } from "./financial";
import type { BankTransaction, OFXParseResult } from "./ofx-parser";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ReconciliationStatus =
  | "pending" // Not yet reconciled
  | "matched" // Matched to existing AR/AP entry
  | "created" // New AR/AP created from this transaction
  | "ignored"; // Explicitly ignored by user

export type MatchConfidence = "high" | "medium" | "low" | "none";

export interface ReconciliationMatch {
  /** ID of the AR or AP entry */
  entryId: string;
  /** Table: "accounts_receivable" or "accounts_payable" */
  entryTable: "accounts_receivable" | "accounts_payable";
  /** Description of the matched entry */
  description: string;
  /** Amount of the matched entry */
  amount: number;
  /** Due date of the matched entry */
  dueDate: string;
  /** Status of the matched entry */
  status: string;
  /** Category of the matched entry */
  category?: string;
  /** Match confidence score */
  confidence: MatchConfidence;
  /** Numeric score (0-100) for sorting */
  score: number;
  /** Reasons for the match */
  matchReasons: string[];
}

export interface ReconciliationItem {
  /** Bank transaction data */
  transaction: BankTransaction;
  /** Current reconciliation status */
  status: ReconciliationStatus;
  /** Suggested matches from the system */
  suggestedMatches: ReconciliationMatch[];
  /** If matched/created: the linked AR/AP entry */
  linkedEntryId?: string;
  linkedEntryTable?: "accounts_receivable" | "accounts_payable";
  /** DB record ID (if persisted) */
  id?: string;
}

export interface ReconciliationImport {
  id?: string;
  tenantId: string;
  fileName: string;
  bankId?: string;
  accountId?: string;
  periodStart?: string;
  periodEnd?: string;
  totalTransactions: number;
  totalCredits: number;
  totalDebits: number;
  creditAmount: number;
  debitAmount: number;
  reconciledCount: number;
  importedAt: string;
  importedBy?: string;
}

export interface ReconciliationSummary {
  total: number;
  pending: number;
  matched: number;
  created: number;
  ignored: number;
  totalCredits: number;
  totalDebits: number;
  creditAmount: number;
  debitAmount: number;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Amount tolerance for matching (R$ 0.01) */
const AMOUNT_TOLERANCE = 0.01;

/** Maximum date difference in days for matching */
const MAX_DATE_DIFF_DAYS = 10;

/** Minimum score to be considered a match */
const MIN_MATCH_SCORE = 30;

/* ------------------------------------------------------------------ */
/*  Matching Engine                                                    */
/* ------------------------------------------------------------------ */

/**
 * Calculate the match score between a bank transaction and an AR/AP entry.
 *
 * Scoring:
 * - Exact amount match: +50 points
 * - Close amount (within 5%): +30 points
 * - Date proximity (0 days = +30, 1 day = +25, etc): 0-30 points
 * - Description keyword overlap: 0-20 points
 */
function calculateMatchScore(
  transaction: BankTransaction,
  entry: {
    amount: number;
    dueDate: string;
    description: string;
    status: string;
  },
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // --- Amount matching ---
  const txAmount = transaction.absoluteAmount;
  const entryAmount = Math.abs(entry.amount);

  if (Math.abs(txAmount - entryAmount) <= AMOUNT_TOLERANCE) {
    score += 50;
    reasons.push("Valor exato");
  } else {
    const pctDiff =
      entryAmount > 0 ? Math.abs(txAmount - entryAmount) / entryAmount : 1;
    if (pctDiff <= 0.05) {
      score += 30;
      reasons.push(`Valor próximo (${(pctDiff * 100).toFixed(1)}% diferença)`);
    } else if (pctDiff <= 0.1) {
      score += 15;
      reasons.push(`Valor similar (${(pctDiff * 100).toFixed(1)}% diferença)`);
    }
  }

  // --- Date proximity ---
  const txDate = transaction.date.getTime();
  const entryDate = new Date(entry.dueDate).getTime();
  const daysDiff = Math.abs(txDate - entryDate) / (1000 * 60 * 60 * 24);

  if (daysDiff <= MAX_DATE_DIFF_DAYS) {
    const dateScore = Math.max(0, 30 - daysDiff * 3);
    score += dateScore;
    if (daysDiff <= 1) {
      reasons.push("Data coincidente");
    } else {
      reasons.push(`Data próxima (${Math.round(daysDiff)} dias)`);
    }
  }

  // --- Description matching ---
  const txWords = normalizeForMatch(transaction.description);
  const entryWords = normalizeForMatch(entry.description);

  const overlap = txWords.filter((w) => entryWords.includes(w));
  if (overlap.length > 0) {
    const descScore = Math.min(20, overlap.length * 7);
    score += descScore;
    reasons.push(`Descrição similar (${overlap.join(", ")})`);
  }

  // --- Status bonus: pending entries score higher ---
  if (entry.status === "pending" || entry.status === "partial") {
    score += 5;
    reasons.push("Pagamento pendente");
  }

  return { score, reasons };
}

/**
 * Normalize a string for matching: lowercase, remove accents, split into words.
 */
function normalizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9\s]/g, " ") // keep only alphanumeric
    .split(/\s+/)
    .filter((w) => w.length > 2); // skip tiny words
}

/**
 * Classify match confidence based on score.
 */
function getConfidence(score: number): MatchConfidence {
  if (score >= 70) return "high";
  if (score >= 50) return "medium";
  if (score >= MIN_MATCH_SCORE) return "low";
  return "none";
}

/* ------------------------------------------------------------------ */
/*  Core Functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Build reconciliation items from parsed OFX data.
 *
 * For each transaction:
 * 1. Check if already imported (by FITID) → skip
 * 2. Fetch candidate AR entries (for credits) or AP entries (for debits)
 * 3. Score each candidate and sort by score
 * 4. Return ReconciliationItem with suggested matches
 */
export async function buildReconciliationItems(
  parsedOFX: OFXParseResult,
  tenantId: string,
): Promise<ReconciliationItem[]> {
  // 1. Load existing reconciliation items (full rows with status)
  const existingItems = await getExistingItems(tenantId);

  // 2. Fetch all pending/partial AR and AP entries for matching
  const [arEntries, apEntries] = await Promise.all([
    fetchCandidateAR(tenantId),
    fetchCandidateAP(tenantId),
  ]);

  // 3. Build reconciliation items
  const items: ReconciliationItem[] = [];

  for (const tx of parsedOFX.transactions) {
    const existingRow = existingItems.get(tx.fitId);

    // If this transaction was already processed, re-hydrate with saved status
    if (existingRow) {
      items.push({
        transaction: tx,
        status: existingRow.status as ReconciliationStatus,
        suggestedMatches: [],
        linkedEntryId: existingRow.linked_entry_id as string | undefined,
        linkedEntryTable: existingRow.linked_entry_table as
          | "accounts_receivable"
          | "accounts_payable"
          | undefined,
        id: existingRow.id,
      });
      continue;
    }

    // Match credits against AR (money in = receivables)
    // Match debits against AP (money out = payables)
    const candidates = tx.type === "credit" ? arEntries : apEntries;
    const entryTable: "accounts_receivable" | "accounts_payable" =
      tx.type === "credit" ? "accounts_receivable" : "accounts_payable";

    const matches: ReconciliationMatch[] = [];

    for (const entry of candidates) {
      const { score, reasons } = calculateMatchScore(tx, {
        amount: Number(entry.amount ?? 0),
        dueDate: String(entry.due_date ?? ""),
        description: String(entry.description ?? ""),
        status: String(entry.status ?? ""),
      });

      if (score >= MIN_MATCH_SCORE) {
        matches.push({
          entryId: String(entry.id),
          entryTable,
          description: String(entry.description ?? ""),
          amount: Number(entry.amount ?? 0),
          dueDate: String(entry.due_date ?? ""),
          status: String(entry.status ?? ""),
          category: entry.category as string | undefined,
          confidence: getConfidence(score),
          score,
          matchReasons: reasons,
        });
      }
    }

    // Sort by score (descending)
    matches.sort((a, b) => b.score - a.score);

    items.push({
      transaction: tx,
      status: "pending",
      suggestedMatches: matches.slice(0, 5), // top 5 suggestions
    });
  }

  return items;
}

/** Persisted reconciliation item row from DB */
interface ExistingReconciliationRow {
  id: string;
  fit_id: string;
  status: string;
  linked_entry_id?: string;
  linked_entry_table?: string;
  match_score?: number;
  reconciled_by?: string;
  reconciled_at?: string;
}

/**
 * Get already-imported reconciliation items (full rows, not just FITIDs).
 * This allows re-import to show previously processed transactions with their
 * saved status (matched/created/ignored) instead of silently dropping them.
 */
async function getExistingItems(
  tenantId: string,
): Promise<Map<string, ExistingReconciliationRow>> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "bank_reconciliation_items",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "created_at DESC",
        limit: 5000,
      }),
    });
    const rows = normalizeCrudList<ExistingReconciliationRow>(res.data);
    const map = new Map<string, ExistingReconciliationRow>();
    for (const row of rows) {
      if (row.fit_id) map.set(row.fit_id, row);
    }
    return map;
  } catch {
    // Table might not exist yet — that's fine
    return new Map();
  }
}

/**
 * Fetch pending/partial AR entries for matching against credits.
 */
async function fetchCandidateAR(
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_receivable",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "status", value: "pending,partial,overdue", operator: "in" },
        ],
        { sortColumn: "due_date DESC", limit: 500 },
      ),
    });
    return normalizeCrudList<Record<string, unknown>>(res.data).filter(
      (item) => !item.deleted_at,
    );
  } catch {
    return [];
  }
}

/**
 * Fetch pending/partial AP entries for matching against debits.
 */
async function fetchCandidateAP(
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "accounts_payable",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "status", value: "pending,partial,overdue", operator: "in" },
        ],
        { sortColumn: "due_date DESC", limit: 500 },
      ),
    });
    return normalizeCrudList<Record<string, unknown>>(res.data).filter(
      (item) => !item.deleted_at,
    );
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Actions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Match a bank transaction to an existing AR/AP entry.
 *
 * Updates the AR/AP status to "paid" and records the reconciliation.
 */
export async function matchTransaction(
  tenantId: string,
  transaction: BankTransaction,
  matchEntry: ReconciliationMatch,
  importId: string,
  userId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const now = new Date().toISOString();

    // Update the matched entry status to "paid"
    if (matchEntry.entryTable === "accounts_receivable") {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "accounts_receivable",
        payload: {
          id: matchEntry.entryId,
          status: "paid",
          amount_received: matchEntry.amount,
          received_at: transaction.date.toISOString(),
          notes: JSON.stringify({
            reconciled: true,
            bank_fit_id: transaction.fitId,
            bank_description: transaction.description,
            reconciled_at: now,
            reconciled_by: userId,
          }),
        },
      });
    } else {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "accounts_payable",
        payload: {
          id: matchEntry.entryId,
          status: "paid",
          amount_paid: matchEntry.amount,
          paid_at: transaction.date.toISOString(),
          notes: JSON.stringify({
            reconciled: true,
            bank_fit_id: transaction.fitId,
            bank_description: transaction.description,
            reconciled_at: now,
            reconciled_by: userId,
          }),
        },
      });
    }

    // Record the reconciliation item
    await saveReconciliationItem({
      tenant_id: tenantId,
      import_id: importId,
      fit_id: transaction.fitId,
      transaction_date: transaction.dateStr,
      transaction_amount: transaction.amount,
      transaction_description: transaction.description,
      transaction_type: transaction.type,
      status: "matched",
      linked_entry_id: matchEntry.entryId,
      linked_entry_table: matchEntry.entryTable,
      match_score: matchEntry.score,
      reconciled_by: userId,
      reconciled_at: now,
    });

    return { success: true };
  } catch (err) {
    console.error("[Reconciliation] matchTransaction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao conciliar",
    };
  }
}

/**
 * Create a new AR or AP entry from a bank transaction.
 *
 * Credits → AccountReceivable (money in)
 * Debits → AccountPayable (money out)
 */
export async function createEntryFromTransaction(
  tenantId: string,
  transaction: BankTransaction,
  importId: string,
  overrides: {
    description?: string;
    category?: string;
    type?: string;
    customerId?: string;
    supplierName?: string;
    competenceDate?: string;
  } = {},
  userId?: string,
): Promise<{ success: boolean; entryId?: string; error?: string }> {
  try {
    const now = new Date().toISOString();
    const description = overrides.description || transaction.description;
    const category = overrides.category || "Importado do banco";
    const entryType = overrides.type || "other";

    let entryId: string;
    let entryTable: "accounts_receivable" | "accounts_payable";

    if (transaction.type === "credit") {
      // Create AR entry
      const ar = await createAccountReceivable({
        tenant_id: tenantId,
        description,
        type: entryType as AccountReceivable["type"],
        category,
        customer_id: overrides.customerId ?? undefined,
        amount: transaction.absoluteAmount,
        amount_received: transaction.absoluteAmount,
        status: "paid",
        currency: "BRL",
        due_date: transaction.dateStr,
        received_at: transaction.date.toISOString(),
        competence_date:
          overrides.competenceDate ?? transaction.dateStr.slice(0, 7) + "-01",
        recurrence: "none",
        notes: JSON.stringify({
          source: "bank_reconciliation",
          bank_fit_id: transaction.fitId,
          bank_description: transaction.description,
          import_id: importId,
          created_at: now,
        }),
        created_by: userId,
      } as Partial<AccountReceivable>);
      entryId = ar.id;
      entryTable = "accounts_receivable";
    } else {
      // Create AP entry
      const ap = await createAccountPayable({
        tenant_id: tenantId,
        description,
        type: entryType as AccountPayable["type"],
        category,
        supplier_name: overrides.supplierName ?? undefined,
        amount: transaction.absoluteAmount,
        amount_paid: transaction.absoluteAmount,
        status: "paid",
        currency: "BRL",
        due_date: transaction.dateStr,
        paid_at: transaction.date.toISOString(),
        competence_date:
          overrides.competenceDate ?? transaction.dateStr.slice(0, 7) + "-01",
        recurrence: "none",
        notes: JSON.stringify({
          source: "bank_reconciliation",
          bank_fit_id: transaction.fitId,
          bank_description: transaction.description,
          import_id: importId,
          created_at: now,
        }),
        created_by: userId,
      } as Partial<AccountPayable>);
      entryId = ap.id;
      entryTable = "accounts_payable";
    }

    // Record the reconciliation item
    await saveReconciliationItem({
      tenant_id: tenantId,
      import_id: importId,
      fit_id: transaction.fitId,
      transaction_date: transaction.dateStr,
      transaction_amount: transaction.amount,
      transaction_description: transaction.description,
      transaction_type: transaction.type,
      status: "created",
      linked_entry_id: entryId,
      linked_entry_table: entryTable,
      reconciled_by: userId,
      reconciled_at: now,
    });

    return { success: true, entryId };
  } catch (err) {
    console.error("[Reconciliation] createEntryFromTransaction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao criar lançamento",
    };
  }
}

/**
 * Mark a transaction as "ignored" (already reconciled or irrelevant).
 */
export async function ignoreTransaction(
  tenantId: string,
  transaction: BankTransaction,
  importId: string,
  reason?: string,
  userId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await saveReconciliationItem({
      tenant_id: tenantId,
      import_id: importId,
      fit_id: transaction.fitId,
      transaction_date: transaction.dateStr,
      transaction_amount: transaction.amount,
      transaction_description: transaction.description,
      transaction_type: transaction.type,
      status: "ignored",
      notes: reason ?? undefined,
      reconciled_by: userId,
      reconciled_at: new Date().toISOString(),
    });

    return { success: true };
  } catch (err) {
    console.error("[Reconciliation] ignoreTransaction error:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erro ao ignorar transação",
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

/**
 * Save a reconciliation import record (the uploaded file).
 */
export async function saveReconciliationImport(
  data: Omit<ReconciliationImport, "id">,
): Promise<{ id: string }> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "bank_reconciliation_imports",
    payload: {
      tenant_id: data.tenantId,
      file_name: data.fileName,
      bank_id: data.bankId ?? null,
      account_id: data.accountId ?? null,
      period_start: data.periodStart ?? null,
      period_end: data.periodEnd ?? null,
      total_transactions: data.totalTransactions,
      total_credits: data.totalCredits,
      total_debits: data.totalDebits,
      credit_amount: data.creditAmount,
      debit_amount: data.debitAmount,
      reconciled_count: 0,
      imported_at: data.importedAt,
      imported_by: data.importedBy ?? null,
    },
  });
  return normalizeCrudOne<{ id: string }>(res.data);
}

/**
 * Save a reconciliation item (individual transaction status).
 */
async function saveReconciliationItem(data: {
  tenant_id: string;
  import_id: string;
  fit_id: string;
  transaction_date: string;
  transaction_amount: number;
  transaction_description: string;
  transaction_type: string;
  status: string;
  linked_entry_id?: string;
  linked_entry_table?: string;
  match_score?: number;
  notes?: string;
  reconciled_by?: string;
  reconciled_at?: string;
}): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: "bank_reconciliation_items",
    payload: data,
  });
}

/**
 * Update import reconciled count.
 */
export async function updateImportReconciledCount(
  importId: string,
  reconciledCount: number,
): Promise<void> {
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "bank_reconciliation_imports",
    payload: {
      id: importId,
      reconciled_count: reconciledCount,
    },
  });
}

/**
 * Calculate reconciliation summary from items.
 */
export function calculateSummary(
  items: ReconciliationItem[],
): ReconciliationSummary {
  const credits = items.filter((i) => i.transaction.type === "credit");
  const debits = items.filter((i) => i.transaction.type === "debit");

  return {
    total: items.length,
    pending: items.filter((i) => i.status === "pending").length,
    matched: items.filter((i) => i.status === "matched").length,
    created: items.filter((i) => i.status === "created").length,
    ignored: items.filter((i) => i.status === "ignored").length,
    totalCredits: credits.length,
    totalDebits: debits.length,
    creditAmount: credits.reduce(
      (sum, i) => sum + i.transaction.absoluteAmount,
      0,
    ),
    debitAmount: debits.reduce(
      (sum, i) => sum + i.transaction.absoluteAmount,
      0,
    ),
  };
}

/**
 * List past reconciliation imports for a tenant.
 */
export async function listReconciliationImports(
  tenantId: string,
): Promise<ReconciliationImport[]> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "bank_reconciliation_imports",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        sortColumn: "imported_at DESC",
        limit: 50,
      }),
    });
    return normalizeCrudList<Record<string, unknown>>(res.data)
      .filter((item) => !item.deleted_at)
      .map((row) => ({
        id: String(row.id ?? ""),
        tenantId: String(row.tenant_id ?? ""),
        fileName: String(row.file_name ?? ""),
        bankId: row.bank_id as string | undefined,
        accountId: row.account_id as string | undefined,
        periodStart: row.period_start as string | undefined,
        periodEnd: row.period_end as string | undefined,
        totalTransactions: Number(row.total_transactions ?? 0),
        totalCredits: Number(row.total_credits ?? 0),
        totalDebits: Number(row.total_debits ?? 0),
        creditAmount: Number(row.credit_amount ?? 0),
        debitAmount: Number(row.debit_amount ?? 0),
        reconciledCount: Number(row.reconciled_count ?? 0),
        importedAt: String(row.imported_at ?? ""),
        importedBy: row.imported_by as string | undefined,
      }));
  } catch {
    return [];
  }
}
