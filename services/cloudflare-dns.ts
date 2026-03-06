/**
 * Cloudflare DNS Service — creates tenant subdomains via the Worker endpoint.
 *
 * Creates A records at {slug}.radul.com.br → server IP (proxied).
 * The Cloudflare API token is kept server-side in the Worker — never exposed to the client.
 *
 * Usage:
 *   import { createSubdomainDNS } from "@/services/cloudflare-dns";
 *   const result = await createSubdomainDNS("meu-escritorio");
 *   // result.success === true if created (or already existed)
 */

import { api, getApiErrorMessage } from "@/services/api";

const DNS_ENDPOINT = "/dns/create-subdomain";
const DNS_ZONE_DOMAIN = "radul.com.br";

const normalizeRecordName = (value: string): string => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  if (!normalized) return "";

  if (normalized.endsWith(`.${DNS_ZONE_DOMAIN}`)) {
    return normalized;
  }

  return `${normalized}.${DNS_ZONE_DOMAIN}`;
};

export interface DnsCreateResult {
  success: boolean;
  message: string;
  record_name?: string;
  record_id?: string;
  /** true if the DNS record already existed (idempotent) */
  existing?: boolean;
}

/**
 * Create a DNS A record for {slug}.radul.com.br pointing to the server.
 * Idempotent — returns success if the record already exists.
 *
 * @param slug — URL-safe tenant slug (e.g. "meu-escritorio")
 * @returns DnsCreateResult with success status and details
 */
export async function createSubdomainDNS(
  slug: string,
): Promise<DnsCreateResult> {
  const trimmed = slug?.trim();
  if (!trimmed) {
    return { success: false, message: "Slug vazio" };
  }

  const recordName = normalizeRecordName(trimmed);
  if (!recordName) {
    return { success: false, message: "Subdomínio inválido" };
  }

  try {
    const res = await api.post(DNS_ENDPOINT, {
      slug: trimmed,
      record_name: recordName,
    });
    const data = res.data as DnsCreateResult;
    return {
      success: data?.success ?? false,
      message: data?.message ?? "OK",
      record_name: data?.record_name,
      record_id: data?.record_id,
      existing: data?.existing,
    };
  } catch (error) {
    return {
      success: false,
      message: getApiErrorMessage(error, "Falha ao criar subdomínio DNS"),
    };
  }
}
