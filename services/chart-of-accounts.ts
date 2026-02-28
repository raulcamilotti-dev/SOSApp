/**
 * Chart of Accounts (Plano de Contas) service
 *
 * Provides CRUD helpers and default account seeding for the
 * hierarchical chart_of_accounts table.
 */

import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ChartAccount {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  code: string;
  name: string;
  type: "revenue" | "cost" | "expense";
  level: number;
  is_leaf: boolean;
  is_active: boolean;
  is_system_default: boolean;
  display_order: number;
  description: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/* ------------------------------------------------------------------ */
/*  Default Chart of Accounts Template                                 */
/*  3 levels: Group → Subgroup → Leaf account                         */
/* ------------------------------------------------------------------ */

interface SeedAccount {
  code: string;
  name: string;
  type: "revenue" | "cost" | "expense";
  level: number;
  is_leaf: boolean;
  display_order: number;
  parentCode?: string; // resolved at insert time
  description?: string;
}

const DEFAULT_ACCOUNTS: SeedAccount[] = [
  // ═══════ 1 — RECEITAS ═══════
  {
    code: "1",
    name: "Receitas",
    type: "revenue",
    level: 1,
    is_leaf: false,
    display_order: 100,
  },
  // 1.1 — Receitas Operacionais
  {
    code: "1.1",
    name: "Receitas Operacionais",
    type: "revenue",
    level: 2,
    is_leaf: false,
    display_order: 110,
    parentCode: "1",
  },
  {
    code: "1.1.01",
    name: "Receita de Serviços",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 111,
    parentCode: "1.1",
  },
  {
    code: "1.1.02",
    name: "Receita de Produtos",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 112,
    parentCode: "1.1",
  },
  {
    code: "1.1.03",
    name: "Honorários",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 113,
    parentCode: "1.1",
  },
  {
    code: "1.1.04",
    name: "Mensalidades",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 114,
    parentCode: "1.1",
  },
  {
    code: "1.1.05",
    name: "Comissões Recebidas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 115,
    parentCode: "1.1",
  },
  // 1.2 — Receitas Financeiras
  {
    code: "1.2",
    name: "Receitas Financeiras",
    type: "revenue",
    level: 2,
    is_leaf: false,
    display_order: 120,
    parentCode: "1",
  },
  {
    code: "1.2.01",
    name: "Juros Recebidos",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 121,
    parentCode: "1.2",
  },
  {
    code: "1.2.02",
    name: "Rendimentos de Aplicação",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 122,
    parentCode: "1.2",
  },
  // 1.3 — Outras Receitas
  {
    code: "1.3",
    name: "Outras Receitas",
    type: "revenue",
    level: 2,
    is_leaf: false,
    display_order: 130,
    parentCode: "1",
  },
  {
    code: "1.3.01",
    name: "Transferências Recebidas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 131,
    parentCode: "1.3",
  },
  {
    code: "1.3.02",
    name: "Outras Receitas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 132,
    parentCode: "1.3",
  },
  // 1.4 — Receitas de Vendas
  {
    code: "1.4",
    name: "Receitas de Vendas",
    type: "revenue",
    level: 2,
    is_leaf: false,
    display_order: 140,
    parentCode: "1",
  },
  {
    code: "1.4.01",
    name: "Vendas no Balcão / PDV",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 141,
    parentCode: "1.4",
  },
  {
    code: "1.4.02",
    name: "Vendas Online / E-commerce",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 142,
    parentCode: "1.4",
  },
  {
    code: "1.4.03",
    name: "Vendas Marketplace",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 143,
    parentCode: "1.4",
  },
  {
    code: "1.4.04",
    name: "Vendas por Atacado",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 144,
    parentCode: "1.4",
  },
  {
    code: "1.4.05",
    name: "Descontos sobre Vendas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 145,
    parentCode: "1.4",
    description: "Conta redutora — abatimentos e descontos concedidos",
  },
  {
    code: "1.4.06",
    name: "Devoluções de Vendas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 146,
    parentCode: "1.4",
    description: "Conta redutora — devoluções recebidas de clientes",
  },
  {
    code: "1.4.07",
    name: "Frete sobre Vendas",
    type: "revenue",
    level: 3,
    is_leaf: true,
    display_order: 147,
    parentCode: "1.4",
    description: "Receita de frete cobrado do cliente na venda",
  },

  // ═══════ 2 — CUSTOS ═══════
  {
    code: "2",
    name: "Custos",
    type: "cost",
    level: 1,
    is_leaf: false,
    display_order: 200,
  },
  // 2.1 — Custos Operacionais
  {
    code: "2.1",
    name: "Custos Operacionais",
    type: "cost",
    level: 2,
    is_leaf: false,
    display_order: 210,
    parentCode: "2",
  },
  {
    code: "2.1.01",
    name: "Custo de Mercadoria Vendida",
    type: "cost",
    level: 3,
    is_leaf: true,
    display_order: 211,
    parentCode: "2.1",
  },
  {
    code: "2.1.02",
    name: "Custo de Serviço Prestado",
    type: "cost",
    level: 3,
    is_leaf: true,
    display_order: 212,
    parentCode: "2.1",
  },
  {
    code: "2.1.03",
    name: "Pagamento a Parceiros",
    type: "cost",
    level: 3,
    is_leaf: true,
    display_order: 213,
    parentCode: "2.1",
  },
  {
    code: "2.1.04",
    name: "Comissões Pagas",
    type: "cost",
    level: 3,
    is_leaf: true,
    display_order: 214,
    parentCode: "2.1",
  },

  // ═══════ 3 — DESPESAS ═══════
  {
    code: "3",
    name: "Despesas",
    type: "expense",
    level: 1,
    is_leaf: false,
    display_order: 300,
  },
  // 3.1 — Despesas Administrativas
  {
    code: "3.1",
    name: "Despesas Administrativas",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 310,
    parentCode: "3",
  },
  {
    code: "3.1.01",
    name: "Aluguel",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 311,
    parentCode: "3.1",
  },
  {
    code: "3.1.02",
    name: "Condomínio",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 312,
    parentCode: "3.1",
  },
  {
    code: "3.1.03",
    name: "Energia Elétrica",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 313,
    parentCode: "3.1",
  },
  {
    code: "3.1.04",
    name: "Água e Esgoto",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 314,
    parentCode: "3.1",
  },
  {
    code: "3.1.05",
    name: "Telefone e Internet",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 315,
    parentCode: "3.1",
  },
  {
    code: "3.1.06",
    name: "Material de Escritório",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 316,
    parentCode: "3.1",
  },
  // 3.2 — Despesas com Pessoal
  {
    code: "3.2",
    name: "Despesas com Pessoal",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 320,
    parentCode: "3",
  },
  {
    code: "3.2.01",
    name: "Salários e Ordenados",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 321,
    parentCode: "3.2",
  },
  {
    code: "3.2.02",
    name: "Pró-labore",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 322,
    parentCode: "3.2",
  },
  {
    code: "3.2.03",
    name: "Encargos Sociais",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 323,
    parentCode: "3.2",
  },
  {
    code: "3.2.04",
    name: "Benefícios (VT, VR, Plano)",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 324,
    parentCode: "3.2",
  },
  // 3.3 — Despesas Tributárias
  {
    code: "3.3",
    name: "Despesas Tributárias",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 330,
    parentCode: "3",
  },
  {
    code: "3.3.01",
    name: "Impostos Federais",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 331,
    parentCode: "3.3",
  },
  {
    code: "3.3.02",
    name: "Impostos Estaduais",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 332,
    parentCode: "3.3",
  },
  {
    code: "3.3.03",
    name: "Impostos Municipais",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 333,
    parentCode: "3.3",
  },
  {
    code: "3.3.04",
    name: "Taxas e Contribuições",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 334,
    parentCode: "3.3",
  },
  // 3.4 — Despesas Financeiras
  {
    code: "3.4",
    name: "Despesas Financeiras",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 340,
    parentCode: "3",
  },
  {
    code: "3.4.01",
    name: "Juros e Multas",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 341,
    parentCode: "3.4",
  },
  {
    code: "3.4.02",
    name: "Tarifas Bancárias",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 342,
    parentCode: "3.4",
  },
  {
    code: "3.4.03",
    name: "Empréstimos e Financiamentos",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 343,
    parentCode: "3.4",
  },
  // 3.5 — Despesas Comerciais
  {
    code: "3.5",
    name: "Despesas Comerciais",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 350,
    parentCode: "3",
  },
  {
    code: "3.5.01",
    name: "Marketing e Publicidade",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 351,
    parentCode: "3.5",
  },
  {
    code: "3.5.02",
    name: "Software e Tecnologia",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 352,
    parentCode: "3.5",
  },
  {
    code: "3.5.03",
    name: "Viagens e Deslocamentos",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 353,
    parentCode: "3.5",
  },
  {
    code: "3.5.04",
    name: "Fornecedores Diversos",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 354,
    parentCode: "3.5",
  },
  // 3.6 — Outras Despesas
  {
    code: "3.6",
    name: "Outras Despesas",
    type: "expense",
    level: 2,
    is_leaf: false,
    display_order: 360,
    parentCode: "3",
  },
  {
    code: "3.6.01",
    name: "Transferências Enviadas",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 361,
    parentCode: "3.6",
  },
  {
    code: "3.6.02",
    name: "Retiradas",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 362,
    parentCode: "3.6",
  },
  {
    code: "3.6.03",
    name: "Outras Despesas",
    type: "expense",
    level: 3,
    is_leaf: true,
    display_order: 363,
    parentCode: "3.6",
  },
];

/* ------------------------------------------------------------------ */
/*  Seed function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Seed the default chart of accounts for a tenant.
 * Skips if the tenant already has accounts.
 */
export async function seedDefaultChartOfAccounts(
  tenantId: string,
): Promise<{ created: number; skipped: boolean }> {
  // Check if tenant already has accounts
  const existing = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "chart_of_accounts",
    ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
  });
  const existingList = normalizeCrudList<ChartAccount>(existing.data).filter(
    (a) => !a.deleted_at,
  );
  if (existingList.length > 0) {
    return { created: 0, skipped: true };
  }

  // Insert level 1 first, then level 2, then level 3 (to resolve parent_id)
  const codeToId = new Map<string, string>();
  const now = new Date().toISOString();

  const sorted = [...DEFAULT_ACCOUNTS].sort(
    (a, b) => a.level - b.level || a.display_order - b.display_order,
  );

  let created = 0;
  for (const account of sorted) {
    const parentId = account.parentCode
      ? (codeToId.get(account.parentCode) ?? null)
      : null;

    const res = await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: "chart_of_accounts",
      payload: {
        tenant_id: tenantId,
        parent_id: parentId,
        code: account.code,
        name: account.name,
        type: account.type,
        level: account.level,
        is_leaf: account.is_leaf,
        is_active: true,
        is_system_default: true,
        display_order: account.display_order,
        description: account.description ?? null,
        created_at: now,
        updated_at: now,
      },
    });

    const data = res.data;
    const record = Array.isArray(data) ? data[0] : data;
    if (record?.id) {
      codeToId.set(account.code, record.id);
      created++;
    }
  }

  return { created, skipped: false };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Load all chart of accounts for a tenant (active only, sorted by code).
 */
export async function loadChartOfAccounts(
  tenantId: string,
): Promise<ChartAccount[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "chart_of_accounts",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "is_active", value: "true" },
      ],
      { sortColumn: "display_order ASC, code ASC" },
    ),
  });
  return normalizeCrudList<ChartAccount>(res.data).filter((a) => !a.deleted_at);
}

/**
 * Load only leaf accounts (is_leaf = true) for selectors.
 */
export async function loadLeafAccounts(
  tenantId: string,
): Promise<ChartAccount[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "chart_of_accounts",
    ...buildSearchParams(
      [
        { field: "tenant_id", value: tenantId },
        { field: "is_active", value: "true" },
        { field: "is_leaf", value: "true" },
      ],
      { sortColumn: "display_order ASC, code ASC" },
    ),
  });
  return normalizeCrudList<ChartAccount>(res.data).filter((a) => !a.deleted_at);
}

/**
 * Format an account for display: "1.1.01 — Receita de Serviços"
 */
export function formatAccountLabel(account: ChartAccount): string {
  return `${account.code} — ${account.name}`;
}

/* ------------------------------------------------------------------ */
/*  Auto-classification helpers                                        */
/* ------------------------------------------------------------------ */

/**
 * Well-known account codes used for automatic classification.
 * These codes match the DEFAULT_ACCOUNTS seeded for every tenant.
 */
export const KNOWN_ACCOUNT_CODES = {
  // Revenue
  RECEITA_SERVICOS: "1.1.01",
  RECEITA_PRODUTOS: "1.1.02",
  RECEITA_CONSULTORIAS: "1.1.03",
  MENSALIDADES: "1.1.04",
  COMISSOES_RECEBIDAS: "1.1.05",
  JUROS_RECEBIDOS: "1.2.01",
  OUTRAS_RECEITAS: "1.3.02",

  // Costs
  CUSTO_MERCADORIA: "2.1.01",
  CUSTO_SERVICO: "2.1.02",
  PAGAMENTO_PARCEIROS: "2.1.03",
  COMISSOES_PAGAS: "2.1.04",

  // Expenses (common)
  ALUGUEL: "3.1.01",
  SOFTWARE_TECNOLOGIA: "3.5.02",
  FORNECEDORES: "3.5.04",
  OUTRAS_DESPESAS: "3.6.03",
} as const;

/** In-memory cache: tenantId → (code → UUID) */
const _codeToIdCache = new Map<string, Map<string, string>>();
const _codeToIdCacheTs = new Map<string, number>();
const CODE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Resolve a chart-of-accounts code (e.g. "1.1.01") to its UUID for a given tenant.
 *
 * This is the core auto-classification helper. All automated financial flows
 * should call this to assign chart_account_id without manual user input.
 *
 * Returns `null` if the account code is not found (graceful fallback —
 * never blocks the financial operation).
 *
 * Usage:
 *   const chartAccountId = await resolveChartAccountId(tenantId, KNOWN_ACCOUNT_CODES.RECEITA_SERVICOS);
 */
export async function resolveChartAccountId(
  tenantId: string,
  code: string,
): Promise<string | null> {
  if (!tenantId || !code) return null;

  // Check cache
  const now = Date.now();
  const cachedTs = _codeToIdCacheTs.get(tenantId);
  let codeMap = _codeToIdCache.get(tenantId);

  if (codeMap && cachedTs && now - cachedTs < CODE_CACHE_TTL_MS) {
    return codeMap.get(code) ?? null;
  }

  // Load all active accounts for this tenant and build code→id map
  try {
    const accounts = await loadChartOfAccounts(tenantId);
    codeMap = new Map<string, string>();
    for (const account of accounts) {
      if (account.code && account.id) {
        codeMap.set(account.code, account.id);
      }
    }
    _codeToIdCache.set(tenantId, codeMap);
    _codeToIdCacheTs.set(tenantId, now);
    return codeMap.get(code) ?? null;
  } catch {
    // Never block financial operations on classification failure
    return null;
  }
}

/**
 * Resolve multiple codes at once (batch — single DB call).
 * Returns a Map<code, UUID>.
 */
export async function resolveChartAccountIds(
  tenantId: string,
  codes: string[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!tenantId || !codes.length) {
    codes.forEach((c) => result.set(c, null));
    return result;
  }

  // Populate cache (single call)
  await resolveChartAccountId(tenantId, codes[0] ?? "");

  const codeMap = _codeToIdCache.get(tenantId);
  for (const code of codes) {
    result.set(code, codeMap?.get(code) ?? null);
  }
  return result;
}
