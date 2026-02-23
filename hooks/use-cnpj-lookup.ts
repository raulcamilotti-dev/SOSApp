import {
    formatCnpj,
    lookupCnpj,
    validateCnpj,
    type BrasilApiCnpj,
} from "@/services/brasil-api";
import { useCallback, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface UseCnpjLookupOptions {
  /** Called with the full company data on success. */
  onSuccess?: (data: BrasilApiCnpj) => void;
  /** Called with error message on failure. */
  onError?: (message: string) => void;
}

export interface UseCnpjLookupReturn {
  /** Current CNPJ value (formatted). */
  cnpj: string;
  /** Update the CNPJ value. Auto-triggers lookup at 14 digits. */
  setCnpj: (value: string) => void;
  /** Manually trigger CNPJ lookup. */
  lookup: (cnpj?: string) => Promise<BrasilApiCnpj | null>;
  /** Whether a lookup is in progress. */
  loading: boolean;
  /** Error message from last lookup. */
  error: string | null;
  /** Full company data from last successful lookup. */
  data: BrasilApiCnpj | null;
  /** Whether current CNPJ value is structurally valid. */
  isValid: boolean;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Hook for CNPJ lookup via BrasilAPI with auto-validation.
 *
 * Usage:
 * ```tsx
 * const { cnpj, setCnpj, loading, data, error } = useCnpjLookup({
 *   onSuccess: (company) => {
 *     setRazaoSocial(company.razao_social);
 *     setEndereco(company.logradouro);
 *   },
 * });
 * ```
 */
export function useCnpjLookup(
  options: UseCnpjLookupOptions = {},
): UseCnpjLookupReturn {
  const { onSuccess, onError } = options;

  const [cnpj, setCnpjRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BrasilApiCnpj | null>(null);
  const [isValid, setIsValid] = useState(false);

  const doLookup = useCallback(
    async (raw: string): Promise<BrasilApiCnpj | null> => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 14) {
        const msg = "CNPJ deve conter 14 dígitos";
        setError(msg);
        onError?.(msg);
        return null;
      }
      if (!validateCnpj(digits)) {
        const msg = "CNPJ inválido";
        setError(msg);
        onError?.(msg);
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await lookupCnpj(digits);
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro ao consultar CNPJ";
        setError(msg);
        onError?.(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError],
  );

  const setCnpj = useCallback(
    (value: string) => {
      const digits = value.replace(/\D/g, "");
      const formatted = digits.length >= 2 ? formatCnpj(digits) : digits;
      setCnpjRaw(formatted);

      const valid = digits.length === 14 && validateCnpj(digits);
      setIsValid(valid);

      // Auto-trigger when we have exactly 14 valid digits
      if (valid) {
        doLookup(digits);
      }
    },
    [doLookup],
  );

  const lookup = useCallback(
    (override?: string) => doLookup(override ?? cnpj),
    [doLookup, cnpj],
  );

  return { cnpj, setCnpj, lookup, loading, error, data, isValid };
}
