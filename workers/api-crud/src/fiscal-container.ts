/**
 * FiscalContainer — Workers Containers (beta) class for the PHP fiscal microservice.
 *
 * Runs the sped-nfe Docker image alongside the Worker on Cloudflare's network.
 * Handles NF-e/NFC-e emission, cancellation, and correction via SEFAZ web services.
 *
 * Key configuration:
 *  - defaultPort 8580  → matches the PHP built-in server in Dockerfile
 *  - sleepAfter "10m"  → scale-to-zero after 10 min of inactivity
 *  - enableInternet    → required for SOAP calls to SEFAZ
 *  - envVars           → passes Worker secrets to the PHP container
 */

import { Container } from "@cloudflare/containers";
import type { Env } from "./types";

export class FiscalContainer extends Container<Env> {
  /** Port the PHP built-in server listens on inside the container */
  defaultPort = 8580;

  /** Auto-sleep after 10 minutes of inactivity (fiscal ops are sporadic) */
  sleepAfter = "10m";

  /** Must be true — PHP service makes outbound SOAP calls to SEFAZ */
  enableInternet = true;

  /**
   * Pass Worker secrets to the container as environment variables.
   * FISCAL_API_KEY = the Worker's API_KEY so the PHP Auth middleware
   * can validate X-Api-Key headers forwarded by the proxy.
   */
  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.envVars = {
      FISCAL_API_KEY: env.API_KEY,
    };
  }
}
