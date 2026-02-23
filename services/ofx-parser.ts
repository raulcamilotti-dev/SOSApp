/**
 * OFX Parser — Pure JavaScript OFX/QFX file parser
 *
 * Parses OFX (Open Financial Exchange) bank statement files into typed
 * transaction objects. Works in React Native (no Node.js dependencies).
 *
 * OFX is an SGML-like format used by banks for electronic statements.
 * This parser handles both OFX 1.x (SGML) and OFX 2.x (XML) formats.
 *
 * Usage:
 *   const result = parseOFX(fileContent);
 *   result.transactions → BankTransaction[]
 *   result.account → account info (bank, agency, number)
 *   result.period → { start, end } dates
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TransactionType =
  | "credit" // Money IN (deposit, transfer received, PIX received)
  | "debit"; // Money OUT (payment, transfer sent, withdrawal)

export interface BankTransaction {
  /** Unique transaction ID from OFX (FITID) */
  fitId: string;
  /** Transaction type: credit (money in) or debit (money out) */
  type: TransactionType;
  /** Original OFX transaction type code (TRNTYPE) */
  ofxType: string;
  /** Transaction date */
  date: Date;
  /** Formatted date string (YYYY-MM-DD) */
  dateStr: string;
  /** Transaction amount (positive = credit, negative = debit) */
  amount: number;
  /** Absolute amount (always positive) */
  absoluteAmount: number;
  /** Transaction description / memo from bank */
  description: string;
  /** Check number (CHECKNUM), if available */
  checkNumber?: string;
  /** Reference number (REFNUM), if available */
  refNumber?: string;
  /** Payee name (NAME), if available */
  payeeName?: string;
}

export interface BankAccount {
  /** Bank institution ID (BANKID / routing number) */
  bankId?: string;
  /** Branch/agency number (BRANCHID) */
  branchId?: string;
  /** Account number (ACCTID) */
  accountId?: string;
  /** Account type: CHECKING, SAVINGS, CREDITLINE, etc. */
  accountType?: string;
  /** Currency code (CURDEF) */
  currency?: string;
}

export interface OFXStatementPeriod {
  /** Start date of the statement */
  start: Date | null;
  /** End date of the statement */
  end: Date | null;
}

export interface OFXParseResult {
  /** Parsed bank transactions */
  transactions: BankTransaction[];
  /** Bank account information */
  account: BankAccount;
  /** Statement period */
  period: OFXStatementPeriod;
  /** Available balance at end of statement */
  availableBalance?: number;
  /** Ledger balance at end of statement */
  ledgerBalance?: number;
  /** Balance date */
  balanceDate?: Date;
  /** Original filename (set by caller) */
  fileName?: string;
  /** Parse warnings (non-fatal issues) */
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/*  OFX Date Parser                                                    */
/* ------------------------------------------------------------------ */

/**
 * Parse OFX date format: YYYYMMDD or YYYYMMDDHHMMSS or YYYYMMDDHHMMSS.XXX[TZ]
 */
function parseOFXDate(dateStr: string | undefined): Date | null {
  if (!dateStr || dateStr.length < 8) return null;

  // Strip timezone info like [-3:BRT] or [0:GMT]
  const clean = dateStr.replace(/\[.*\]/, "").trim();

  const year = parseInt(clean.substring(0, 4), 10);
  const month = parseInt(clean.substring(4, 6), 10) - 1; // JS months are 0-based
  const day = parseInt(clean.substring(6, 8), 10);
  const hour = clean.length >= 10 ? parseInt(clean.substring(8, 10), 10) : 0;
  const min = clean.length >= 12 ? parseInt(clean.substring(10, 12), 10) : 0;
  const sec = clean.length >= 14 ? parseInt(clean.substring(12, 14), 10) : 0;

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  return new Date(year, month, day, hour, min, sec);
}

/**
 * Format a Date to YYYY-MM-DD string.
 */
function formatDateStr(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ------------------------------------------------------------------ */
/*  OFX Tag Extractor                                                  */
/* ------------------------------------------------------------------ */

/**
 * Extract the value of a single OFX tag.
 * OFX 1.x uses self-closing tags: <TAG>value
 * OFX 2.x uses XML: <TAG>value</TAG>
 */
function extractTag(content: string, tag: string): string | undefined {
  // Try XML-style first: <TAG>value</TAG>
  const xmlRegex = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const xmlMatch = content.match(xmlRegex);
  if (xmlMatch) return xmlMatch[1].trim();

  // SGML-style: <TAG>value (terminated by next tag or newline)
  const sgmlRegex = new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, "i");
  const sgmlMatch = content.match(sgmlRegex);
  if (sgmlMatch) return sgmlMatch[1].trim();

  return undefined;
}

/**
 * Extract all occurrences of a wrapper block (e.g., <STMTTRN>...</STMTTRN>).
 */
function extractBlocks(content: string, tag: string): string[] {
  const blocks: string[] = [];
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;

  let pos = 0;
  while (true) {
    const start = content.indexOf(openTag, pos);
    if (start === -1) break;

    const end = content.indexOf(closeTag, start);
    if (end === -1) {
      // SGML style: find next opening of same tag or end of parent
      const nextOpen = content.indexOf(openTag, start + openTag.length);
      const block = content.substring(
        start + openTag.length,
        nextOpen === -1 ? content.length : nextOpen,
      );
      blocks.push(block);
      pos = nextOpen === -1 ? content.length : nextOpen;
    } else {
      blocks.push(content.substring(start + openTag.length, end));
      pos = end + closeTag.length;
    }
  }

  return blocks;
}

/* ------------------------------------------------------------------ */
/*  Transaction Type Mapping                                           */
/* ------------------------------------------------------------------ */

/**
 * Map OFX TRNTYPE to our credit/debit classification.
 *
 * OFX standard types:
 * CREDIT, DEBIT, INT (interest), DIV (dividend), FEE, SRVCHG (service charge),
 * DEP (deposit), ATM, POS (point of sale), XFER (transfer), CHECK,
 * PAYMENT, CASH, DIRECTDEP, DIRECTDEBIT, REPEATPMT, OTHER
 */
function classifyTransactionType(
  ofxType: string,
  amount: number,
): TransactionType {
  const upper = ofxType.toUpperCase().trim();

  // These are always credits (money in)
  const creditTypes = new Set(["CREDIT", "DEP", "DIRECTDEP", "INT", "DIV"]);

  // These are always debits (money out)
  const debitTypes = new Set([
    "DEBIT",
    "FEE",
    "SRVCHG",
    "ATM",
    "POS",
    "CHECK",
    "PAYMENT",
    "DIRECTDEBIT",
    "REPEATPMT",
    "CASH",
  ]);

  if (creditTypes.has(upper)) return "credit";
  if (debitTypes.has(upper)) return "debit";

  // For XFER, OTHER, or unknown: use the sign of the amount
  return amount >= 0 ? "credit" : "debit";
}

/* ------------------------------------------------------------------ */
/*  Main Parser                                                        */
/* ------------------------------------------------------------------ */

/**
 * Parse an OFX file content string into structured data.
 *
 * @param content - Raw OFX file content (string)
 * @returns Parsed result with transactions, account info, and period
 */
export function parseOFX(content: string): OFXParseResult {
  const warnings: string[] = [];

  // Normalize line endings
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // --- Account info ---
  const account: BankAccount = {
    bankId: extractTag(normalized, "BANKID"),
    branchId: extractTag(normalized, "BRANCHID"),
    accountId: extractTag(normalized, "ACCTID"),
    accountType: extractTag(normalized, "ACCTTYPE"),
    currency: extractTag(normalized, "CURDEF"),
  };

  // --- Statement period ---
  const dtStart = parseOFXDate(extractTag(normalized, "DTSTART"));
  const dtEnd = parseOFXDate(extractTag(normalized, "DTEND"));

  // --- Balances ---
  let ledgerBalance: number | undefined;
  let availableBalance: number | undefined;
  let balanceDate: Date | undefined;

  const ledgerBalStr = extractTag(normalized, "BALAMT");
  if (ledgerBalStr) ledgerBalance = parseFloat(ledgerBalStr);

  const availBalBlock = normalized.match(/<AVAILBAL>([\s\S]*?)<\/AVAILBAL>/i);
  if (availBalBlock) {
    const ab = extractTag(availBalBlock[1], "BALAMT");
    if (ab) availableBalance = parseFloat(ab);
  }

  const balDateStr = extractTag(normalized, "DTASOF");
  if (balDateStr) balanceDate = parseOFXDate(balDateStr) ?? undefined;

  // --- Transactions ---
  const transactionBlocks = extractBlocks(normalized, "STMTTRN");
  const transactions: BankTransaction[] = [];

  for (const block of transactionBlocks) {
    const ofxType = extractTag(block, "TRNTYPE") ?? "OTHER";
    const dateStr = extractTag(block, "DTPOSTED");
    const amountStr = extractTag(block, "TRNAMT");
    const fitId = extractTag(block, "FITID") ?? "";
    const name = extractTag(block, "NAME");
    const memo = extractTag(block, "MEMO");
    const checkNum = extractTag(block, "CHECKNUM");
    const refNum = extractTag(block, "REFNUM");

    if (!amountStr) {
      warnings.push(`Transaction missing TRNAMT (FITID: ${fitId})`);
      continue;
    }

    // OFX uses comma OR dot as decimal separator depending on locale
    const amount = parseFloat(amountStr.replace(",", "."));
    if (isNaN(amount)) {
      warnings.push(`Invalid amount "${amountStr}" (FITID: ${fitId})`);
      continue;
    }

    const date = parseOFXDate(dateStr);
    if (!date) {
      warnings.push(`Invalid date "${dateStr}" (FITID: ${fitId})`);
      continue;
    }

    // Build description from NAME + MEMO (banks vary which they use)
    const description =
      [name, memo].filter(Boolean).join(" — ").trim() || ofxType;

    transactions.push({
      fitId,
      type: classifyTransactionType(ofxType, amount),
      ofxType,
      date,
      dateStr: formatDateStr(date),
      amount,
      absoluteAmount: Math.abs(amount),
      description,
      checkNumber: checkNum,
      refNumber: refNum,
      payeeName: name,
    });
  }

  // Sort by date (newest first)
  transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (transactions.length === 0) {
    warnings.push(
      "Nenhuma transação encontrada no arquivo OFX. Verifique se o formato está correto.",
    );
  }

  return {
    transactions,
    account,
    period: { start: dtStart, end: dtEnd },
    ledgerBalance,
    availableBalance,
    balanceDate,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers for consumers                                              */
/* ------------------------------------------------------------------ */

/** Get total credits (money in) */
export function getTotalCredits(transactions: BankTransaction[]): number {
  return transactions
    .filter((t) => t.type === "credit")
    .reduce((sum, t) => sum + t.absoluteAmount, 0);
}

/** Get total debits (money out) */
export function getTotalDebits(transactions: BankTransaction[]): number {
  return transactions
    .filter((t) => t.type === "debit")
    .reduce((sum, t) => sum + t.absoluteAmount, 0);
}

/** Group transactions by date */
export function groupByDate(
  transactions: BankTransaction[],
): Map<string, BankTransaction[]> {
  const groups = new Map<string, BankTransaction[]>();
  for (const tx of transactions) {
    const existing = groups.get(tx.dateStr) ?? [];
    existing.push(tx);
    groups.set(tx.dateStr, existing);
  }
  return groups;
}

/** Get period summary text */
export function getPeriodText(period: OFXStatementPeriod): string {
  if (!period.start && !period.end) return "Período não informado";
  const startStr = period.start ? formatDateStr(period.start) : "?";
  const endStr = period.end ? formatDateStr(period.end) : "?";
  return `${startStr} a ${endStr}`;
}
