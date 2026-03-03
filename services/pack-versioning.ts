/**
 * Pack Versioning Service — B.5
 *
 * Allows builders to publish new versions of their marketplace packs.
 * Tenants can see available updates and apply them (clear + re-apply).
 *
 * @module B.5 — Pack Versioning
 */

import type { TemplatePack } from "@/data/template-packs";
import { api } from "@/services/api";
import {
    buildSearchParams,
    CRUD_ENDPOINT,
    normalizeCrudList,
    normalizeCrudOne,
} from "@/services/crud";
import {
    getPackDetails,
    getTenantInstalls,
    type MarketplaceInstall,
    type MarketplacePack,
} from "@/services/marketplace-packs";
import { applyTemplatePack, clearPackData } from "@/services/template-packs";

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const TABLE_VERSIONS = "marketplace_pack_versions";
const TABLE_PACKS = "marketplace_packs";
const TABLE_INSTALLS = "marketplace_installs";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

export interface PackVersion {
  id: string;
  pack_id: string;
  version: string;
  pack_data: TemplatePack;
  agent_pack_data?: unknown;
  changelog: string | null;
  status: string;
  created_at: string;
}

export interface AvailableUpdate {
  pack: MarketplacePack;
  install: MarketplaceInstall;
  latestVersion: string;
  installedVersion: string;
  changelog: string | null;
}

/* ================================================================== */
/*  Semver comparison helper                                           */
/* ================================================================== */

/**
 * Compare two semver-like version strings.
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = String(a || "0.0.0")
    .split(".")
    .map(Number);
  const partsB = String(b || "0.0.0")
    .split(".")
    .map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * Increment a semver string by patch (e.g. "1.0.0" → "1.0.1").
 * For minor: "1.0.0" → "1.1.0". For major: "1.0.0" → "2.0.0".
 */
export function incrementVersion(
  current: string,
  type: "patch" | "minor" | "major" = "patch",
): string {
  const parts = String(current || "1.0.0")
    .split(".")
    .map(Number);
  while (parts.length < 3) parts.push(0);

  switch (type) {
    case "major":
      parts[0] += 1;
      parts[1] = 0;
      parts[2] = 0;
      break;
    case "minor":
      parts[1] += 1;
      parts[2] = 0;
      break;
    case "patch":
    default:
      parts[2] += 1;
      break;
  }
  return parts.join(".");
}

/* ================================================================== */
/*  Publish new version                                                */
/* ================================================================== */

/**
 * Publish a new version of a marketplace pack.
 *
 * 1. Validates the new version is greater than current
 * 2. Inserts a version snapshot in `marketplace_pack_versions`
 * 3. Updates the main `marketplace_packs` record with new version + pack_data
 */
export async function publishNewVersion(
  packId: string,
  newVersion: string,
  packData: TemplatePack,
  changelog: string,
  userId: string,
  agentPackData?: unknown,
): Promise<PackVersion> {
  // 1. Get current pack to validate
  const pack = await getPackDetails(packId);
  if (!pack) {
    throw new Error("Pack não encontrado.");
  }

  // Validate new version is greater
  if (compareSemver(newVersion, pack.version) <= 0) {
    throw new Error(
      `A nova versão (${newVersion}) deve ser maior que a atual (${pack.version}).`,
    );
  }

  // 2. Insert version snapshot
  const versionPayload: Record<string, unknown> = {
    pack_id: packId,
    version: newVersion,
    pack_data: JSON.stringify(packData),
    changelog: changelog || null,
    status: "published",
  };

  if (agentPackData) {
    versionPayload.agent_pack_data = JSON.stringify(agentPackData);
  }

  const versionRes = await api.post(CRUD_ENDPOINT, {
    action: "create",
    table: TABLE_VERSIONS,
    payload: versionPayload,
  });

  const created = normalizeCrudOne<PackVersion>(versionRes.data);
  if (!created?.id) {
    throw new Error("Falha ao criar registro de versão.");
  }

  // 3. Update main pack record with new version + pack_data
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE_PACKS,
    payload: {
      id: packId,
      version: newVersion,
      pack_data: JSON.stringify(packData),
      updated_at: new Date().toISOString(),
    },
  });

  return created;
}

/* ================================================================== */
/*  Seed initial version (for existing packs without version history)  */
/* ================================================================== */

/**
 * Ensures the pack has at least one version record.
 * Called when accessing version history for the first time.
 */
export async function ensureInitialVersion(
  pack: MarketplacePack,
): Promise<void> {
  // Check if any version exists for this pack
  const existingRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_VERSIONS,
    ...buildSearchParams([{ field: "pack_id", value: pack.id }]),
  });

  const existing = normalizeCrudList<PackVersion>(existingRes.data);
  if (existing.length > 0) return; // Already has versions

  // Seed initial version from current pack data
  if (pack.pack_data) {
    await api.post(CRUD_ENDPOINT, {
      action: "create",
      table: TABLE_VERSIONS,
      payload: {
        pack_id: pack.id,
        version: pack.version || "1.0.0",
        pack_data: JSON.stringify(pack.pack_data),
        changelog: "Versão inicial",
        status: "published",
      },
    });
  }
}

/* ================================================================== */
/*  Get version history                                                */
/* ================================================================== */

/**
 * Get all version records for a pack, sorted by creation date (newest first).
 */
export async function getPackVersionHistory(
  packId: string,
): Promise<PackVersion[]> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_VERSIONS,
    ...buildSearchParams([{ field: "pack_id", value: packId }], {
      sortColumn: "created_at DESC",
    }),
  });

  return normalizeCrudList<PackVersion>(res.data);
}

/**
 * Get a specific version record.
 */
export async function getPackVersion(
  packId: string,
  version: string,
): Promise<PackVersion | null> {
  const res = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_VERSIONS,
    ...buildSearchParams([
      { field: "pack_id", value: packId },
      { field: "version", value: version },
    ]),
  });

  const list = normalizeCrudList<PackVersion>(res.data);
  return list[0] ?? null;
}

/* ================================================================== */
/*  Available updates for a tenant                                     */
/* ================================================================== */

/**
 * Get all packs that have a newer version than what the tenant has installed.
 */
export async function getAvailableUpdates(
  tenantId: string,
): Promise<AvailableUpdate[]> {
  // 1. Get all active installs for this tenant
  const installs = await getTenantInstalls(tenantId);
  const activeInstalls = installs.filter((i) => i.status === "active");

  if (activeInstalls.length === 0) return [];

  // 2. Fetch details for each installed pack
  const updates: AvailableUpdate[] = [];

  await Promise.all(
    activeInstalls.map(async (install) => {
      try {
        const pack = await getPackDetails(install.pack_id);
        if (!pack) return;

        const installedVersion = install.installed_version || "1.0.0";
        const latestVersion = pack.version || "1.0.0";

        // Compare versions
        if (compareSemver(latestVersion, installedVersion) > 0) {
          // Fetch changelog from the latest version record
          let changelog: string | null = null;
          try {
            const latestVersionRecord = await getPackVersion(
              pack.id,
              latestVersion,
            );
            changelog = latestVersionRecord?.changelog ?? null;
          } catch {
            // No version record — use null changelog
          }

          updates.push({
            pack,
            install,
            latestVersion,
            installedVersion,
            changelog,
          });
        }
      } catch {
        // Skip packs that fail to load
      }
    }),
  );

  return updates;
}

/* ================================================================== */
/*  Check if a single pack has an update for a given install           */
/* ================================================================== */

/**
 * Quick check if a pack has an update available for a specific installed version.
 */
export function hasUpdate(
  pack: MarketplacePack,
  installedVersion: string | null | undefined,
): boolean {
  if (!installedVersion) return false;
  return compareSemver(pack.version || "1.0.0", installedVersion) > 0;
}

/* ================================================================== */
/*  Update installed pack                                              */
/* ================================================================== */

/**
 * Update an installed pack to the latest version.
 *
 * Flow:
 * 1. Get the latest pack data
 * 2. Clear old pack data (categories, workflows, etc.)
 * 3. Re-apply with the new pack data
 * 4. Update the install record with the new version
 *
 * Note: clearPackData() preserves user data (customers, service_orders, etc.)
 */
export async function updateInstalledPack(
  tenantId: string,
  packId: string,
  userId: string,
  onProgress?: (label: string) => void,
): Promise<{ success: boolean; newVersion: string }> {
  onProgress?.("Buscando nova versão...");

  // 1. Get the latest pack
  const pack = await getPackDetails(packId);
  if (!pack) {
    throw new Error("Pack não encontrado.");
  }

  if (!pack.pack_data) {
    throw new Error("Pack não possui dados de template.");
  }

  const newVersion = pack.version || "1.0.0";

  // 2. Clear old pack data
  onProgress?.("Removendo configurações antigas...");
  const clearResult = await clearPackData(tenantId);
  if (!clearResult.success) {
    throw new Error(
      `Falha ao limpar dados antigos: ${clearResult.errors.join(", ")}`,
    );
  }

  // 3. Re-apply with new pack data
  onProgress?.("Aplicando nova versão...");
  await applyTemplatePack(pack.pack_data, tenantId, onProgress);

  // 4. Update install record
  onProgress?.("Finalizando atualização...");
  await api.post(CRUD_ENDPOINT, {
    action: "update",
    table: TABLE_INSTALLS,
    payload: {
      id: pack.id, // Will be matched by install record lookup below
      installed_version: newVersion,
    },
  });

  // Find and update the actual install record by tenant + pack
  const installRes = await api.post(CRUD_ENDPOINT, {
    action: "list",
    table: TABLE_INSTALLS,
    ...buildSearchParams([
      { field: "tenant_id", value: tenantId },
      { field: "pack_id", value: packId },
      { field: "status", value: "active" },
    ]),
  });

  const activeInstall = normalizeCrudList<MarketplaceInstall>(
    installRes.data,
  ).find((i) => i.status === "active");

  if (activeInstall) {
    await api.post(CRUD_ENDPOINT, {
      action: "update",
      table: TABLE_INSTALLS,
      payload: {
        id: activeInstall.id,
        installed_version: newVersion,
      },
    });
  }

  return { success: true, newVersion };
}
