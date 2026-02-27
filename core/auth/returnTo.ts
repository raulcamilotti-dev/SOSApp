/**
 * returnTo — sessionStorage-based persistence for marketplace return URLs.
 *
 * When a user clicks "Login" from the marketplace (/loja/...), the returnTo
 * path is saved before the login/tenant-selection flow begins. After all auth
 * steps complete, the saved path is used to redirect back to the marketplace.
 *
 * sessionStorage is used (not localStorage) so the value is scoped to the
 * browser tab and automatically cleared when the tab is closed.
 */

const STORAGE_KEY = "marketplace_returnTo";

/** Regex for paths that are valid returnTo targets */
const VALID_RETURN_REGEX = /^\/(loja|p|q|f|blog|lp)(\/|$)/;

/** Save a returnTo path to sessionStorage (web only) */
export function saveReturnTo(path: string): void {
  if (typeof sessionStorage === "undefined") return;
  if (!path || !VALID_RETURN_REGEX.test(path)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // sessionStorage may be unavailable in some contexts (e.g. iframe)
  }
}

/** Read the saved returnTo path (returns null if none saved) */
export function getReturnTo(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Clear the saved returnTo path */
export function clearReturnTo(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // noop
  }
}

/**
 * Extract returnTo from the current URL's query parameters.
 * Returns the path if it's a valid public route, null otherwise.
 */
export function extractReturnToFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo && VALID_RETURN_REGEX.test(returnTo)) {
      return returnTo;
    }
  } catch {
    // Ignore URL parsing errors
  }
  return null;
}

/**
 * Navigate to a returnTo path using full page reload.
 * Public routes (/loja/...) must use window.location.href to break out of
 * the (app) SPA routing context and load the (public) group cleanly.
 */
export function navigateToReturnTo(returnTo: string): void {
  if (typeof window !== "undefined") {
    window.location.href = returnTo;
  }
}
