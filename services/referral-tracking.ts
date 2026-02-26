/**
 * REFERRAL TRACKING SERVICE
 *
 * Handles channel partner referral code capture during tenant registration.
 * Integrates with services/tenant-resolver.ts and registration flow.
 */

import {
  createReferral,
  getChannelPartnerByReferralCode,
} from "@/services/channel-partners";

const log = __DEV__ ? console.log : () => {};
const warn = __DEV__ ? console.warn : () => {};
const logError = __DEV__ ? console.error : () => {};

/**
 * Capture and store referral code from URL parameters during tenant registration.
 * Call this AFTER tenant creation is successful.
 *
 * Expected URL format:
 * https://app.radul.com.br/registro?ref=CONTADOR-JOAO-2026&utm_source=email&utm_medium=newsletter
 *
 * @param tenantId - ID of the newly created tenant
 * @param urlSearchParams - URLSearchParams from registration page (ref + UTM params)
 * @returns true if referral was created, false if no valid referral code provided
 */
export async function captureReferralOnRegistration(
  tenantId: string,
  urlSearchParams: URLSearchParams | Record<string, string>,
): Promise<boolean> {
  try {
    // Extract referral code from query params
    const refCode =
      urlSearchParams instanceof URLSearchParams
        ? urlSearchParams.get("ref")
        : urlSearchParams.ref;

    if (!refCode) {
      log("[ReferralTracking] No referral code in URL params");
      return false;
    }

    // Validate referral code exists and channel partner is active
    const channelPartner = await getChannelPartnerByReferralCode(
      refCode.trim(),
    );

    if (!channelPartner) {
      warn(`[ReferralTracking] Referral code not found: ${refCode}`);
      return false;
    }

    if (channelPartner.status !== "active") {
      warn(
        `[ReferralTracking] Channel partner is not active: ${refCode} (status: ${channelPartner.status})`,
      );
      return false;
    }

    // Extract UTM parameters for attribution tracking
    const utmSource =
      urlSearchParams instanceof URLSearchParams
        ? urlSearchParams.get("utm_source")
        : urlSearchParams.utm_source;
    const utmMedium =
      urlSearchParams instanceof URLSearchParams
        ? urlSearchParams.get("utm_medium")
        : urlSearchParams.utm_medium;
    const utmCampaign =
      urlSearchParams instanceof URLSearchParams
        ? urlSearchParams.get("utm_campaign")
        : urlSearchParams.utm_campaign;

    // Create referral record
    await createReferral({
      channelPartnerId: channelPartner.id,
      tenantId,
      referralCode: refCode.trim(),
      utmSource: utmSource || undefined,
      utmMedium: utmMedium || undefined,
      utmCampaign: utmCampaign || undefined,
    });

    log(
      `[ReferralTracking] Referral created: tenant=${tenantId}, partner=${channelPartner.id}, code=${refCode}`,
    );

    return true;
  } catch (error) {
    // Log error but don't throw — referral tracking failure should NOT block registration
    logError("[ReferralTracking] Error capturing referral:", error);
    return false;
  }
}

/**
 * Generate shareable referral link for a channel partner.
 *
 * @param referralCode - Channel partner's unique referral code
 * @param baseUrl - Base URL of the registration page (default: https://app.radul.com.br)
 * @param utmParams - Optional UTM parameters for campaign tracking
 * @returns Full registration URL with referral code
 *
 * Example:
 * ```typescript
 * const link = generateReferralLink("CONTADOR-JOAO-2026", "https://app.radul.com.br", {
 *   utm_source: "email",
 *   utm_medium: "newsletter",
 *   utm_campaign: "jan2026",
 * });
 * // Returns: https://app.radul.com.br/registro?ref=CONTADOR-JOAO-2026&utm_source=email&utm_medium=newsletter&utm_campaign=jan2026
 * ```
 */
export function generateReferralLink(
  referralCode: string,
  baseUrl = "https://app.radul.com.br",
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  },
): string {
  const url = new URL("/registro", baseUrl);
  url.searchParams.set("ref", referralCode);

  if (utmParams?.utm_source)
    url.searchParams.set("utm_source", utmParams.utm_source);
  if (utmParams?.utm_medium)
    url.searchParams.set("utm_medium", utmParams.utm_medium);
  if (utmParams?.utm_campaign)
    url.searchParams.set("utm_campaign", utmParams.utm_campaign);
  if (utmParams?.utm_term) url.searchParams.set("utm_term", utmParams.utm_term);
  if (utmParams?.utm_content)
    url.searchParams.set("utm_content", utmParams.utm_content);

  return url.toString();
}

/**
 * Extract referral code from current page URL (browser only).
 * Use this in the registration page to check if user arrived via referral link.
 *
 * @returns Referral code if present in URL, otherwise null
 */
export function getReferralCodeFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("ref");
}
