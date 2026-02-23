/* ------------------------------------------------------------------ */
/*  AI Agent Template Pack — Registry (index)                          */
/*                                                                     */
/*  Central registry for all available agent template packs.           */
/*  Import packs here and export them for use by the service layer    */
/*  and the UI pack selection screen.                                  */
/* ------------------------------------------------------------------ */

import type { AgentPackSummary, AgentTemplatePack } from "./types";
import { agentPackToSummary } from "./types";

import genericoPack from "./generico";
import sosEscrituraPack from "./sos-escritura";

/* ---- All Packs -------------------------------------------------- */

export const AGENT_PACKS: Record<string, AgentTemplatePack> = {
  generico: genericoPack,
  sos_escritura: sosEscrituraPack,
};

/* ---- Helpers ----------------------------------------------------- */

/** Get all available agent pack summaries (lightweight, for UI listing). */
export function getAllAgentPackSummaries(): AgentPackSummary[] {
  return Object.values(AGENT_PACKS).map(agentPackToSummary);
}

/** Get a full agent pack by its key. Returns undefined if not found. */
export function getAgentPackByKey(key: string): AgentTemplatePack | undefined {
  return AGENT_PACKS[key];
}

/** Get all agent pack keys. */
export function getAgentPackKeys(): string[] {
  return Object.keys(AGENT_PACKS);
}

/* ---- Re-exports ------------------------------------------------- */

export { agentPackToSummary } from "./types";
export type { AgentPackSummary, AgentTemplatePack } from "./types";

