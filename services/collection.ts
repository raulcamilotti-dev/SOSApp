/**
 * Collection (Cobrança) Service
 *
 * Functions to start a debt collection process from the Inadimplentes screen.
 * Creates a service_order + service_order_context linking to accounts_receivable,
 * then navigates to the Kanban/Processo screen.
 */

import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
} from "@/services/crud";
import {
    createServiceOrder,
    createServiceOrderContext,
} from "@/services/service-orders";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StartCollectionParams {
  tenantId: string;
  customerId: string;
  customerName: string;
  /** Optional: specific AR entry IDs to link */
  accountsReceivableIds?: string[];
  /** Total overdue amount (for title) */
  totalAmount: number;
  /** ID of the user starting the process */
  createdBy: string;
  /** Optional: partner_id if the customer belongs to a partner */
  partnerId?: string;
}

export interface StartCollectionResult {
  serviceOrderId: string;
  success: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Find the "Cobrança Amigável" service type for the tenant.
 * Falls back to any service type with "cobranç" in the name.
 */
async function findCollectionServiceType(
  tenantId: string,
): Promise<{ serviceTypeId: string; templateId?: string } | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_types",
      ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
    });
    const types = normalizeCrudList<{
      id: string;
      name: string;
      default_template_id?: string;
      tenant_id: string;
      deleted_at?: string;
    }>(res.data).filter((t) => !t.deleted_at);

    // Exact match first
    const exact = types.find(
      (t) => t.name.toLowerCase() === "cobrança amigável",
    );
    if (exact) {
      return {
        serviceTypeId: exact.id,
        templateId: exact.default_template_id,
      };
    }

    // Partial match
    const partial = types.find((t) => t.name.toLowerCase().includes("cobranç"));
    if (partial) {
      return {
        serviceTypeId: partial.id,
        templateId: partial.default_template_id,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the first step of a workflow template.
 */
async function getFirstWorkflowStep(
  templateId: string,
): Promise<string | null> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "workflow_steps",
      ...buildSearchParams([{ field: "template_id", value: templateId }], {
        sortColumn: "step_order ASC",
      }),
    });
    const steps = normalizeCrudList<{
      id: string;
      step_order: number;
      deleted_at?: string;
    }>(res.data).filter((s) => !s.deleted_at);

    if (steps.length > 0) return steps[0].id;
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Main Function                                                      */
/* ------------------------------------------------------------------ */

/**
 * Start a collection (cobrança) process for a delinquent customer.
 *
 * 1. Finds the "Cobrança" service type and its workflow template
 * 2. Creates a service_order
 * 3. Creates service_order_context entries linking AR entries
 * 4. Returns the service order ID for navigation
 */
export async function startCollectionProcess(
  params: StartCollectionParams,
): Promise<StartCollectionResult> {
  const {
    tenantId,
    customerId,
    customerName,
    accountsReceivableIds = [],
    totalAmount,
    createdBy,
  } = params;

  try {
    // 1. Find collection service type
    const serviceType = await findCollectionServiceType(tenantId);

    if (!serviceType) {
      return {
        serviceOrderId: "",
        success: false,
        error:
          'Nenhum tipo de serviço de cobrança encontrado. Aplique um template pack que inclua "Cobrança" (ex: Gestão de Cobrança) ou crie manualmente um tipo de serviço com esse nome em Administrador → Tipos de Serviço.',
      };
    }

    // 2. Get first workflow step (if template exists)
    let firstStepId: string | null = null;
    if (serviceType.templateId) {
      firstStepId = await getFirstWorkflowStep(serviceType.templateId);
    }

    // 3. Format amount for title
    const formattedAmount = totalAmount.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });

    // 4. Build payload — only include non-null values
    //    (service_type_id is NOT NULL in DB, so it must be present)
    const soPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      customer_id: customerId,
      service_type_id: serviceType.serviceTypeId,
      process_status: "active",
      title: `Cobrança — ${customerName} — ${formattedAmount}`,
      description: `Processo de cobrança iniciado automaticamente para ${customerName}. Valor total em atraso: ${formattedAmount}.`,
      created_by: createdBy,
      started_at: new Date().toISOString(),
    };
    if (serviceType.templateId) soPayload.template_id = serviceType.templateId;
    if (firstStepId) soPayload.current_step_id = firstStepId;

    // 5. Create the service order
    const so = await createServiceOrder(soPayload as any);

    const serviceOrderId = so?.id ?? (so as any)?.data?.id;
    if (!serviceOrderId) {
      return { serviceOrderId: "", success: false, error: "SO criada sem ID" };
    }

    // 6. Link AR entries via service_order_context
    if (accountsReceivableIds.length > 0) {
      for (const arId of accountsReceivableIds) {
        try {
          await createServiceOrderContext({
            service_order_id: serviceOrderId,
            entity_type: "accounts_receivable",
            entity_id: arId,
          });
        } catch {
          // Non-blocking — context link failure shouldn't abort the process
          console.warn(
            `[Cobrança] Failed to link AR ${arId} to SO ${serviceOrderId}`,
          );
        }
      }
    }

    // Also link the customer as context
    try {
      await createServiceOrderContext({
        service_order_id: serviceOrderId,
        entity_type: "customer",
        entity_id: customerId,
      });
    } catch {
      // Non-blocking
    }

    return { serviceOrderId, success: true };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erro ao iniciar cobrança";
    console.error("[Cobrança] startCollectionProcess error:", err);
    return { serviceOrderId: "", success: false, error: message };
  }
}

/**
 * Check if a customer already has an active collection process.
 */
export async function hasActiveCollection(
  tenantId: string,
  customerId: string,
): Promise<{ hasActive: boolean; serviceOrderId?: string }> {
  try {
    const res = await api.post(CRUD_ENDPOINT, {
      action: "list",
      table: "service_orders",
      ...buildSearchParams(
        [
          { field: "tenant_id", value: tenantId },
          { field: "customer_id", value: customerId },
          { field: "process_status", value: "active" },
        ],
        { sortColumn: "created_at DESC" },
      ),
    });

    const orders = normalizeCrudList<{
      id: string;
      title?: string;
      deleted_at?: string;
    }>(res.data).filter(
      (o) =>
        !o.deleted_at && (o.title?.toLowerCase().includes("cobrança") ?? false),
    );

    if (orders.length > 0) {
      return { hasActive: true, serviceOrderId: orders[0].id };
    }

    return { hasActive: false };
  } catch {
    return { hasActive: false };
  }
}
