import {
    autoFillFromCep,
    formatCep
} from "@/services/brasil-api";
import { useCallback, useState } from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CepAutoFillResult {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
}

export interface UseCepAutoFillOptions {
  /** Called with the address fields after a successful lookup. */
  onSuccess?: (address: CepAutoFillResult) => void;
  /** Called with the error message on failure. */
  onError?: (message: string) => void;
  /** Minimum digits before auto-triggering (default 8). */
  autoTriggerLength?: number;
}

export interface UseCepAutoFillReturn {
  /** Current CEP value (formatted). */
  cep: string;
  /** Update the CEP value. If it reaches 8 digits, triggers auto-lookup. */
  setCep: (value: string) => void;
  /** Manually trigger CEP lookup. */
  lookup: (cep?: string) => Promise<CepAutoFillResult | null>;
  /** Whether a lookup is in progress. */
  loading: boolean;
  /** Error message from last lookup (null if none). */
  error: string | null;
  /** Last address returned by lookup. */
  address: CepAutoFillResult | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

/**
 * Hook that wraps BrasilAPI CEP lookup with loading/error state.
 *
 * Usage:
 * ```tsx
 * const { cep, setCep, lookup, loading, error, address } = useCepAutoFill({
 *   onSuccess: (addr) => {
 *     setStreet(addr.street);
 *     setCity(addr.city);
 *     setState(addr.state);
 *   },
 * });
 * ```
 */
export function useCepAutoFill(
  options: UseCepAutoFillOptions = {},
): UseCepAutoFillReturn {
  const { onSuccess, onError, autoTriggerLength = 8 } = options;

  const [cep, setCepRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<CepAutoFillResult | null>(null);

  const doLookup = useCallback(
    async (raw: string): Promise<CepAutoFillResult | null> => {
      const digits = raw.replace(/\D/g, "");
      if (digits.length !== 8) {
        const msg = "CEP deve conter 8 dígitos";
        setError(msg);
        onError?.(msg);
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const result = await autoFillFromCep(digits);
        if (!result) {
          const msg = "CEP não encontrado";
          setError(msg);
          onError?.(msg);
          return null;
        }
        setAddress(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erro ao buscar CEP";
        setError(msg);
        onError?.(msg);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [onSuccess, onError],
  );

  const setCep = useCallback(
    (value: string) => {
      const digits = value.replace(/\D/g, "");
      const formatted = digits.length >= 5 ? formatCep(digits) : digits;
      setCepRaw(formatted);

      // Auto-trigger when we have exactly 8 digits
      if (digits.length === autoTriggerLength) {
        doLookup(digits);
      }
    },
    [autoTriggerLength, doLookup],
  );

  const lookup = useCallback(
    (override?: string) => doLookup(override ?? cep),
    [doLookup, cep],
  );

  return { cep, setCep, lookup, loading, error, address };
}
