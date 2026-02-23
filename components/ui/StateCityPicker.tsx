import { ThemedText } from "@/components/themed-text";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    listCities,
    listStates,
    type BrasilApiCity,
    type BrasilApiState,
} from "@/services/brasil-api";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Modal,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface StateCityPickerProps {
  stateValue?: string;
  cityValue?: string;
  onStateChange?: (uf: string, stateName: string) => void;
  onCityChange?: (cityName: string, codigoIbge: string) => void;
  editable?: boolean;
  showLabels?: boolean;
  direction?: "row" | "column";
}

/* ------------------------------------------------------------------ */
/*  Internal: PickerModal                                              */
/* ------------------------------------------------------------------ */

interface PickerOption {
  label: string;
  value: string;
  extra?: string;
}

function PickerModal({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: PickerOption[];
  onSelect: (option: PickerOption) => void;
  onClose: () => void;
}) {
  const bg = useThemeColor({ light: "#ffffff", dark: "#222b38" }, "card");
  const textColor = useThemeColor(
    { light: "#111827", dark: "#e5e7eb" },
    "text",
  );
  const borderColor = useThemeColor(
    { light: "#dbe3ee", dark: "#334155" },
    "border",
  );
  const inputBg = useThemeColor({ light: "#f8fafc", dark: "#1b2431" }, "input");
  const mutedColor = useThemeColor(
    { light: "#64748b", dark: "#a8b4c7" },
    "muted",
  );

  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const lower = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(lower));
  }, [options, search]);

  useEffect(() => {
    if (visible) setSearch("");
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.modalOverlay}>
        <View style={[s.modalContent, { backgroundColor: bg }]}>
          <View style={[s.modalHeader, { borderBottomColor: borderColor }]}>
            <ThemedText style={s.modalTitle}>{title}</ThemedText>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={textColor} />
            </TouchableOpacity>
          </View>

          {options.length > 10 && (
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar..."
              placeholderTextColor={mutedColor}
              style={[
                s.searchInput,
                { backgroundColor: inputBg, borderColor, color: textColor },
              ]}
            />
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.optionRow, { borderBottomColor: borderColor }]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <ThemedText>{item.label}</ThemedText>
              </TouchableOpacity>
            )}
            style={s.list}
          />
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StateCityPicker({
  stateValue = "",
  cityValue = "",
  onStateChange,
  onCityChange,
  editable = true,
  showLabels = true,
  direction = "row",
}: StateCityPickerProps) {
  const inputBg = useThemeColor({ light: "#f8fafc", dark: "#1b2431" }, "input");
  const borderColor = useThemeColor(
    { light: "#dbe3ee", dark: "#334155" },
    "border",
  );
  const mutedColor = useThemeColor(
    { light: "#64748b", dark: "#a8b4c7" },
    "muted",
  );

  const [states, setStates] = useState<BrasilApiState[]>([]);
  const [cities, setCities] = useState<BrasilApiCity[]>([]);
  const [loadingStates, setLoadingStates] = useState(false);
  const [loadingCities, setLoadingCities] = useState(false);
  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [cityModalVisible, setCityModalVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoadingStates(true);
    listStates()
      .then((data) => {
        if (!cancelled)
          setStates(data.sort((a, b) => a.sigla.localeCompare(b.sigla)));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingStates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!stateValue) {
      setCities([]);
      return;
    }
    let cancelled = false;
    setLoadingCities(true);
    listCities(stateValue)
      .then((data) => {
        if (!cancelled)
          setCities(data.sort((a, b) => a.nome.localeCompare(b.nome)));
      })
      .catch(() => {
        if (!cancelled) setCities([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCities(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stateValue]);

  const stateOptions: PickerOption[] = useMemo(
    () =>
      states.map((st) => ({
        label: `${st.sigla} – ${st.nome}`,
        value: st.sigla,
      })),
    [states],
  );

  const cityOptions: PickerOption[] = useMemo(
    () =>
      cities.map((c) => ({
        label: c.nome,
        value: c.nome,
        extra: c.codigo_ibge,
      })),
    [cities],
  );

  const handleStateSelect = useCallback(
    (opt: PickerOption) => {
      const found = states.find((st) => st.sigla === opt.value);
      onStateChange?.(opt.value, found?.nome ?? opt.value);
      onCityChange?.("", "");
    },
    [states, onStateChange, onCityChange],
  );

  const handleCitySelect = useCallback(
    (opt: PickerOption) => {
      onCityChange?.(opt.value, opt.extra ?? "");
    },
    [onCityChange],
  );

  const stateDisplay = stateValue
    ? states.find((st) => st.sigla === stateValue)
      ? `${stateValue} – ${states.find((st) => st.sigla === stateValue)!.nome}`
      : stateValue
    : "";

  const isRow = direction === "row";

  return (
    <View style={[s.container, isRow && s.row]}>
      <View style={[s.fieldWrapper, isRow && s.flex1]}>
        {showLabels && <ThemedText style={s.label}>Estado</ThemedText>}
        <TouchableOpacity
          style={[s.selector, { borderColor, backgroundColor: inputBg }]}
          onPress={() => setStateModalVisible(true)}
          disabled={!editable || loadingStates}
          activeOpacity={0.7}
        >
          {loadingStates ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <ThemedText
                style={[s.selectorText, !stateValue && { color: mutedColor }]}
                numberOfLines={1}
              >
                {stateDisplay || "Selecione o estado"}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[s.fieldWrapper, isRow && s.flex1]}>
        {showLabels && <ThemedText style={s.label}>Cidade</ThemedText>}
        <TouchableOpacity
          style={[s.selector, { borderColor, backgroundColor: inputBg }]}
          onPress={() => setCityModalVisible(true)}
          disabled={!editable || !stateValue || loadingCities}
          activeOpacity={0.7}
        >
          {loadingCities ? (
            <ActivityIndicator size="small" />
          ) : (
            <>
              <ThemedText
                style={[s.selectorText, !cityValue && { color: mutedColor }]}
                numberOfLines={1}
              >
                {cityValue ||
                  (stateValue ? "Selecione a cidade" : "Selecione o estado")}
              </ThemedText>
              <Ionicons name="chevron-down" size={16} color={mutedColor} />
            </>
          )}
        </TouchableOpacity>
      </View>

      <PickerModal
        visible={stateModalVisible}
        title="Selecione o Estado"
        options={stateOptions}
        onSelect={handleStateSelect}
        onClose={() => setStateModalVisible(false)}
      />
      <PickerModal
        visible={cityModalVisible}
        title="Selecione a Cidade"
        options={cityOptions}
        onSelect={handleCitySelect}
        onClose={() => setCityModalVisible(false)}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = StyleSheet.create({
  container: { marginBottom: 12, gap: 8 },
  row: { flexDirection: "row" },
  flex1: { flex: 1 },
  fieldWrapper: {},
  label: { fontSize: 14, fontWeight: "600", marginBottom: 4 },
  selector: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  selectorText: { flex: 1, fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    maxHeight: "70%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  searchInput: {
    marginHorizontal: 16,
    marginVertical: 8,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  optionRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  list: { flexGrow: 0 },
});

export default StateCityPicker;
