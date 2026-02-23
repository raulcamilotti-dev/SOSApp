/* ------------------------------------------------------------------ */
/*  AI Agent Template Pack — Apply Service                             */
/*                                                                     */
/*  Applies an agent template pack to a tenant, creating all entities  */
/*  in the correct dependency order. Uses api_crud for inserts.        */
/*                                                                     */
/*  Apply order (respects FK dependencies):                            */
/*    1. agents                                                        */
/*    2. agent_playbooks (FK → agents)                                 */
/*    3. agent_playbook_rules (FK → playbooks)                         */
/*    4. agent_playbook_tables (FK → playbooks)                        */
/*    5. agent_states (FK → agents)                                    */
/*    6. agent_state_steps (FK → states, agents)                       */
/*    7. agent_channel_bindings (FK → agents)                          */
/*    8. agent_handoff_policies (FK → agents, playbooks)               */
/*    9. automations (FK → agents)                                     */
/* ------------------------------------------------------------------ */

import type { AgentTemplatePack } from "@/data/agent-packs/types";
import { api } from "./api";
import { CRUD_ENDPOINT, buildSearchParams, normalizeCrudList } from "./crud";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

/** Maps ref_key → generated UUID for cross-referencing during apply. */
type RefMap = Record<string, string>;

/** Result of applying an agent pack. */
export interface ApplyAgentPackResult {
  success: boolean;
  tenantId: string;
  packKey: string;
  counts: Record<string, number>;
  errors: string[];
}

/** Progress callback for UI feedback. */
export type AgentPackProgressCallback = (
  step: string,
  progress: number,
) => void;

/** Result of clearing agent pack data. */
export interface ClearAgentDataResult {
  success: boolean;
  tenantId: string;
  counts: Record<string, number>;
  errors: string[];
}

/* ================================================================== */
/*  Internal Helpers                                                   */
/* ================================================================== */

/** Create a single row via api_crud and return the created row. */
async function crudCreate<T = Record<string, unknown>>(
  table: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table,
    payload,
  });
  const data = res.data;
  if (Array.isArray(data)) return data[0] as T;
  return (data?.data ?? data) as T;
}

/** Soft-delete rows matching a filter. */
async function softDeleteByFilter(
  table: string,
  field: string,
  value: string,
): Promise<number> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table,
    ...buildSearchParams([{ field, value }]),
  });
  const rows = normalizeCrudList<{ id: string }>(res.data);
  let count = 0;
  for (const row of rows) {
    try {
      await api.post(CRUD_ENDPOINT, {
        action: "delete",
        table,
        payload: { id: row.id, deleted_at: new Date().toISOString() },
      });
      count++;
    } catch {
      // continue — best effort
    }
  }
  return count;
}

const iso = () => new Date().toISOString();

/* ================================================================== */
/*  Validate                                                           */
/* ================================================================== */

export function validateAgentPack(pack: AgentTemplatePack): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!pack.metadata?.key) errors.push("metadata.key is required");
  if (!pack.metadata?.name) errors.push("metadata.name is required");
  if (!pack.agents?.length) errors.push("At least one agent is required");

  // Validate ref_key uniqueness
  const agentRefs = new Set<string>();
  for (const a of pack.agents) {
    if (agentRefs.has(a.ref_key))
      errors.push(`Duplicate agent ref_key: ${a.ref_key}`);
    agentRefs.add(a.ref_key);
  }

  const playbookRefs = new Set<string>();
  for (const p of pack.playbooks) {
    if (playbookRefs.has(p.ref_key))
      errors.push(`Duplicate playbook ref_key: ${p.ref_key}`);
    playbookRefs.add(p.ref_key);
    if (!agentRefs.has(p.agent_ref))
      errors.push(
        `Playbook ${p.ref_key} → agent_ref "${p.agent_ref}" not found`,
      );
  }

  const stateRefs = new Set<string>();
  for (const s of pack.agent_states) {
    if (stateRefs.has(s.ref_key))
      errors.push(`Duplicate state ref_key: ${s.ref_key}`);
    stateRefs.add(s.ref_key);
    if (!agentRefs.has(s.agent_ref))
      errors.push(`State ${s.ref_key} → agent_ref "${s.agent_ref}" not found`);
  }

  // Validate cross-references
  for (const r of pack.playbook_rules) {
    if (!playbookRefs.has(r.playbook_ref))
      errors.push(
        `Rule "${r.title}" → playbook_ref "${r.playbook_ref}" not found`,
      );
  }
  for (const t of pack.playbook_tables) {
    if (!playbookRefs.has(t.playbook_ref))
      errors.push(
        `Table "${t.table_name}" → playbook_ref "${t.playbook_ref}" not found`,
      );
  }
  for (const ss of pack.agent_state_steps) {
    if (!stateRefs.has(ss.state_ref))
      errors.push(
        `Step "${ss.step_key}" → state_ref "${ss.state_ref}" not found`,
      );
    if (!agentRefs.has(ss.agent_ref))
      errors.push(
        `Step "${ss.step_key}" → agent_ref "${ss.agent_ref}" not found`,
      );
  }
  for (const cb of pack.channel_bindings) {
    if (!agentRefs.has(cb.agent_ref))
      errors.push(`Channel binding → agent_ref "${cb.agent_ref}" not found`);
  }
  for (const hp of pack.handoff_policies) {
    if (!agentRefs.has(hp.agent_ref))
      errors.push(`Handoff policy → agent_ref "${hp.agent_ref}" not found`);
    if (hp.playbook_ref && !playbookRefs.has(hp.playbook_ref))
      errors.push(
        `Handoff policy → playbook_ref "${hp.playbook_ref}" not found`,
      );
  }
  for (const a of pack.automations) {
    if (!agentRefs.has(a.agent_ref))
      errors.push(`Automation → agent_ref "${a.agent_ref}" not found`);
  }

  return { valid: errors.length === 0, errors };
}

/* ================================================================== */
/*  Apply Pack                                                         */
/* ================================================================== */

export async function applyAgentPack(
  pack: AgentTemplatePack,
  tenantId: string,
  onProgress?: AgentPackProgressCallback,
): Promise<ApplyAgentPackResult> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];
  const agentMap: RefMap = {};
  const playbookMap: RefMap = {};
  const stateMap: RefMap = {};

  const totalSteps = 9;
  let currentStep = 0;
  const progress = (label: string) => {
    currentStep++;
    onProgress?.(label, currentStep / totalSteps);
  };

  try {
    /* 1. Agents ---------------------------------------------------- */
    progress("Criando agentes...");
    for (const agent of pack.agents) {
      try {
        const row = await crudCreate<{ id: string }>("agents", {
          tenant_id: tenantId,
          system_prompt: agent.system_prompt,
          model: agent.model,
          temperature: String(agent.temperature),
          max_tokens: String(agent.max_tokens),
          is_default: agent.is_default,
          is_active: agent.is_active,
          version: String(agent.version),
          created_at: iso(),
          updated_at: iso(),
        });
        agentMap[agent.ref_key] = String(row.id ?? row);
        counts.agents = (counts.agents ?? 0) + 1;
      } catch (e: any) {
        const detail = e?.response?.data
          ? JSON.stringify(e.response.data).substring(0, 300)
          : e instanceof Error
            ? e.message
            : String(e);
        const msg = `Agent "${agent.ref_key}": HTTP ${e?.response?.status ?? "?"} — ${detail}`;
        errors.push(msg);
        console.error("[AgentPack]", msg);
      }
    }

    /* 2. Playbooks ------------------------------------------------- */
    progress("Criando playbooks...");
    for (const pb of pack.playbooks) {
      const agentId = agentMap[pb.agent_ref];
      if (!agentId) {
        errors.push(
          `Playbook "${pb.ref_key}": agent_ref "${pb.agent_ref}" not resolved`,
        );
        continue;
      }
      try {
        const row = await crudCreate<{ id: string }>("agent_playbooks", {
          tenant_id: tenantId,
          agent_id: agentId,
          channel: pb.channel,
          name: pb.name,
          description: pb.description ?? null,
          behavior_source: pb.behavior_source,
          inherit_system_prompt: pb.inherit_system_prompt,
          state_machine_mode: pb.state_machine_mode,
          webhook_url: pb.webhook_url ?? null,
          operator_webhook_url: pb.operator_webhook_url ?? null,
          config_ui: pb.config_ui ?? null,
          is_active: pb.is_active,
          created_at: iso(),
          updated_at: iso(),
        });
        playbookMap[pb.ref_key] = String(row.id ?? row);
        counts.agent_playbooks = (counts.agent_playbooks ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Playbook "${pb.ref_key}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 3. Playbook Rules -------------------------------------------- */
    progress("Criando regras de playbook...");
    for (const rule of pack.playbook_rules) {
      const playbookId = playbookMap[rule.playbook_ref];
      if (!playbookId) continue;
      try {
        await crudCreate("agent_playbook_rules", {
          tenant_id: tenantId,
          playbook_id: playbookId,
          rule_order: rule.rule_order,
          rule_type: rule.rule_type,
          title: rule.title,
          instruction: rule.instruction,
          severity: rule.severity,
          is_active: rule.is_active,
          metadata: rule.metadata ?? {},
          created_at: iso(),
          updated_at: iso(),
        });
        counts.agent_playbook_rules = (counts.agent_playbook_rules ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Rule "${rule.title}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 4. Playbook Tables ------------------------------------------- */
    progress("Criando tabelas de playbook...");
    for (const tbl of pack.playbook_tables) {
      const playbookId = playbookMap[tbl.playbook_ref];
      if (!playbookId) continue;
      try {
        await crudCreate("agent_playbook_tables", {
          tenant_id: tenantId,
          playbook_id: playbookId,
          table_name: tbl.table_name,
          access_mode: tbl.access_mode,
          is_required: tbl.is_required,
          purpose: tbl.purpose ?? null,
          query_guardrails: tbl.query_guardrails ?? {},
          is_active: tbl.is_active,
          created_at: iso(),
          updated_at: iso(),
        });
        counts.agent_playbook_tables = (counts.agent_playbook_tables ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Table "${tbl.table_name}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 5. Agent States ---------------------------------------------- */
    progress("Criando estados do agente...");
    for (const state of pack.agent_states) {
      const agentId = agentMap[state.agent_ref];
      if (!agentId) continue;
      try {
        const row = await crudCreate<{ id: string }>("agent_states", {
          tenant_id: tenantId,
          agent_id: agentId,
          state_key: state.state_key,
          state_label: state.state_label,
          system_prompt: state.system_prompt,
          rules: state.rules ?? null,
          tools: state.tools ?? null,
          is_initial: state.is_initial,
          is_terminal: state.is_terminal,
          created_at: iso(),
        });
        stateMap[state.ref_key] = String(row.id ?? row);
        counts.agent_states = (counts.agent_states ?? 0) + 1;
      } catch (e) {
        errors.push(
          `State "${state.state_key}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 6. Agent State Steps ----------------------------------------- */
    progress("Criando passos dos estados...");
    for (const step of pack.agent_state_steps) {
      const stateId = stateMap[step.state_ref];
      const agentId = agentMap[step.agent_ref];
      if (!stateId || !agentId) continue;
      try {
        await crudCreate("agent_state_steps", {
          tenant_id: tenantId,
          agent_id: agentId,
          state_id: stateId,
          step_key: step.step_key,
          step_label: step.step_label,
          step_order: step.step_order,
          instruction: step.instruction,
          expected_inputs: step.expected_inputs ?? [],
          expected_outputs: step.expected_outputs ?? [],
          allowed_tables: step.allowed_tables ?? [],
          on_success_action: step.on_success_action ?? null,
          on_failure_action: step.on_failure_action ?? null,
          handoff_to_operator: step.handoff_to_operator,
          return_to_bot_allowed: step.return_to_bot_allowed,
          is_active: step.is_active,
          created_at: iso(),
          updated_at: iso(),
        });
        counts.agent_state_steps = (counts.agent_state_steps ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Step "${step.step_key}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 7. Channel Bindings ------------------------------------------ */
    progress("Criando bindings de canal...");
    for (const cb of pack.channel_bindings) {
      const agentId = agentMap[cb.agent_ref];
      if (!agentId) continue;
      try {
        await crudCreate("agent_channel_bindings", {
          tenant_id: tenantId,
          agent_id: agentId,
          channel: cb.channel,
          webhook_url: cb.webhook_url ?? null,
          is_active: cb.is_active,
          config: cb.config ?? {},
          created_at: iso(),
          updated_at: iso(),
        });
        counts.agent_channel_bindings =
          (counts.agent_channel_bindings ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Channel binding "${cb.channel}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    /* 8. Handoff Policies ------------------------------------------ */
    progress("Criando políticas de handoff...");
    for (const hp of pack.handoff_policies) {
      const agentId = agentMap[hp.agent_ref];
      if (!agentId) continue;
      const playbookId = hp.playbook_ref
        ? (playbookMap[hp.playbook_ref] ?? null)
        : null;
      try {
        await crudCreate("agent_handoff_policies", {
          tenant_id: tenantId,
          agent_id: agentId,
          playbook_id: playbookId,
          from_channel: hp.from_channel,
          to_channel: hp.to_channel,
          trigger_type: hp.trigger_type,
          trigger_config: hp.trigger_config ?? {},
          pause_bot_while_operator: hp.pause_bot_while_operator,
          operator_can_return_to_bot: hp.operator_can_return_to_bot,
          return_to_state_key: hp.return_to_state_key ?? null,
          is_active: hp.is_active,
          created_at: iso(),
          updated_at: iso(),
        });
        counts.agent_handoff_policies =
          (counts.agent_handoff_policies ?? 0) + 1;
      } catch (e: any) {
        const detail = e?.response?.data
          ? JSON.stringify(e.response.data).substring(0, 300)
          : e instanceof Error
            ? e.message
            : String(e);
        const msg = `Handoff "${hp.from_channel}→${hp.to_channel}": HTTP ${e?.response?.status ?? "?"} — ${detail}`;
        errors.push(msg);
        console.error("[AgentPack]", msg);
      }
    }

    /* 9. Automations ----------------------------------------------- */
    progress("Criando automações...");
    for (const auto of pack.automations) {
      const agentId = agentMap[auto.agent_ref];
      if (!agentId) continue;
      try {
        await crudCreate("automations", {
          tenant_id: tenantId,
          agent_id: agentId,
          trigger: auto.trigger,
          action: auto.action,
          config: auto.config ?? null,
          created_at: iso(),
        });
        counts.automations = (counts.automations ?? 0) + 1;
      } catch (e) {
        errors.push(
          `Automation "${auto.trigger}": ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    return {
      success: errors.length === 0,
      tenantId,
      packKey: pack.metadata.key,
      counts,
      errors,
    };
  } catch (e) {
    errors.push(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
    return {
      success: false,
      tenantId,
      packKey: pack.metadata.key,
      counts,
      errors,
    };
  }
}

/* ================================================================== */
/*  Clear Agent Data                                                   */
/* ================================================================== */

/**
 * Remove (soft-delete) all agent-related data for a tenant.
 * Deletes in reverse dependency order.
 */
export async function clearAgentData(
  tenantId: string,
  onProgress?: AgentPackProgressCallback,
): Promise<ClearAgentDataResult> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  const tables = [
    "automations",
    "agent_handoff_policies",
    "agent_channel_bindings",
    "agent_state_steps",
    "agent_states",
    "agent_playbook_tables",
    "agent_playbook_rules",
    "agent_playbooks",
    "agents",
  ];

  const total = tables.length;
  let step = 0;

  for (const table of tables) {
    step++;
    onProgress?.(`Limpando ${table}...`, step / total);
    try {
      // agent_states doesn't have tenant_id — get agents first then delete by agent_id
      if (table === "agent_states") {
        // Get agents for this tenant
        const agentsRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "agents",
          ...buildSearchParams([{ field: "tenant_id", value: tenantId }]),
        });
        const agents = normalizeCrudList<{ id: string }>(agentsRes.data);
        let stateCount = 0;
        for (const agent of agents) {
          stateCount += await softDeleteByFilter(
            "agent_states",
            "agent_id",
            String(agent.id),
          );
        }
        counts[table] = stateCount;
      } else {
        counts[table] = await softDeleteByFilter(table, "tenant_id", tenantId);
      }
    } catch (e) {
      errors.push(
        `Clear ${table}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return {
    success: errors.length === 0,
    tenantId,
    counts,
    errors,
  };
}
