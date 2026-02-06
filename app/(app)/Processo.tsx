import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	TouchableOpacity,
	View,
} from "react-native";
import { styles } from "../theme/styles";

interface Property {
  id: string;
  address?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  [key: string]: any;
}

interface ProcessUpdateFile {
  id: string;
  drive_file_id?: string;
  file_name?: string;
  description?: string;
  mime_type?: string;
  file_size?: number;
  drive_web_view_link?: string;
  drive_web_content_link?: string;
  created_at?: string;
  is_client_visible?: boolean;
}

interface ProcessUpdate {
  id: string;
  property_id: string;
  title?: string;
  description?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  is_client_visible?: boolean;
  files?: ProcessUpdateFile[];
}

export default function EtapaPropertiesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<ProcessUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);

  const tintColor = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
  const mutedTextColor = useThemeColor(
    { light: "#475569", dark: "#cbd5e1" },
    "text",
  );
  const cardBorderColor = useThemeColor(
    { light: "#e5e7eb", dark: "#1f2937" },
    "text",
  );
  const cardBackground = useThemeColor(
    { light: "#f8fafc", dark: "#0f172a" },
    "background",
  );

  const formatDate = (value?: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const fetchProperty = useCallback(async () => {
    if (!user?.id || !propertyId) return;
    try {
      const response = await api.post("/property_list", { userId: user.id });
      const list = Array.isArray(response.data) ? response.data : [];
      const found = list.find((item: Property) => item.id === propertyId);
      setProperty(found ?? null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar imóvel",
      );
    }
  }, [user?.id, propertyId]);

  const fetchUpdates = useCallback(async () => {
    if (!propertyId) return;
    try {
      const response = await api.post<ProcessUpdate[]>(
        "https://n8n.sosescritura.com.br/webhook/property_process_update",
        { property_id: propertyId, user_id: user?.id },
      );
      const list = Array.isArray(response.data) ? response.data : [];
      setUpdates(list);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Falha ao carregar atualizações",
      );
      setUpdates([]);
    }
  }, [propertyId, user?.id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([fetchProperty(), fetchUpdates()]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [fetchProperty, fetchUpdates]);

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>
          Carregando atualizações...
        </ThemedText>
      </ThemedView>
    );
  }

  if (!property) {
    return (
      <ThemedView style={[styles.container, { justifyContent: "center" }]}>
        <ThemedText>Imóvel não encontrado</ThemedText>
        {error ? (
          <ThemedText style={{ marginTop: 8, color: mutedTextColor }}>
            {error}
          </ThemedText>
        ) : null}
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 12 }}
        >
          <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
            Voltar
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>
    );
  }

  const visibleUpdates = updates.filter(
    (update) => update.is_client_visible !== false,
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <ThemedText style={styles.processTitle}>
          {property.address || "Imóvel"}
        </ThemedText>
        <ThemedText style={styles.processSubtitle}>
          {property.city || ""} {property.state || ""}
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.processCard}>
        <ThemedText style={styles.processTitle}>
          Atualizações do processo
        </ThemedText>

        {visibleUpdates.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor }}>
            {error
              ? "Não foi possível carregar as atualizações."
              : "Nenhuma atualização publicada ainda."}
          </ThemedText>
        ) : (
          <View style={{ gap: 12 }}>
            {visibleUpdates.map((update) => (
              <View
                key={update.id}
                style={{
                  padding: 12,
                  borderWidth: 1,
                  borderColor: cardBorderColor,
                  borderRadius: 8,
                  backgroundColor: cardBackground,
                }}
              >
                <ThemedText style={{ fontWeight: "700", fontSize: 14 }}>
                  {update.title || "Atualização"}
                </ThemedText>
                {update.description ? (
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {update.description}
                  </ThemedText>
                ) : null}
                {update.created_at ? (
                  <ThemedText style={{ fontSize: 11, color: mutedTextColor }}>
                    Publicado em {formatDate(update.created_at)}
                  </ThemedText>
                ) : null}

                {Array.isArray(update.files) && update.files.length > 0 && (
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {update.files
                      .filter((file) => file.is_client_visible !== false)
                      .map((file) => (
                        <View key={file.id}>
                          <ThemedText
                            style={{ fontSize: 12, fontWeight: "600" }}
                          >
                            {file.file_name || "Arquivo"}
                          </ThemedText>
                          {file.description ? (
                            <ThemedText
                              style={{ fontSize: 11, color: mutedTextColor }}
                            >
                              {file.description}
                            </ThemedText>
                          ) : null}
                        </View>
                      ))}
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}
