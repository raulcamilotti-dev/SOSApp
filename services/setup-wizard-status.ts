import { api } from "@/services/api";
import {
  buildSearchParams,
  countCrud,
  CRUD_ENDPOINT,
  type CrudFilter,
  normalizeCrudList,
} from "@/services/crud";
import {
  loadTenantFiscalConfig,
  validateTenantFiscalReadiness,
} from "@/services/fiscal-config";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SetupStepId =
  | "catalog"
  | "financial_base"
  | "billing"
  | "fiscal"
  | "workflow";

export type SetupStepStatus = "pending" | "partial" | "completed";

export interface SetupWizardStep {
  id: SetupStepId;
  title: string;
  description: string;
  route: string;
}

export interface SetupWizardStepSnapshot {
  status: SetupStepStatus;
  progress?: number;
  next_route?: string;
}

export interface SetupWizardStatusSnapshot {
  version: number;
  updated_at: string;
  steps: Record<SetupStepId, SetupWizardStepSnapshot>;
}

export interface SetupWizardStatusComputed {
  snapshot: SetupWizardStatusSnapshot;
  completedSteps: number;
  totalSteps: number;
  overallStatus: SetupStepStatus;
}

interface CachedWizardPayload {
  tenantId: string;
  fetchedAt: string;
  data: SetupWizardStatusComputed;
}

export const SETUP_WIZARD_STEPS: SetupWizardStep[] = [
  {
    id: "catalog",
    title: "Catalogo",
    description: "Categorias, tipos e servicos/produtos",
    route: "/Administrador/ServiceCategories",
  },
  {
    id: "financial_base",
    title: "Financeiro base",
    description: "Plano de contas, bancos e contas bancarias",
    route: "/Administrador/plano-contas",
  },
  {
    id: "billing",
    title: "Recebimentos e cobranca",
    description: "Gateway e metodos de recebimento",
    route: "/Administrador/recebimentos-config",
  },
  {
    id: "fiscal",
    title: "Fiscal",
    description: "Dados fiscais, certificado e numeracao",
    route: "/Administrador/configuracao-fiscal",
  },
  {
    id: "workflow",
    title: "Operacao (workflow)",
    description: "Templates e vinculo servico x workflow",
    route: "/Administrador/workflow_templates",
  },
];

const SETUP_CACHE_PREFIX = "setup_wizard_status_v3:";
export const SETUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function defaultSnapshot(): SetupWizardStatusSnapshot {
  const steps = Object.fromEntries(
    SETUP_WIZARD_STEPS.map((step) => [step.id, { status: "pending" as const }]),
  ) as Record<SetupStepId, SetupWizardStepSnapshot>;

  return {
    version: 1,
    updated_at: new Date(0).toISOString(),
    steps,
  };
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value as Record<string, unknown>;
  return {};
}

function normalizeStatus(status: unknown): SetupStepStatus {
  if (status === "completed" || status === "partial") return status;
  return "pending";
}

function normalizeSnapshot(raw: unknown): SetupWizardStatusComputed {
  const source = parseJsonObject(raw);
  const base = defaultSnapshot();
  const rawSteps = parseJsonObject(source.steps);

  for (const step of SETUP_WIZARD_STEPS) {
    const rawStep = parseJsonObject(rawSteps[step.id]);
    const status = normalizeStatus(rawStep.status);
    const progress =
      rawStep.progress == null ? undefined : Number(rawStep.progress);

    base.steps[step.id] = {
      status,
      ...(Number.isFinite(progress) ? { progress } : {}),
      next_route:
        typeof rawStep.next_route === "string" && rawStep.next_route
          ? rawStep.next_route
          : step.route,
    };
  }

  const updatedAt = String(source.updated_at ?? "");
  if (updatedAt) {
    const parsed = new Date(updatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      base.updated_at = parsed.toISOString();
    }
  }

  const completedSteps = SETUP_WIZARD_STEPS.filter(
    (step) => base.steps[step.id].status === "completed",
  ).length;
  const totalSteps = SETUP_WIZARD_STEPS.length;
  const hasPartial = SETUP_WIZARD_STEPS.some(
    (step) => base.steps[step.id].status === "partial",
  );

  let overallStatus: SetupStepStatus = "pending";
  if (completedSteps === totalSteps) overallStatus = "completed";
  else if (completedSteps > 0 || hasPartial) overallStatus = "partial";

  return {
    snapshot: base,
    completedSteps,
    totalSteps,
    overallStatus,
  };
}

function getCacheKey(tenantId: string): string {
  return `${SETUP_CACHE_PREFIX}${tenantId}`;
}

function stepFromProgress(progress: number): SetupWizardStepSnapshot {
  if (progress >= 1) return { status: "completed", progress: 1 };
  if (progress <= 0) return { status: "pending", progress: 0 };
  return { status: "partial", progress: Number(progress.toFixed(2)) };
}

function parseBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return ["true", "1", "yes", "sim", "ativo"].includes(normalized);
}

async function safeCount(
  table: string,
  tenantId: string,
  includeActiveFilter = false,
): Promise<number> {
  try {
    const filters: CrudFilter[] = [{ field: "tenant_id", value: tenantId }];
    if (includeActiveFilter) {
      filters.push({
        field: "is_active",
        value: "true",
        operator: "equal",
      });
    }
    return await countCrud(table, filters, { autoExcludeDeleted: true });
  } catch {
    if (includeActiveFilter) {
      try {
        return await countCrud(
          table,
          [{ field: "tenant_id", value: tenantId }],
          { autoExcludeDeleted: true },
        );
      } catch {
        return 0;
      }
    }
    return 0;
  }
}

async function safeListServiceTypesForWorkflow(
  tenantId: string,
): Promise<Record<string, unknown>[]> {
  try {
    const response = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_types",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
        autoExcludeDeleted: true,
        fields: ["id", "default_template_id", "is_active"],
        limit: 10000,
      }),
    });
    return normalizeCrudList<Record<string, unknown>>(response.data);
  } catch {
    try {
      const response = await api.post(CRUD_ENDPOINT, {
        action: "list",
        table: "service_types",
        ...buildSearchParams([{ field: "tenant_id", value: tenantId }], {
          autoExcludeDeleted: true,
          fields: ["id", "default_template_id"],
          limit: 10000,
        }),
      });
      return normalizeCrudList<Record<string, unknown>>(response.data);
    } catch {
      return [];
    }
  }
}

async function readCache(
  tenantId: string,
): Promise<CachedWizardPayload | null> {
  try {
    const raw = await AsyncStorage.getItem(getCacheKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWizardPayload;
    if (!parsed || parsed.tenantId !== tenantId || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeCache(
  tenantId: string,
  data: SetupWizardStatusComputed,
): Promise<void> {
  const payload: CachedWizardPayload = {
    tenantId,
    fetchedAt: new Date().toISOString(),
    data,
  };
  await AsyncStorage.setItem(getCacheKey(tenantId), JSON.stringify(payload));
}

async function fetchStatusFromServer(tenantId: string): Promise<{
  computed: SetupWizardStatusComputed;
  hasSnapshot: boolean;
  tenantConfig: Record<string, unknown>;
}> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: "tenants",
    ...buildSearchParams([{ field: "id", value: tenantId }], {
      fields: ["id", "config"],
      limit: 1,
    }),
  });

  const rows = normalizeCrudList<Record<string, unknown>>(res.data);
  const tenant = rows[0];
  const config = parseJsonObject(tenant?.config);
  const status = config.setup_wizard_status;
  return {
    computed: normalizeSnapshot(status),
    hasSnapshot: !!status,
    tenantConfig: config,
  };
}

async function persistSnapshotToTenant(
  tenantId: string,
  tenantConfig: Record<string, unknown>,
  snapshot: SetupWizardStatusSnapshot,
): Promise<void> {
  const nextConfig = {
    ...tenantConfig,
    setup_wizard_status: snapshot,
  };
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: "tenants",
    payload: {
      id: tenantId,
      config: nextConfig,
    },
  });
}

async function computeSnapshotFromTenantData(
  tenantId: string,
): Promise<SetupWizardStatusSnapshot> {
  const [
    categoriesCount,
    serviceTypesCount,
    servicesCount,
    chartCount,
    banksCount,
    bankAccountsCount,
    activeWorkflowCount,
    serviceTypesForWorkflow,
    tenantRows,
    fiscalConfig,
  ] = await Promise.all([
    safeCount("service_categories", tenantId, true),
    safeCount("service_types", tenantId, true),
    safeCount("services", tenantId, true),
    safeCount("chart_of_accounts", tenantId, false),
    safeCount("banks", tenantId, false),
    safeCount("bank_accounts", tenantId, false),
    safeCount("workflow_templates", tenantId, true),
    safeListServiceTypesForWorkflow(tenantId),
    (async () => {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tenants",
          fields: "id,payments_enabled,pix_enabled,card_enabled,config",
          ...buildSearchParams([{ field: "id", value: tenantId }], {
            limit: 1,
          }),
        });
        return normalizeCrudList<Record<string, unknown>>(res.data);
      } catch {
        return [];
      }
    })(),
    loadTenantFiscalConfig(tenantId).catch(() => null),
  ]);

  const tenantRow = tenantRows[0] ?? {};
  const linkedTypeCount = serviceTypesForWorkflow.filter((row) => {
    if (row.is_active === false) return false;
    const tpl = String(row.default_template_id ?? "").trim();
    return !!tpl;
  }).length;
  const paymentsEnabled = parseBoolean(tenantRow.payments_enabled);
  const pixEnabled = parseBoolean(tenantRow.pix_enabled);
  const cardEnabled = parseBoolean(tenantRow.card_enabled);

  const fiscalReadiness = validateTenantFiscalReadiness(fiscalConfig, "nfe");

  const catalogChecks = [
    categoriesCount > 0,
    serviceTypesCount > 0,
    servicesCount > 0,
  ];
  const financialChecks = [
    chartCount > 0,
    banksCount > 0,
    bankAccountsCount > 0,
  ];
  const billingChecks = [
    paymentsEnabled,
    pixEnabled || cardEnabled,
    bankAccountsCount > 0,
  ];
  const fiscalChecks = [
    !!fiscalConfig?.cnpj,
    !!fiscalConfig?.tax_regime,
    !!fiscalConfig?.ibge_city_code,
    !!fiscalConfig?.fiscal_certificate_pfx,
    (fiscalConfig?.nfe_next_number ?? 0) > 0,
  ];
  const workflowChecks = [activeWorkflowCount > 0, linkedTypeCount > 0];

  const ratio = (checks: boolean[]) =>
    checks.length === 0 ? 0 : checks.filter(Boolean).length / checks.length;

  const catalogNextRoute =
    categoriesCount <= 0
      ? "/Administrador/ServiceCategories"
      : serviceTypesCount <= 0
        ? "/Administrador/ServiceTypes"
        : servicesCount <= 0
          ? "/Administrador/services"
          : "/Administrador/ServiceCategories";

  const financialNextRoute =
    chartCount <= 0
      ? "/Administrador/plano-contas"
      : banksCount <= 0
        ? "/Administrador/bancos"
        : bankAccountsCount <= 0
          ? "/Administrador/contas-bancarias"
          : "/Administrador/plano-contas";

  const billingNextRoute =
    bankAccountsCount <= 0
      ? "/Administrador/contas-bancarias"
      : "/Administrador/recebimentos-config";

  const workflowNextRoute =
    activeWorkflowCount <= 0
      ? "/Administrador/workflow_templates"
      : linkedTypeCount <= 0
        ? "/Administrador/ServicosWorkflow"
        : "/Administrador/workflow_templates";

  const steps: Record<SetupStepId, SetupWizardStepSnapshot> = {
    catalog: {
      ...stepFromProgress(ratio(catalogChecks)),
      next_route: catalogNextRoute,
    },
    financial_base: {
      ...stepFromProgress(ratio(financialChecks)),
      next_route: financialNextRoute,
    },
    billing: {
      ...stepFromProgress(ratio(billingChecks)),
      next_route: billingNextRoute,
    },
    fiscal: stepFromProgress(
      fiscalReadiness.ok ? 1 : Math.min(ratio(fiscalChecks), 0.8),
    ),
    workflow: {
      ...stepFromProgress(ratio(workflowChecks)),
      next_route: workflowNextRoute,
    },
  };

  return {
    version: 1,
    updated_at: new Date().toISOString(),
    steps,
  };
}

export async function getSetupWizardStatus(
  tenantId: string,
  options?: { forceRefresh?: boolean; ttlMs?: number },
): Promise<SetupWizardStatusComputed> {
  if (!tenantId) return normalizeSnapshot(null);

  const forceRefresh = options?.forceRefresh === true;
  const ttlMs = options?.ttlMs ?? SETUP_CACHE_TTL_MS;

  const cached = await readCache(tenantId);
  if (!forceRefresh && cached) {
    const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
    const canUseCachedPending =
      cached.data.overallStatus !== "pending" || cached.data.completedSteps > 0;
    if (
      Number.isFinite(ageMs) &&
      ageMs >= 0 &&
      ageMs < ttlMs &&
      canUseCachedPending
    ) {
      return cached.data;
    }
  }

  try {
    const { computed, hasSnapshot, tenantConfig } =
      await fetchStatusFromServer(tenantId);

    const canUseServerSnapshot =
      computed.overallStatus !== "pending" || computed.completedSteps > 0;
    const snapshotHasNextRoutes = SETUP_WIZARD_STEPS.every((step) => {
      const route = computed.snapshot.steps[step.id]?.next_route;
      return typeof route === "string" && route.length > 0;
    });

    if (
      hasSnapshot &&
      !forceRefresh &&
      canUseServerSnapshot &&
      snapshotHasNextRoutes
    ) {
      await writeCache(tenantId, computed);
      return computed;
    }

    const snapshot = await computeSnapshotFromTenantData(tenantId);
    const recomputed = normalizeSnapshot(snapshot);
    await persistSnapshotToTenant(tenantId, tenantConfig, snapshot);
    await writeCache(tenantId, recomputed);
    return recomputed;
  } catch {
    if (cached?.data) return cached.data;
    return normalizeSnapshot(null);
  }
}
