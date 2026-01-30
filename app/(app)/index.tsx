/* eslint-disable react-hooks/exhaustive-deps */
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FieldRenderer } from "@/components/ui/FieldRenderer";
import { useAuth } from "@/core/auth/AuthContext";
import { propertyFields } from "@/core/fields/property.fields";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, View } from "react-native";
import { styles } from "../theme/styles";

interface Property {
  id: string;
  [key: string]: any;
}

export default function PropertyListScreen() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);

  const borderColor = useThemeColor({ light: "#e0e0e0", dark: "#333" }, "text");
  const backgroundColor = useThemeColor(
    { light: "#f9f9f9", dark: "#1a1a1a" },
    "background",
  );

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await api.post("/property_list", { userId: user?.id });
      setProperties(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro ao carregar imóveis";
      Alert.alert("Erro", message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    fetchProperties();
  }, [user?.id]);

  const handleSaveProperty = async (
    propertyId: string,
    updates: Record<string, any>,
  ) => {
    try {
      await api.post(`/properties_update`, { ...updates, userId: user?.id });
      setProperties((prev) =>
        prev.map((p) => (p.id === propertyId ? { ...p, ...updates } : p)),
      );
      Alert.alert("Sucesso", "Imóvel atualizado");
    } catch {
      Alert.alert("Erro", "Falha ao salvar imóvel");
    }
  };

  if (loading) {
    return (
      <ThemedView
        style={[styles.container, { justifyContent: "center", alignItems: "center" }]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando imóveis...</ThemedText>
      </ThemedView>
    );
  }

  if (properties.length === 0) {
    return (
      <ThemedView style={[styles.container, { justifyContent: "center" }]}>
        <ThemedText>Nenhum imóvel encontrado</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {properties.map((property) => (
        <ThemedView
          key={property.id}
          style={{
            marginBottom: 20, // Reduced margin
            padding: 12, // Reduced padding
            borderWidth: 1,
            borderColor,
            borderRadius: 8, // Slightly reduced border radius
            backgroundColor,
            elevation: 1, // Reduced elevation
            shadowColor: "#6d6d6d",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05, // Reduced shadow opacity
            shadowRadius: 1, // Reduced shadow radius
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 0 // Reduced margin
            }}
          >
            <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
              {property.address || "Imóvel"}
            </ThemedText>
          </View>

          <View style={{ gap: 0 }}> {/* Reduced gap */}
            {propertyFields.map((field) => (
              <FieldRenderer
                key={field.field}
                propertyId={property.id}
                field={field.field}
                label={field.label}
                type={field.type as "text" | "toggle" | "money"}
                options={field.options}
                value={(property as any)[field.field] ?? ""}
                editable={false}
                onSave={(value) =>
                  handleSaveProperty(property.id, { [field.field]: value })
                }
              />
            ))}
          </View>
        </ThemedView>
      ))}
    </ScrollView>
  );
}
