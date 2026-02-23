/**
 * /loja/p/:productSlug — Product detail (hostname-mode).
 * Re-exports the [tenantSlug]/[productSlug] screen for hostname-resolved tenants.
 * Uses /loja/p/ prefix to avoid conflicts with [tenantSlug] dynamic segment.
 */
export { default } from "../[tenantSlug]/[productSlug]";
