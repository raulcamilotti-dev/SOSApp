/**
 * Bank Transactions Service
 *
 * Creates entries in `bank_transactions` and updates `bank_accounts.current_balance`.
 *
 * Used by:
 * - ContasAReceber — auto-creates credit entry when status → "paid"
 * - ContasAPagar  — auto-creates debit entry when status → "paid"
 * - extrato-bancario — manual entries by operator (still allowed)
 * - Bank reconciliation — matching imported OFX data
 */

import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "@/services/crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TransactionType = "credit" | "debit";

export type ReferenceType =
  | "invoice"
  | "payment"
  | "accounts_receivable"
  | "accounts_payable"
  | "service_order"
  | "quote"
  | "transfer"
  | "manual"
  | "other";

export interface CreateBankTransactionParams {
  tenant_id: string;
  bank_account_id: string;
  transaction_date?: string; // ISO date, defaults to today
  description: string;
  amount: number; // Always positive; direction from transaction_type
  transaction_type: TransactionType;
  category?: string;
  reference_type?: ReferenceType;
  reference_id?: string;
  chart_account_id?: string;
  notes?: string;
  created_by?: string;
}

export interface BankTransaction {
  id: string;
  tenant_id: string;
  bank_account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  transaction_type: TransactionType;
  category?: string;
  reference_type?: string;
  reference_id?: string;
  balance_after?: number;
  chart_account_id?: string;
  notes?: string;
  reconciled: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const toISODate = (d?: string): string => {
  if (d) {
    // If already ISO date (YYYY-MM-DD), use as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // If ISO datetime string, extract date part
    const parsed = new Date(d);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split("T")[0];
    }
  }
  return new Date().toISOString().split("T")[0];
};

/* ------------------------------------------------------------------ */
/*  Core: create a bank transaction + update balance                   */
/* ------------------------------------------------------------------ */

/**
 * Creates a bank transaction entry and updates the bank account balance.
 *
 * Flow:
 * 1. Check if a duplicate already exists (same reference_type + reference_id)
 * 2. Fetch current bank account balance
 * 3. Insert bank_transactions row with computed balance_after
 * 4. Update bank_accounts.current_balance
 *
 * @returns The created transaction, or null if skipped (duplicate / missing account)
 */
export async function createBankTransaction(
  params: CreateBankTransactionParams,
): Promise<BankTransaction | null> {
  const {
    tenant_id,
    bank_account_id,
    description,
    amount,
    transaction_type,
    category,
    reference_type,
    reference_id,
    chart_account_id,
    notes,
    created_by,
  } = params;

  // Validate required fields
  if (!tenant_id || !bank_account_id || !description || !amount) {
    console.warn(
      "[bank-transactions] Missing required fields, skipping",
      params,
    );
    return null;
  }

  const positiveAmount = Math.abs(amount);
  if (positiveAmount <= 0) {
    console.warn("[bank-transactions] Zero amount, skipping");
    return null;
  }

  const transactionDate = toISODate(params.transaction_date);

  // ── 1. Duplicate check ──
  if (reference_type && reference_id) {
    try {
      const dupRes = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "bank_transactions",
        ...buildSearchParams(
          [
            { field: "reference_type", value: reference_type },
            { field: "reference_id", value: reference_id },
            { field: "tenant_id", value: tenant_id },
          ],
          { autoExcludeDeleted: true },
        ),
      });
      const existing = normalizeCrudList<BankTransaction>(dupRes.data);
      if (existing.length > 0) {
        console.log(
          `[bank-transactions] Duplicate detected for ${reference_type}/${reference_id}, skipping`,
        );
        return existing[0];
      }
    } catch {
      // If duplicate check fails, proceed anyway
    }
  }

  // ── 2. Fetch current balance ──
  // WARNING: This read-compute-write pattern is NOT atomic. Two concurrent calls
  // for the same bank_account_id can corrupt the balance. Until the API supports
  // server-side atomic increments, callers should serialize operations per account.
  let currentBalance = 0;
  try {
    const acctRes = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "bank_accounts",
      ...buildSearchParams([
        { field: "id", value: bank_account_id },
        { field: "tenant_id", value: tenant_id },
      ]),
    });
    const accounts = normalizeCrudList<{
      id: string;
      current_balance?: number;
      tenant_id?: string;
    }>(acctRes.data);
    const acct = accounts.find((a) => a.id === bank_account_id);
    if (!acct) {
      console.error(
        `[bank-transactions] Bank account ${bank_account_id} not found for tenant ${tenant_id}, aborting`,
      );
      return null;
    }
    currentBalance = Number(acct.current_balance ?? 0);
  } catch {
    console.warn(
      "[bank-transactions] Could not fetch account balance, using 0",
    );
  }

  // ── 3. Compute new balance ──
  const balanceAfter =
    transaction_type === "credit"
      ? currentBalance + positiveAmount
      : currentBalance - positiveAmount;

  // Round to 2 decimal places
  const balanceAfterRounded = Math.round(balanceAfter * 100) / 100;

  // ── 4. Insert bank_transactions row ──
  const payload: Record<string, unknown> = {
    tenant_id,
    bank_account_id,
    transaction_date: transactionDate,
    description,
    amount: positiveAmount,
    transaction_type,
    category: category ?? null,
    reference_type: reference_type ?? "manual",
    reference_id: reference_id ?? null,
    balance_after: balanceAfterRounded,
    chart_account_id: chart_account_id ?? null,
    notes: notes ?? null,
    reconciled: false,
    created_by: created_by ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    const createRes = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "bank_transactions",
      payload,
    });

    const created = normalizeCrudOne<BankTransaction>(createRes.data);

    // ── 5. Update bank_accounts.current_balance ──
    // If this fails, the transaction exists but balance is out of sync.
    // This is a known consistency risk — see race condition warning above.
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "bank_accounts",
        payload: {
          id: bank_account_id,
          current_balance: balanceAfterRounded,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (balanceErr) {
      console.error(
        `[bank-transactions] CRITICAL: Transaction ${created?.id} created but balance update FAILED for account ${bank_account_id}. ` +
          `Expected balance: ${balanceAfterRounded}. Manual reconciliation needed.`,
        balanceErr,
      );
      // Transaction was created but balance may be stale. The balance_after field
      // on the transaction itself is correct, so recalculateStockFromMovements or
      // a manual balance recalculation can recover from this state.
    }

    return created ?? null;
  } catch (err) {
    console.error("[bank-transactions] Failed to create transaction:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Convenience: create from AR payment                                */
/* ------------------------------------------------------------------ */

/**
 * Auto-creates a CREDIT bank transaction when an accounts_receivable entry
 * is marked as "paid". Requires bank_account_id on the AR entry.
 *
 * @param arEntry - The full accounts_receivable record
 * @param userId  - ID of the user confirming payment
 */
export async function createBankEntryFromAR(
  arEntry: Record<string, unknown>,
  userId?: string,
): Promise<BankTransaction | null> {
  const bankAccountId = String(arEntry.bank_account_id ?? "").trim();
  const tenantId = String(arEntry.tenant_id ?? "").trim();
  const arId = String(arEntry.id ?? "").trim();

  if (!bankAccountId || !tenantId || !arId) {
    console.log(
      "[bank-transactions] AR entry missing bank_account_id or tenant_id, skipping bank entry",
    );
    return null;
  }

  const amount = Number(arEntry.amount_received ?? arEntry.amount ?? 0);
  if (amount <= 0) return null;

  const description = buildARDescription(arEntry);

  return createBankTransaction({
    tenant_id: tenantId,
    bank_account_id: bankAccountId,
    transaction_date: String(
      arEntry.paid_at ?? arEntry.payment_date ?? new Date().toISOString(),
    ),
    description,
    amount,
    transaction_type: "credit",
    category: "Recebimento",
    reference_type: "accounts_receivable",
    reference_id: arId,
    chart_account_id: arEntry.chart_account_id
      ? String(arEntry.chart_account_id)
      : undefined,
    notes: `Lançamento automático — Conta a Receber: ${description}`,
    created_by: userId,
  });
}

/* ------------------------------------------------------------------ */
/*  Convenience: create from AP payment                                */
/* ------------------------------------------------------------------ */

/**
 * Auto-creates a DEBIT bank transaction when an accounts_payable entry
 * is marked as "paid". Requires bank_account_id on the AP entry.
 *
 * @param apEntry - The full accounts_payable record
 * @param userId  - ID of the user confirming payment
 */
export async function createBankEntryFromAP(
  apEntry: Record<string, unknown>,
  userId?: string,
): Promise<BankTransaction | null> {
  const bankAccountId = String(apEntry.bank_account_id ?? "").trim();
  const tenantId = String(apEntry.tenant_id ?? "").trim();
  const apId = String(apEntry.id ?? "").trim();

  if (!bankAccountId || !tenantId || !apId) {
    console.log(
      "[bank-transactions] AP entry missing bank_account_id or tenant_id, skipping bank entry",
    );
    return null;
  }

  const amount = Number(apEntry.amount_paid ?? apEntry.amount ?? 0);
  if (amount <= 0) return null;

  const description = buildAPDescription(apEntry);

  return createBankTransaction({
    tenant_id: tenantId,
    bank_account_id: bankAccountId,
    transaction_date: String(
      apEntry.paid_at ?? apEntry.payment_date ?? new Date().toISOString(),
    ),
    description,
    amount,
    transaction_type: "debit",
    category: "Pagamento",
    reference_type: "accounts_payable",
    reference_id: apId,
    chart_account_id: apEntry.chart_account_id
      ? String(apEntry.chart_account_id)
      : undefined,
    notes: `Lançamento automático — Conta a Pagar: ${description}`,
    created_by: userId,
  });
}

/* ------------------------------------------------------------------ */
/*  Description builders                                               */
/* ------------------------------------------------------------------ */

function buildARDescription(entry: Record<string, unknown>): string {
  const desc = String(entry.description ?? "").trim();
  const customerName = String(entry.customer_name ?? "").trim();
  const type = String(entry.type ?? "").trim();

  const parts: string[] = [];
  if (type) parts.push(`[${type}]`);
  if (desc) parts.push(desc);
  if (customerName) parts.push(`— ${customerName}`);

  return parts.length > 0 ? parts.join(" ") : "Recebimento";
}

function buildAPDescription(entry: Record<string, unknown>): string {
  const desc = String(entry.description ?? "").trim();
  const supplierName = String(entry.supplier_name ?? "").trim();
  const category = String(entry.category ?? "").trim();

  const parts: string[] = [];
  if (category) parts.push(`[${category}]`);
  if (desc) parts.push(desc);
  if (supplierName) parts.push(`— ${supplierName}`);

  return parts.length > 0 ? parts.join(" ") : "Pagamento";
}
