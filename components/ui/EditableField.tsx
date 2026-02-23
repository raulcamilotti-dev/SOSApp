import { api } from "@/services/api";
import { CRUD_ENDPOINT } from "@/services/crud";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";

type EditableFieldProps = {
  label: string;
  value: any;
  field: string;
  propertyId: string;
  editable?: boolean;
  onSave: (value: any) => Promise<void> | void;
};

export function EditableField({
  label,
  value,
  field,
  propertyId,
  editable = false,
  onSave,
}: EditableFieldProps) {
  const initialValue = value ?? "";
  const [text, setText] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const lastSavedValue = useRef(initialValue);

  useEffect(() => {
    setText(initialValue);
    lastSavedValue.current = initialValue;
  }, [initialValue]);

  async function save() {
    if (text === lastSavedValue.current) return;

    try {
      setSaving(true);
      setError(false);

      await api.post(CRUD_ENDPOINT, {
        action: "update",
        table: "properties",
        payload: { id: propertyId, [field]: text },
      });

      lastSavedValue.current = text;
    } catch (err) {
      console.error("ERRO AO SALVAR CAMPO", err);
      setText(lastSavedValue.current); // 🔙 rollback
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontSize: 12, color: "#666", marginBottom: 4 }}>
        {label}
      </Text>

      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={save}
        editable={!saving}
        style={{
          borderWidth: 1,
          borderColor: error ? "#e11d48" : "#ccc",
          padding: 8,
          borderRadius: 6,
          fontSize: 14,
          backgroundColor: saving ? "#f1f5f9" : "#fff",
        }}
      />

      {saving && (
        <Text style={{ fontSize: 11, color: "#ffffff", marginTop: 4 }}>
          Salvando…
        </Text>
      )}

      {error && (
        <Text style={{ fontSize: 11, color: "#e11d48", marginTop: 4 }}>
          Erro ao salvar. Valor restaurado.
        </Text>
      )}
    </View>
  );
}
