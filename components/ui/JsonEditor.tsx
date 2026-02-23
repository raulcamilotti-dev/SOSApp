/**
 * JsonEditor v3 — Smart JSONB editor for CrudScreen "json" fields.
 *
 * Handles 5 data shapes with structured visual editors — no raw JSON exposed:
 *   1. Flat objects          → Key-value pair rows
 *   2. Nested objects        → Section headers + labeled fields (dot-path)
 *   3. Arrays of objects     → Collapsible cards with per-field editing
 *   4. Arrays of primitives  → Numbered editable list
 *   5. Unparseable fallback  → Monospace textarea (only when JSON is invalid)
 *
 * No JSON/Visual toggle — the user always sees the structured editor.
 * Proper light / dark mode contrast via theme color props.
 */

import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  textColor?: string;
  mutedColor?: string;
  borderColor?: string;
  bgColor?: string;
  inputBgColor?: string;
  tintColor?: string;
}

type KVPair = { key: string; value: string };
type EditorMode =
  | "kv"
  | "nested"
  | "array-objects"
  | "array-primitives"
  | "raw";

/* Flattened field for nested objects */
type FlatField = {
  path: string; // "brand.name"
  section: string; // "Brand"
  label: string; // "Name"
  value: string; // display value
};

/* ================================================================== */
/*  Detection helpers                                                  */
/* ================================================================== */

function tryParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isFlatObject(
  obj: unknown,
): obj is Record<string, string | number | boolean | null> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  return Object.values(obj).every(
    (v) =>
      v === null ||
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean",
  );
}

/** Object that has at least one sub-object value (but no deeply nested arrays) */
function isNestedObject(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const vals = Object.values(obj);
  // Must have at least one key whose value is a plain object
  const hasNested = vals.some(
    (v) => v !== null && typeof v === "object" && !Array.isArray(v),
  );
  if (!hasNested) return false;
  // All values must be primitives or one-level-deep plain objects
  return vals.every((v) => {
    if (v === null || typeof v !== "object") return true; // primitive
    if (Array.isArray(v)) return false; // arrays inside nested obj → too complex
    // Check sub-object is flat
    return Object.values(v as Record<string, unknown>).every(
      (sv) =>
        sv === null ||
        typeof sv === "string" ||
        typeof sv === "number" ||
        typeof sv === "boolean",
    );
  });
}

function isArrayOfFlatObjects(obj: unknown): obj is Record<string, unknown>[] {
  if (!Array.isArray(obj) || obj.length === 0) return false;
  return obj.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      Object.values(item as Record<string, unknown>).every(
        (v) =>
          v === null ||
          typeof v === "string" ||
          typeof v === "number" ||
          typeof v === "boolean",
      ),
  );
}

function isArrayOfPrimitives(
  obj: unknown,
): obj is (string | number | boolean | null)[] {
  if (!Array.isArray(obj) || obj.length === 0) return false;
  return obj.every((v) => v === null || typeof v !== "object");
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickSummary(obj: Record<string, unknown>): string {
  const hints = [
    "nome",
    "name",
    "descricao",
    "description",
    "title",
    "label",
    "razao_social",
    "company_name",
    "nome_socio",
  ];
  for (const hint of hints) {
    for (const [key, val] of Object.entries(obj)) {
      if (
        key.toLowerCase().includes(hint) &&
        typeof val === "string" &&
        val.trim()
      ) {
        return val.length > 60 ? val.slice(0, 57) + "…" : val;
      }
    }
  }
  for (const val of Object.values(obj)) {
    if (typeof val === "string" && val.trim()) {
      return val.length > 60 ? val.slice(0, 57) + "…" : val;
    }
  }
  return "";
}

function collectKeys(items: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const item of items) {
    for (const k of Object.keys(item)) {
      if (!seen.has(k)) {
        seen.add(k);
        keys.push(k);
      }
    }
  }
  return keys;
}

function inferFieldTypes(
  items: Record<string, unknown>[],
): Record<string, string> {
  const types: Record<string, string> = {};
  for (const item of items) {
    for (const [k, v] of Object.entries(item)) {
      if (types[k] || v === null || v === undefined) continue;
      types[k] = typeof v;
    }
  }
  return types;
}

function coerceValue(str: string, origType: string | undefined): unknown {
  if (str === "" || str === "null") return null;
  if (origType === "number") {
    const n = Number(str);
    return Number.isNaN(n) ? str : n;
  }
  if (origType === "boolean") {
    const lower = str.toLowerCase();
    if (lower === "true") return true;
    if (lower === "false") return false;
    return str;
  }
  return str;
}

/* ── Flat object KV helpers ── */
function objToKVPairs(obj: Record<string, unknown>): KVPair[] {
  return Object.entries(obj).map(([key, val]) => ({
    key,
    value: val === null || val === undefined ? "" : String(val),
  }));
}

function kvPairsToJson(pairs: KVPair[]): string {
  const obj: Record<string, string> = {};
  for (const { key, value } of pairs) {
    const k = key.trim();
    if (k) obj[k] = value;
  }
  return Object.keys(obj).length > 0 ? JSON.stringify(obj, null, 2) : "{}";
}

/* ── Nested object helpers ── */

/** Flatten a nested object into labeled fields grouped by section */
function flattenObject(obj: Record<string, unknown>): FlatField[] {
  const fields: FlatField[] = [];
  for (const [topKey, topVal] of Object.entries(obj)) {
    if (
      topVal !== null &&
      typeof topVal === "object" &&
      !Array.isArray(topVal)
    ) {
      // Sub-object → section
      const sub = topVal as Record<string, unknown>;
      for (const [subKey, subVal] of Object.entries(sub)) {
        fields.push({
          path: `${topKey}.${subKey}`,
          section: humanizeKey(topKey),
          label: humanizeKey(subKey),
          value: subVal === null || subVal === undefined ? "" : String(subVal),
        });
      }
    } else {
      // Top-level primitive → "Geral" section
      fields.push({
        path: topKey,
        section: "Geral",
        label: humanizeKey(topKey),
        value: topVal === null || topVal === undefined ? "" : String(topVal),
      });
    }
  }
  return fields;
}

/** Reconstruct a nested object from flattened fields */
function unflattenFields(
  fields: FlatField[],
  original: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  // Preserve original key ordering
  for (const topKey of Object.keys(original)) {
    const topVal = original[topKey];
    if (
      topVal !== null &&
      typeof topVal === "object" &&
      !Array.isArray(topVal)
    ) {
      const sub: Record<string, unknown> = {};
      const origSub = topVal as Record<string, unknown>;
      for (const subKey of Object.keys(origSub)) {
        const field = fields.find((f) => f.path === `${topKey}.${subKey}`);
        sub[subKey] = field ? field.value : origSub[subKey];
      }
      // Capture any new fields added under this section
      for (const f of fields) {
        if (f.path.startsWith(`${topKey}.`)) {
          const subKey = f.path.slice(topKey.length + 1);
          if (!(subKey in sub)) sub[subKey] = f.value;
        }
      }
      result[topKey] = sub;
    } else {
      const field = fields.find((f) => f.path === topKey);
      result[topKey] = field ? field.value : topVal;
    }
  }
  return result;
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export function JsonEditor({
  value,
  onChange,
  placeholder,
  readOnly = false,
  textColor = "#111827",
  mutedColor = "#64748b",
  borderColor = "#dbe3ee",
  bgColor = "#ffffff",
  inputBgColor = "#f8fafc",
  tintColor = "#2563eb",
}: JsonEditorProps) {
  const [collapsedSet, setCollapsedSet] = useState<Set<number>>(
    () => new Set(),
  );

  /* ── Local state for KV pairs (keeps draft rows with empty keys visible) ── */
  const [kvDraftPairs, setKvDraftPairs] = useState<KVPair[]>([]);
  const kvSyncRef = useRef(value);

  const parsed = useMemo(() => tryParse(value), [value]);

  // Sync kvDraftPairs from external value changes (not our own onChange)
  useEffect(() => {
    if (kvSyncRef.current === value) return; // skip if we triggered the change
    kvSyncRef.current = value;
    const p = tryParse(value);
    if (p && typeof p === "object" && !Array.isArray(p) && isFlatObject(p)) {
      setKvDraftPairs(objToKVPairs(p as Record<string, unknown>));
    } else if (!value || value.trim() === "" || value.trim() === "{}") {
      setKvDraftPairs([]);
    }
  }, [value]);

  const detectedMode = useMemo((): EditorMode => {
    if (parsed === undefined && value.trim() === "") return "kv";
    if (parsed === undefined) return "raw"; // invalid JSON
    if (isFlatObject(parsed)) return "kv";
    if (isNestedObject(parsed)) return "nested";
    if (isArrayOfFlatObjects(parsed)) return "array-objects";
    if (isArrayOfPrimitives(parsed)) return "array-primitives";
    return "raw";
  }, [parsed, value]);

  const handleFormatRaw = useCallback(() => {
    const p = tryParse(value);
    if (p !== undefined) onChange(JSON.stringify(p, null, 2));
  }, [value, onChange]);

  /* ══════════════════════════════════════════════════════════════ */
  /*  RAW FALLBACK (only for truly unparseable/complex JSON)        */
  /* ══════════════════════════════════════════════════════════════ */
  if (detectedMode === "raw") {
    return (
      <View>
        {parsed !== undefined && (
          <Pressable
            style={[s.formatBtn, { borderColor }]}
            onPress={handleFormatRaw}
          >
            <Ionicons name="sparkles-outline" size={13} color={mutedColor} />
            <Text style={[s.formatBtnText, { color: mutedColor }]}>
              Formatar
            </Text>
          </Pressable>
        )}
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder ?? "{ }"}
          placeholderTextColor={mutedColor + "80"}
          editable={!readOnly}
          multiline
          style={[
            s.rawInput,
            {
              color: textColor,
              borderColor,
              backgroundColor: inputBgColor,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
            },
          ]}
        />
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  KV MODE (flat objects)                                        */
  /* ══════════════════════════════════════════════════════════════ */
  if (detectedMode === "kv") {
    // Use local draft pairs to keep empty-key rows visible in the UI
    const pairs = kvDraftPairs;

    const handleKVChange = (newPairs: KVPair[]) => {
      setKvDraftPairs(newPairs);
      // Only serialize pairs with non-empty keys to parent
      const serialized = kvPairsToJson(newPairs);
      kvSyncRef.current = serialized;
      onChange(serialized);
    };

    const handleAddPair = () => {
      setKvDraftPairs((prev) => [...prev, { key: "", value: "" }]);
    };

    return (
      <View>
        <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
          {pairs.length === 0 && (
            <Text style={[s.emptyText, { color: mutedColor }]}>
              Nenhuma propriedade. Clique + para adicionar.
            </Text>
          )}
          {pairs.map((pair, i) => (
            <View
              key={i}
              style={[s.kvRow, { borderBottomColor: borderColor + "60" }]}
            >
              <TextInput
                value={pair.key}
                onChangeText={(t) => {
                  const next = pairs.map((p, j) =>
                    j === i ? { ...p, key: t } : p,
                  );
                  handleKVChange(next);
                }}
                placeholder="chave"
                placeholderTextColor={mutedColor + "80"}
                editable={!readOnly}
                style={[
                  s.kvKey,
                  {
                    color: tintColor,
                    backgroundColor: inputBgColor,
                    borderColor,
                  },
                ]}
              />
              <TextInput
                value={pair.value}
                onChangeText={(t) => {
                  const next = pairs.map((p, j) =>
                    j === i ? { ...p, value: t } : p,
                  );
                  handleKVChange(next);
                }}
                placeholder="valor"
                placeholderTextColor={mutedColor + "80"}
                editable={!readOnly}
                style={[
                  s.kvVal,
                  {
                    color: textColor,
                    backgroundColor: inputBgColor,
                    borderColor,
                  },
                ]}
              />
              {!readOnly && (
                <Pressable
                  onPress={() => {
                    const next = pairs.filter((_, j) => j !== i);
                    handleKVChange(next);
                  }}
                  hitSlop={8}
                  style={s.rmBtn}
                >
                  <Ionicons name="close-circle" size={18} color="#ef4444" />
                </Pressable>
              )}
            </View>
          ))}
        </ScrollView>
        {!readOnly && (
          <Pressable
            style={[s.addBtn, { borderColor }]}
            onPress={handleAddPair}
          >
            <Ionicons name="add-circle-outline" size={15} color={tintColor} />
            <Text style={[s.addBtnText, { color: tintColor }]}>
              Adicionar propriedade
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  NESTED OBJECT MODE (e.g. tenant config)                       */
  /* ══════════════════════════════════════════════════════════════ */
  if (detectedMode === "nested") {
    const obj = parsed as Record<string, unknown>;
    const fields = flattenObject(obj);

    // Group by section, preserving order
    const sections: { name: string; fields: FlatField[] }[] = [];
    let lastSection = "";
    for (const f of fields) {
      if (f.section !== lastSection) {
        sections.push({ name: f.section, fields: [f] });
        lastSection = f.section;
      } else {
        sections[sections.length - 1].fields.push(f);
      }
    }

    const handleFieldChange = (path: string, newVal: string) => {
      const updated = fields.map((f) =>
        f.path === path ? { ...f, value: newVal } : f,
      );
      const result = unflattenFields(updated, obj);
      onChange(JSON.stringify(result, null, 2));
    };

    return (
      <View>
        <ScrollView style={{ maxHeight: 420 }} nestedScrollEnabled>
          {sections.map((sec) => (
            <View key={sec.name} style={s.nestedSection}>
              <View
                style={[s.sectionHeader, { backgroundColor: tintColor + "0A" }]}
              >
                <Ionicons
                  name="folder-open-outline"
                  size={14}
                  color={tintColor}
                />
                <Text style={[s.sectionTitle, { color: tintColor }]}>
                  {sec.name}
                </Text>
              </View>
              {sec.fields.map((f) => (
                <View key={f.path} style={s.nestedFieldRow}>
                  <Text style={[s.fieldLabel, { color: mutedColor }]}>
                    {f.label}
                  </Text>
                  <TextInput
                    value={f.value}
                    onChangeText={(t) => handleFieldChange(f.path, t)}
                    placeholder="—"
                    placeholderTextColor={mutedColor + "40"}
                    editable={!readOnly}
                    style={[
                      s.fieldInput,
                      {
                        color: textColor,
                        backgroundColor: inputBgColor,
                        borderColor,
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  ARRAY OF OBJECTS MODE                                         */
  /* ══════════════════════════════════════════════════════════════ */
  if (detectedMode === "array-objects") {
    const items = parsed as Record<string, unknown>[];
    const allKeys = collectKeys(items);
    const typeMap = inferFieldTypes(items);

    const updateField = (itemIdx: number, key: string, newVal: string) => {
      const next = items.map((item, i) => {
        if (i !== itemIdx) return item;
        return { ...item, [key]: coerceValue(newVal, typeMap[key]) };
      });
      onChange(JSON.stringify(next, null, 2));
    };

    const removeItem = (idx: number) => {
      const next = items.filter((_, i) => i !== idx);
      const adjusted = new Set<number>();
      for (const c of collapsedSet) {
        if (c < idx) adjusted.add(c);
        else if (c > idx) adjusted.add(c - 1);
      }
      setCollapsedSet(adjusted);
      onChange(JSON.stringify(next, null, 2));
    };

    const addItem = () => {
      const blank: Record<string, unknown> = {};
      for (const k of allKeys) blank[k] = null;
      onChange(JSON.stringify([...items, blank], null, 2));
    };

    const toggleCollapse = (idx: number) => {
      setCollapsedSet((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx);
        else next.add(idx);
        return next;
      });
    };

    const collapseAll = () => setCollapsedSet(new Set(items.map((_, i) => i)));
    const expandAll = () => setCollapsedSet(new Set());

    return (
      <View>
        {/* Count badge + collapse controls */}
        <View style={s.arrayHeader}>
          <View style={[s.badge, { backgroundColor: tintColor + "15" }]}>
            <Text style={[s.badgeText, { color: tintColor }]}>
              {items.length} {items.length === 1 ? "item" : "itens"}
            </Text>
          </View>
          <View style={s.collapseControls}>
            <Pressable onPress={expandAll} hitSlop={6}>
              <Text style={[s.collapseLink, { color: mutedColor }]}>
                Expandir
              </Text>
            </Pressable>
            <Text style={{ color: mutedColor + "40", fontSize: 12 }}>|</Text>
            <Pressable onPress={collapseAll} hitSlop={6}>
              <Text style={[s.collapseLink, { color: mutedColor }]}>
                Recolher
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView style={{ maxHeight: 440 }} nestedScrollEnabled>
          {items.map((item, idx) => {
            const isCollapsed = collapsedSet.has(idx);
            const summary = pickSummary(item);

            return (
              <View
                key={idx}
                style={[s.card, { borderColor, backgroundColor: bgColor }]}
              >
                <Pressable
                  onPress={() => toggleCollapse(idx)}
                  style={[
                    s.cardHeader,
                    {
                      borderBottomColor: isCollapsed
                        ? "transparent"
                        : borderColor,
                      backgroundColor: tintColor + "08",
                    },
                  ]}
                >
                  <Ionicons
                    name={isCollapsed ? "chevron-forward" : "chevron-down"}
                    size={16}
                    color={mutedColor}
                  />
                  <Text style={[s.cardNum, { color: tintColor }]}>
                    {idx + 1}
                  </Text>
                  {summary ? (
                    <Text
                      style={[s.cardSummary, { color: textColor }]}
                      numberOfLines={1}
                    >
                      {summary}
                    </Text>
                  ) : null}
                  <View style={{ flex: 1 }} />
                  {!readOnly && (
                    <Pressable
                      onPress={() => removeItem(idx)}
                      hitSlop={8}
                      style={s.rmBtn}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={15}
                        color="#ef4444"
                      />
                    </Pressable>
                  )}
                </Pressable>

                {!isCollapsed && (
                  <View style={s.cardBody}>
                    {allKeys.map((key) => {
                      const rawVal = item[key];
                      const displayVal =
                        rawVal === null || rawVal === undefined
                          ? ""
                          : String(rawVal);
                      return (
                        <View key={key} style={s.fieldRow}>
                          <Text style={[s.fieldLabel, { color: mutedColor }]}>
                            {humanizeKey(key)}
                          </Text>
                          <TextInput
                            value={displayVal}
                            onChangeText={(t) => updateField(idx, key, t)}
                            placeholder="—"
                            placeholderTextColor={mutedColor + "40"}
                            editable={!readOnly}
                            multiline={displayVal.length > 80}
                            style={[
                              s.fieldInput,
                              {
                                color: textColor,
                                backgroundColor: inputBgColor,
                                borderColor,
                              },
                            ]}
                          />
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        {!readOnly && (
          <Pressable style={[s.addBtn, { borderColor }]} onPress={addItem}>
            <Ionicons name="add-circle-outline" size={15} color={tintColor} />
            <Text style={[s.addBtnText, { color: tintColor }]}>
              Adicionar item
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  /* ══════════════════════════════════════════════════════════════ */
  /*  ARRAY OF PRIMITIVES MODE                                      */
  /* ══════════════════════════════════════════════════════════════ */
  const primItems = parsed as (string | number | boolean | null)[];
  const origType =
    primItems.find((v) => v !== null) !== undefined
      ? typeof primItems.find((v) => v !== null)
      : "string";

  const updatePrimItem = (idx: number, newVal: string) => {
    const next = primItems.map((item, i) => {
      if (i !== idx) return item;
      return coerceValue(newVal, origType);
    });
    onChange(JSON.stringify(next, null, 2));
  };

  const removePrimItem = (idx: number) => {
    onChange(
      JSON.stringify(
        primItems.filter((_, i) => i !== idx),
        null,
        2,
      ),
    );
  };

  const addPrimItem = () => {
    onChange(
      JSON.stringify([...primItems, origType === "number" ? 0 : ""], null, 2),
    );
  };

  return (
    <View>
      <View style={s.arrayHeader}>
        <View style={[s.badge, { backgroundColor: tintColor + "15" }]}>
          <Text style={[s.badgeText, { color: tintColor }]}>
            {primItems.length} {primItems.length === 1 ? "item" : "itens"}
          </Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
        {primItems.map((item, idx) => (
          <View
            key={idx}
            style={[s.primRow, { borderBottomColor: borderColor + "40" }]}
          >
            <Text style={[s.primIndex, { color: mutedColor }]}>{idx + 1}.</Text>
            <TextInput
              value={item === null || item === undefined ? "" : String(item)}
              onChangeText={(t) => updatePrimItem(idx, t)}
              placeholder="—"
              placeholderTextColor={mutedColor + "40"}
              editable={!readOnly}
              style={[
                s.primInput,
                {
                  color: textColor,
                  backgroundColor: inputBgColor,
                  borderColor,
                },
              ]}
            />
            {!readOnly && (
              <Pressable
                onPress={() => removePrimItem(idx)}
                hitSlop={8}
                style={s.rmBtn}
              >
                <Ionicons name="close-circle" size={18} color="#ef4444" />
              </Pressable>
            )}
          </View>
        ))}
      </ScrollView>

      {!readOnly && (
        <Pressable style={[s.addBtn, { borderColor }]} onPress={addPrimItem}>
          <Ionicons name="add-circle-outline" size={15} color={tintColor} />
          <Text style={[s.addBtnText, { color: tintColor }]}>
            Adicionar item
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/* ================================================================== */
/*  Styles                                                             */
/* ================================================================== */

const s = StyleSheet.create({
  /* ── Raw fallback ── */
  formatBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  formatBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },
  rawInput: {
    minHeight: 120,
    maxHeight: 300,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    lineHeight: 20,
    textAlignVertical: "top",
  },

  /* ── KV mode ── */
  kvRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  kvKey: {
    flex: 2,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "600",
  },
  kvVal: {
    flex: 3,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },

  /* ── Nested object mode ── */
  nestedSection: {
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nestedFieldRow: {
    gap: 4,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  /* ── Array header ── */
  arrayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  collapseControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  collapseLink: {
    fontSize: 12,
    fontWeight: "500",
  },

  /* ── Array-of-objects cards ── */
  card: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 10,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardNum: {
    fontSize: 13,
    fontWeight: "800",
    minWidth: 18,
  },
  cardSummary: {
    fontSize: 13,
    fontWeight: "400",
    flexShrink: 1,
  },
  cardBody: {
    padding: 12,
    gap: 12,
  },
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },

  /* ── Array-of-primitives ── */
  primRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  primIndex: {
    fontSize: 13,
    fontWeight: "700",
    width: 24,
    textAlign: "right",
  },
  primInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },

  /* ── Shared ── */
  rmBtn: {
    padding: 4,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 10,
    marginTop: 6,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 13,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
  },
});
