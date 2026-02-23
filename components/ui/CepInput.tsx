import { ThemedText } from "@/components/themed-text";
import {
    useCepAutoFill,
    type CepAutoFillResult,
} from "@/hooks/use-cep-autofill";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import {
    ActivityIndicator,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CepInputProps {
  /** Initial CEP value. */
  value?: string;
  /** Called when CEP text changes (formatted). */
  onChangeText?: (cep: string) => void;
  /** Called when CEP lookup succeeds with full address. */
  onAddressFound?: (address: CepAutoFillResult) => void;
  /** Called on lookup failure. */
  onError?: (message: string) => void;
  /** Placeholder text (default "CEP"). */
  placeholder?: string;
  /** Whether the input is disabled. */
  editable?: boolean;
  /** Label text (default "CEP"). */
  label?: string;
  /** Show label above the input. */
  showLabel?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

/**
 * Reusable CEP input with auto-fill button.
 * Looks up the address via BrasilAPI when user types 8 digits or taps search.
 *
 * Usage:
 * ```tsx
 * <CepInput
 *   value={form.postal_code}
 *   onChangeText={(cep) => setForm({...form, postal_code: cep})}
 *   onAddressFound={(addr) => {
 *     setForm(prev => ({...prev, address: addr.street, city: addr.city, state: addr.state }));
 *   }}
 * />
 * ```
 */
export function CepInput({
  value,
  onChangeText,
  onAddressFound,
  onError,
  placeholder = "00000-000",
  editable = true,
  label = "CEP",
  showLabel = true,
}: CepInputProps) {
  const inputBg = useThemeColor({ light: "#f8fafc", dark: "#1b2431" }, "input");
  const borderColor = useThemeColor(
    { light: "#dbe3ee", dark: "#334155" },
    "border",
  );
  const textColor = useThemeColor(
    { light: "#111827", dark: "#e5e7eb" },
    "text",
  );
  const tintColor = useThemeColor(
    { light: "#2563eb", dark: "#60a5fa" },
    "tint",
  );
  const mutedColor = useThemeColor(
    { light: "#64748b", dark: "#a8b4c7" },
    "muted",
  );

  const { cep, setCep, lookup, loading, error } = useCepAutoFill({
    onSuccess: onAddressFound,
    onError,
  });

  // Sync external value
  const displayValue = value !== undefined ? value : cep;

  const handleChangeText = (text: string) => {
    setCep(text);
    onChangeText?.(text);
  };

  return (
    <View style={s.wrapper}>
      {showLabel && <ThemedText style={s.label}>{label}</ThemedText>}
      <View style={[s.row, { borderColor }]}>
        <TextInput
          value={displayValue}
          onChangeText={handleChangeText}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          keyboardType="numeric"
          maxLength={9} // "00000-000"
          editable={editable && !loading}
          style={[
            s.input,
            { backgroundColor: inputBg, color: textColor, borderColor },
          ]}
        />
        <TouchableOpacity
          onPress={() => lookup(displayValue)}
          disabled={loading || !editable}
          style={[s.button, { backgroundColor: tintColor }]}
          activeOpacity={0.7}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="search" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
      {error && (
        <ThemedText style={[s.error, { color: "#ef4444" }]}>{error}</ThemedText>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  wrapper: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  button: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  error: { fontSize: 12, marginTop: 4 },
});

export default CepInput;
