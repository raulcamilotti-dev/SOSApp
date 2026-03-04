/**
 * Kanban Plugin Types — Shared type definitions for the unified kanban system.
 *
 * The unified kanban (kanban-universal.tsx) loads workflow_templates + service_orders
 * and delegates scope-specific behavior (card rendering, modals, actions) to plugins.
 *
 * Each scope (operational, crm, stock) has a plugin component that:
 *  - Receives items + steps via props
 *  - Exposes imperative methods via ref (getCardActions, onCardPress, etc.)
 *  - Renders scope-specific modals internally
 *
 * @module kanban-plugins/types
 */

import type { KanbanTheme } from "@/components/ui/KanbanScreen";
import type { ReactNode } from "react";

/* ═══════════════════════════════════════════════════════
 * WORKFLOW SCOPE
 * ═══════════════════════════════════════════════════════ */

/** Valid workflow_template scope values (matches DB constraint) */
export type WorkflowScope = "operational" | "administrative" | "crm" | "stock";

/* ═══════════════════════════════════════════════════════
 * CARD CONFIG (stored in workflow_templates.card_config JSONB)
 * ═══════════════════════════════════════════════════════ */

/** A field displayed on the kanban card */
export interface CardDisplayField {
  /** Column key on the entity table (e.g. "phone", "email", "total") */
  key: string;
  /** Human-readable label */
  label: string;
  /** Ionicons icon name (e.g. "call-outline") */
  icon?: string;
  /** Format hint: "currency" | "date" | "datetime" | undefined (plain text) */
  format?: "currency" | "date" | "datetime";
}

/** Card configuration stored as JSONB on workflow_templates */
export interface CardConfig {
  /** The table that holds the domain entity (e.g. "leads", "sales", "customers") */
  entity_table: string;
  /** The FK column on the entity table that references service_orders.id */
  entity_fk: string;
  /** Column on entity used as card title */
  title_field: string;
  /** Column on entity used as card subtitle (optional) */
  subtitle_field?: string;
  /** Fields to display on the card body */
  display_fields?: CardDisplayField[];
  /** Action identifiers resolved by the scope plugin (e.g. ["crm_activity", "crm_advance"]) */
  actions?: string[];
}

/* ═══════════════════════════════════════════════════════
 * WORKFLOW STEP (from DB)
 * ═══════════════════════════════════════════════════════ */

export interface WorkflowStep {
  id: string;
  template_id: string;
  tenant_id?: string;
  name: string;
  step_order: number;
  is_terminal: boolean;
  color?: string | null;
  icon?: string | null;
  description?: string | null;
  deleted_at?: string | null;
}

/* ═══════════════════════════════════════════════════════
 * WORKFLOW TEMPLATE (from DB)
 * ═══════════════════════════════════════════════════════ */

export interface WorkflowTemplate {
  id: string;
  tenant_id: string;
  name: string;
  scope: WorkflowScope;
  card_config?: CardConfig | null;
  description?: string | null;
  is_active?: boolean | null;
  created_at?: string;
  deleted_at?: string | null;
}

/* ═══════════════════════════════════════════════════════
 * UNIFIED KANBAN ITEM (service_order + enrichments)
 * ═══════════════════════════════════════════════════════ */

export interface UnifiedKanbanItem {
  /** service_order.id */
  id: string;
  /** workflow_template.id */
  template_id: string;
  /** Current workflow_step.id */
  current_step_id: string;
  /** Process status: active, finished, cancelled, etc. */
  process_status: string;
  /** service_order.title */
  title?: string | null;
  /** service_order.description */
  description?: string | null;
  /** service_order.customer_id */
  customer_id?: string | null;
  /** service_order.service_type_id (for operational) */
  service_type_id?: string | null;
  /** service_order.tenant_id */
  tenant_id?: string | null;
  /** service_order.started_at */
  started_at?: string | null;
  /** service_order.created_at */
  created_at?: string | null;
  /** service_order.deleted_at */
  deleted_at?: string | null;
  /** service_order.priority */
  priority?: string | null;

  /* ── Enrichments (populated by kanban-universal) ── */

  /** Resolved customer name */
  customer_name?: string | null;
  /** Tasks count for this SO */
  tasks_count?: number;

  /* ── Entity data (populated from card_config.entity_table) ── */

  /** The full entity record loaded from the linked table (e.g. lead, sale) */
  entity?: Record<string, unknown> | null;
  /** The entity's primary key */
  entity_id?: string | null;
}

/* ═══════════════════════════════════════════════════════
 * PLUGIN CARD ACTION
 * ═══════════════════════════════════════════════════════ */

export interface PluginCardAction {
  /** Action identifier (matches card_config.actions values) */
  id: string;
  /** Display label */
  label: string;
  /** Ionicons icon name */
  icon: string;
  /** Background color */
  color: string;
  /** Handler */
  onPress: () => void;
  /** Whether the action is currently disabled */
  disabled?: boolean;
}

/* ═══════════════════════════════════════════════════════
 * PLUGIN REF (imperative handle exposed via forwardRef)
 * ═══════════════════════════════════════════════════════ */

export interface KanbanPluginRef {
  /**
   * Returns the action buttons for a specific item on a specific step.
   * The unified kanban renders these in the card footer.
   */
  getCardActions: (
    item: UnifiedKanbanItem,
    stepId: string,
  ) => PluginCardAction[];

  /**
   * Called when a card is tapped (title area).
   * Plugin typically navigates to a detail screen.
   */
  onCardPress: (item: UnifiedKanbanItem) => void;

  /**
   * Called AFTER a successful move (drag or advance).
   * Plugin can sync domain-specific state (e.g. lead.status, sale_item.separation_status).
   * Optional — if not implemented, nothing extra happens after move.
   */
  onAfterMove?: (
    item: UnifiedKanbanItem,
    fromStepId: string,
    toStepId: string,
    steps: WorkflowStep[],
  ) => Promise<void>;

  /**
   * Returns the label and handler for the template's "create" button.
   * Return null to hide the create button for this scope.
   */
  getCreateButton?: () => {
    label: string;
    onPress: () => void;
  } | null;

  /**
   * Custom card renderer override. When returned, replaces the default card.
   * Return null/undefined to use the default card_config-driven rendering.
   */
  renderCard?: (
    item: UnifiedKanbanItem,
    stepId: string,
    theme: KanbanTheme,
  ) => ReactNode | null | undefined;
}

/* ═══════════════════════════════════════════════════════
 * PLUGIN PROPS (passed to each scope plugin component)
 * ═══════════════════════════════════════════════════════ */

export interface KanbanPluginProps {
  /** Current tenant ID */
  tenantId: string;
  /** Current user ID */
  userId: string;
  /** Current user display name */
  userName?: string;
  /** The selected workflow template */
  template: WorkflowTemplate;
  /** All non-deleted steps for this template (sorted by step_order) */
  steps: WorkflowStep[];
  /** Card config from the template (may be null for generic operational templates) */
  cardConfig: CardConfig | null;
  /** Callback to trigger a board reload */
  onReload: () => void;
}
