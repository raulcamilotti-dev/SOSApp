import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "@/app/theme/styles";

type Option = {
  label: string;
  value: string;
};

type EditableToggleProps = {
  label: string;
  value?: string;
  options: Option[];
  field: string;
  propertyId: string;
};

export function EditableToggle({
  label,
  value,
  options,
  field,
  propertyId,
}: EditableToggleProps) {
  const [currentValue, setCurrentValue] = useState(value);
  const [saving, setSaving] = useState(false);

  async function select(optionValue: string) {
    if (optionValue === currentValue) return;

    setSaving(true);
    setCurrentValue(optionValue);

    await fetch("https://n8n.sosescritura.com.br/webhook/property_update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: propertyId,
        field,
        value: optionValue,
      }),
    });

    setSaving(false);
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={styles.label}>{label}</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((option) => {
          const active = option.value === currentValue;

          return (
            <Pressable
              key={option.value}
              onPress={() => select(option.value)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 6,
                borderWidth: 1,
                backgroundColor: active ? "#E8F2FF" : "#FFFFFF",
                borderColor: active ? "#0066FF" : "#E5E5E5",
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "500",
                  color: active ? "#0066FF" : "#555555",
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {saving && (
        <Text style={{ fontSize: 11, color: "#888888", marginTop: 4 }}>
          Salvando...
        </Text>
      )}
    </View>
  );
}
