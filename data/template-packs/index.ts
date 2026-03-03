/* ------------------------------------------------------------------ */
/*  Template Pack — Registry (index)                                   */
/*                                                                     */
/*  Central registry for all available template packs.                 */
/*  Import packs here and export them for use by the service layer    */
/*  and the UI pack selection screen.                                  */
/* ------------------------------------------------------------------ */

import type { PackSummary, TemplatePack } from "./types";
import { packToSummary } from "./types";

/* ---- Base Pack (always applied at onboarding) ------------------- */
import padraoPack from "./padrao";

/* ---- Marketplace Example Packs (add on top of padrao) ----------- */
import clinicaPack from "./clinica";
import imobiliariaPack from "./imobiliaria";
import petshopPack from "./petshop";

/* ---- All Packs -------------------------------------------------- */

export const PACKS: Record<string, TemplatePack> = {
  padrao: padraoPack,
  petshop: petshopPack,
  clinica: clinicaPack,
  imobiliaria: imobiliariaPack,
};

/* ---- Helpers ----------------------------------------------------- */

/** Get all available pack summaries (lightweight, for UI listing). */
export function getAllPackSummaries(): PackSummary[] {
  return Object.values(PACKS).map(packToSummary);
}

/** Get a full pack by its key. Returns undefined if not found. */
export function getPackByKey(key: string): TemplatePack | undefined {
  return PACKS[key];
}

/** Get all pack keys. */
export function getPackKeys(): string[] {
  return Object.keys(PACKS);
}

/* ---- Re-exports ------------------------------------------------- */

export { packToSummary } from "./types";
export type { PackSummary, TemplatePack } from "./types";

