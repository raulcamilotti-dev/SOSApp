/**
 * Login Gov.br — OAuth2 Integration
 *
 * Implements the Brazilian Government's official OAuth2/OpenID Connect
 * authentication provider (Conta Gov.br).
 *
 * Benefits:
 * - 150M+ Brazilian citizens already have accounts
 * - Provides verified CPF, name, email, phone
 * - Three trust levels: Bronze (self-service), Prata (bank-verified), Ouro (ICP-Brasil cert)
 * - No password management needed for the user
 *
 * Protocol: OAuth 2.0 + OpenID Connect 1.0
 * Docs: https://manual-roteiro-integracao-login-unico.servicos.gov.br/
 *
 * NOTE: Requires registration at https://acesso.gov.br for client_id/client_secret.
 *       App must be approved for production access.
 */

import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { N8N_API_KEY } from "./api";

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const extra =
  Constants.expoConfig?.extra ??
  (Constants.manifest as any)?.extra ??
  (Constants.manifest2 as any)?.extra?.expoClient?.extra ??
  (Constants.manifest2 as any)?.extra ??
  {};

const GOV_BR_CONFIG = {
  /** OAuth2 Client ID registered at acesso.gov.br */
  clientId:
    (extra.govBrClientId as string | undefined) ??
    process.env.EXPO_PUBLIC_GOVBR_CLIENT_ID ??
    "",

  /** OAuth2 Client Secret */
  clientSecret:
    (extra.govBrClientSecret as string | undefined) ??
    process.env.EXPO_PUBLIC_GOVBR_CLIENT_SECRET ??
    "",

  /**
   * Environment:
   *   staging  → https://sso.staging.acesso.gov.br
   *   production → https://sso.acesso.gov.br
   */
  environment: (process.env.EXPO_PUBLIC_GOVBR_ENV ?? "staging") as
    | "staging"
    | "production",
} as const;

/** OAuth2 / OIDC endpoints for Gov.br */
const ENDPOINTS = {
  staging: {
    authorization: "https://sso.staging.acesso.gov.br/authorize",
    token: "https://sso.staging.acesso.gov.br/token",
    userinfo: "https://sso.staging.acesso.gov.br/userinfo",
    jwks: "https://sso.staging.acesso.gov.br/jwk",
    logout: "https://sso.staging.acesso.gov.br/logout",
    issuer: "https://sso.staging.acesso.gov.br",
  },
  production: {
    authorization: "https://sso.acesso.gov.br/authorize",
    token: "https://sso.acesso.gov.br/token",
    userinfo: "https://sso.acesso.gov.br/userinfo",
    jwks: "https://sso.acesso.gov.br/jwk",
    logout: "https://sso.acesso.gov.br/logout",
    issuer: "https://sso.acesso.gov.br",
  },
} as const;

function getEndpoints() {
  return ENDPOINTS[GOV_BR_CONFIG.environment];
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

/**
 * Gov.br trust levels.
 * Lei 14.063/2020, Art. 5º:
 *   - bronze: self-service (basic data access)
 *   - prata:  bank-validated or facial recognition
 *   - ouro:   ICP-Brasil certificate holder
 */
export type GovBrNivelConfianca = "bronze" | "prata" | "ouro";

/** Decoded Gov.br ID Token claims. */
export interface GovBrIdTokenClaims {
  sub: string; // CPF (11 digits)
  name: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  picture?: string;

  // Gov.br specific claims
  cnpj?: string; // If user represents a company
  amr?: string[]; // Authentication methods (e.g., ["passwd", "mfa"])

  // Confiabilidade
  /** @example ["selo_cadastro_basico", "selo_validacao_facial"] */
  tag_lista?: string[];

  // Standard OIDC
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  nonce?: string;
}

/** Gov.br userinfo response. */
export interface GovBrUserInfo {
  sub: string; // CPF
  name: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  phone_number_verified?: boolean;
  picture?: string;
  profile?: string;
  /** @example "1" = bronze, "2" = prata, "3" = ouro */
  id_nivel_confianca?: string;
}

/** Token response from Gov.br */
export interface GovBrTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  id_token: string;
  refresh_token?: string;
  scope: string;
}

/** Parsed result after successful Gov.br auth */
export interface GovBrAuthResult {
  cpf: string;
  name: string;
  email?: string;
  phone?: string;
  picture?: string;
  nivelConfianca: GovBrNivelConfianca;
  accessToken: string;
  idToken: string;
  refreshToken?: string;
  expiresIn: number;
  raw: GovBrUserInfo;
}

/* ------------------------------------------------------------------ */
/*  Auth Discovery (for expo-auth-session)                             */
/* ------------------------------------------------------------------ */

/**
 * Build the AuthSession discovery document for Gov.br.
 */
export function getGovBrDiscovery(): AuthSession.DiscoveryDocument {
  const ep = getEndpoints();
  return {
    authorizationEndpoint: ep.authorization,
    tokenEndpoint: ep.token,
    revocationEndpoint: undefined,
    userInfoEndpoint: ep.userinfo,
  };
}

/* ------------------------------------------------------------------ */
/*  Core Auth Functions                                                */
/* ------------------------------------------------------------------ */

/**
 * Build the OAuth2 redirect URI for Gov.br.
 */
export function getGovBrRedirectUri(): string {
  return Platform.OS === "web"
    ? AuthSession.makeRedirectUri()
    : AuthSession.makeRedirectUri({ scheme: "portalimoveis" });
}

/**
 * Check if Gov.br integration is configured.
 */
export function isGovBrConfigured(): boolean {
  return !!GOV_BR_CONFIG.clientId;
}

/**
 * Create an AuthSession request for Gov.br login.
 *
 * Scopes:
 * - openid: required for OIDC
 * - email: access to email
 * - phone: access to phone number
 * - profile: user profile (name, picture)
 * - govbr_confiabilidades: trust level (selos)
 */
export function createGovBrAuthRequest(): AuthSession.AuthRequestConfig {
  return {
    clientId: GOV_BR_CONFIG.clientId,
    scopes: ["openid", "email", "phone", "profile", "govbr_confiabilidades"],
    responseType: AuthSession.ResponseType.Code,
    redirectUri: getGovBrRedirectUri(),
    usePKCE: true,
    prompt: AuthSession.Prompt.Consent,
  };
}

/**
 * Exchange the authorization code for tokens.
 */
export async function exchangeGovBrCode(
  code: string,
  codeVerifier?: string,
): Promise<GovBrTokenResponse> {
  const ep = getEndpoints();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getGovBrRedirectUri(),
    client_id: GOV_BR_CONFIG.clientId,
  });

  if (codeVerifier) {
    body.append("code_verifier", codeVerifier);
  }

  // Some Gov.br flows require client_secret
  if (GOV_BR_CONFIG.clientSecret) {
    body.append("client_secret", GOV_BR_CONFIG.clientSecret);
  }

  const response = await fetch(ep.token, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Erro ao trocar código Gov.br: ${response.status} - ${errorText}`,
    );
  }

  return response.json();
}

/**
 * Fetch user info from Gov.br using the access token.
 */
export async function fetchGovBrUserInfo(
  accessToken: string,
): Promise<GovBrUserInfo> {
  const ep = getEndpoints();

  const response = await fetch(ep.userinfo, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Erro ao buscar dados Gov.br: ${response.status}`);
  }

  return response.json();
}

/**
 * Determine trust level from Gov.br response.
 */
export function parseNivelConfianca(
  userInfo: GovBrUserInfo,
): GovBrNivelConfianca {
  const nivel = userInfo["id_nivel_confianca"];
  switch (nivel) {
    case "3":
      return "ouro";
    case "2":
      return "prata";
    default:
      return "bronze";
  }
}

/**
 * Complete Gov.br authentication flow:
 * 1. Exchange authorization code for tokens
 * 2. Fetch user info
 * 3. Return parsed result
 */
export async function completeGovBrAuth(
  code: string,
  codeVerifier?: string,
): Promise<GovBrAuthResult> {
  // Step 1: Exchange code for tokens
  const tokens = await exchangeGovBrCode(code, codeVerifier);

  // Step 2: Fetch user info
  const userInfo = await fetchGovBrUserInfo(tokens.access_token);

  // Step 3: Parse and return
  return {
    cpf: userInfo.sub,
    name: userInfo.name,
    email: userInfo.email,
    phone: userInfo.phone_number,
    picture: userInfo.picture,
    nivelConfianca: parseNivelConfianca(userInfo),
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    raw: userInfo,
  };
}

/**
 * Logout from Gov.br (revoke session).
 */
export async function logoutGovBr(accessToken: string): Promise<void> {
  const ep = getEndpoints();
  const logoutUrl = `${ep.logout}?post_logout_redirect_uri=${encodeURIComponent(getGovBrRedirectUri())}`;

  if (Platform.OS === "web") {
    window.location.href = logoutUrl;
  } else {
    await WebBrowser.openBrowserAsync(logoutUrl);
  }
}

/* ------------------------------------------------------------------ */
/*  N8N Backend Integration                                            */
/* ------------------------------------------------------------------ */

/**
 * Send Gov.br auth result to N8N backend for user creation/login.
 * The backend will:
 * 1. Find or create user by CPF
 * 2. Update user data (name, email, phone, trust level)
 * 3. Return JWT token + user object
 */
export async function loginViaGovBrBackend(
  authResult: GovBrAuthResult,
): Promise<{
  token: string;
  user: any;
}> {
  const response = await fetch(
    "https://n8n.sosescritura.com.br/webhook/govbr_login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": N8N_API_KEY },
      body: JSON.stringify({
        cpf: authResult.cpf,
        name: authResult.name,
        email: authResult.email,
        phone: authResult.phone,
        picture: authResult.picture,
        nivel_confianca: authResult.nivelConfianca,
        govbr_access_token: authResult.accessToken,
        govbr_id_token: authResult.idToken,
      }),
    },
  );

  if (!response.ok) {
    throw new Error("Erro ao autenticar via Gov.br no backend");
  }

  return response.json();
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

export const NIVEL_CONFIANCA_LABELS: Record<GovBrNivelConfianca, string> = {
  bronze: "Bronze — Cadastro básico",
  prata: "Prata — Validação bancária ou facial",
  ouro: "Ouro — Certificado digital ICP-Brasil",
};

export const NIVEL_CONFIANCA_COLORS: Record<GovBrNivelConfianca, string> = {
  bronze: "#CD7F32",
  prata: "#C0C0C0",
  ouro: "#FFD700",
};
