/**
 * /loja — Public store homepage (hostname-mode).
 * When the tenant is resolved from the hostname (e.g. www.radul.com.br/loja),
 * this route renders the same store listing without a tenantSlug path segment.
 */
export { default } from "./[tenantSlug]/index";
