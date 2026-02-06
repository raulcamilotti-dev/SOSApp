/* eslint-disable react-hooks/exhaustive-deps */
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { FieldRenderer } from "@/components/ui/FieldRenderer";
import { useAuth } from "@/core/auth/AuthContext";
import { propertyFields } from "@/core/fields/property.fields";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../theme/styles";

interface Property {
  id: string;
  [key: string]: any;
}

interface Document {
  id: string;
  fileName: string;
  description: string;
  fileUri: string;
  fileType: string;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveWebContentLink?: string;
}

interface N8nUploadResponse {
  drive_file_id?: string;
  file_name?: string;
  description?: string;
  mime_type?: string;
  file_size?: number;
  drive_web_view_link?: string;
  drive_web_content_link?: string;
}

export default function PropertyListScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<Record<string, Document[]>>({});
  const [uploadingDocuments, setUploadingDocuments] = useState<
    Record<string, boolean>
  >({});
  const [expandedProperties, setExpandedProperties] = useState<
    Record<string, boolean>
  >({});
  const [latestUpdateByProperty, setLatestUpdateByProperty] = useState<
    Record<string, { title: string; date?: string }>
  >({});

  const borderColor = useThemeColor({ light: "#e0e0e0", dark: "#333" }, "text");
  // Removed unused backgroundColor variable

  const tintColor = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
  const mutedTextColor = useThemeColor(
    { light: "#475569", dark: "#cbd5e1" },
    "text",
  );

  const fetchLatestUpdates = async () => {
    if (!user?.id) return;
    try {
      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_process_update_listall",
        { user_id: user.id },
      );
      const list = Array.isArray(response.data) ? response.data : [];
      setLatestUpdateByProperty((prev) => {
        const next = { ...prev };
        list.forEach((item: any) => {
          if (!item?.property_id) return;
          const timeline = Array.isArray(item.timeline) ? item.timeline : [];
          const latest = timeline[0];
          next[item.property_id] = {
            title: latest?.title || "Sem atualizações",
            date: latest?.created_at,
          };
        });
        return next;
      });
    } catch {
      // ignore
    }
  };

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

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await api.post("/property_list", { userId: user?.id });
      setProperties(Array.isArray(response.data) ? response.data : []);

      // Carregar documentos de cada imóvel
      if (Array.isArray(response.data)) {
        const docsMap: Record<string, Document[]> = {};
        for (const property of response.data) {
          const files = Array.isArray(property.client_files)
            ? property.client_files
            : [];
          docsMap[property.id] = files.map((file: any) => ({
            id: file.id,
            fileName: file.file_name ?? "Documento",
            description: file.description ?? "Documento anexado",
            fileUri: file.drive_web_view_link ?? "",
            fileType: file.mime_type ?? "unknown",
            driveFileId: file.drive_file_id,
            driveWebViewLink: file.drive_web_view_link,
            driveWebContentLink: file.drive_web_content_link,
          }));
        }
        setDocuments(docsMap);

        await fetchLatestUpdates();
      }
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
  const uploadDocumentToN8n = async (
    propertyId: string,
    file: DocumentPicker.DocumentPickerAsset,
    description: string,
  ) => {
    const formData = new FormData();
    formData.append("property_id", propertyId);
    if (user?.id) formData.append("user_id", user.id);
    formData.append("description", description);
    formData.append("file_name", file.name ?? "Documento");

    if (Platform.OS === "web") {
      const fileResponse = await fetch(file.uri);
      const blob = await fileResponse.blob();
      const webFile = new File([blob], file.name ?? "documento", {
        type: file.mimeType ?? blob.type ?? "application/octet-stream",
      });
      formData.append("file", webFile);
    } else {
      formData.append("file", {
        uri: file.uri,
        name: file.name ?? "documento",
        type: file.mimeType ?? "application/octet-stream",
      } as any);
    }

    const response = await api.post<N8nUploadResponse>(
      "https://n8n.sosescritura.com.br/webhook/client_files",
      formData,
    );

    return response.data;
  };
  const handleAddDocument = async (propertyId: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];

      setUploadingDocuments((prev) => ({ ...prev, [propertyId]: true }));

      const baseDoc: Document = {
        id: Date.now().toString(),
        fileName: file.name ?? "Documento",
        description: "Documento anexado",
        fileUri: file.uri,
        fileType: file.mimeType ?? "unknown",
      };

      const updatedDescription =
        Platform.OS === "ios"
          ? await new Promise<string>((resolve) => {
              Alert.prompt(
                "Editar Descrição",
                "Insira uma descrição para o documento:",
                [
                  {
                    text: "Cancelar",
                    onPress: () => resolve(baseDoc.description),
                  },
                  {
                    text: "Salvar",
                    onPress: (text) => resolve(text || baseDoc.description),
                  },
                ],
                "plain-text",
                baseDoc.description,
              );
            })
          : baseDoc.description;

      // Envia para o n8n
      const n8nData = await uploadDocumentToN8n(
        propertyId,
        file,
        updatedDescription,
      );

      const newDoc: Document = {
        ...baseDoc,
        description: n8nData?.description ?? updatedDescription,
        fileName: n8nData?.file_name ?? baseDoc.fileName,
        fileType: n8nData?.mime_type ?? baseDoc.fileType,
        driveFileId: n8nData?.drive_file_id,
        driveWebViewLink: n8nData?.drive_web_view_link,
        driveWebContentLink: n8nData?.drive_web_content_link,
      };

      setDocuments((prev) => ({
        ...prev,
        [propertyId]: [...(prev[propertyId] || []), newDoc],
      }));

      Alert.alert("Sucesso", "Documento anexado");
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Falha ao enviar documento");
    } finally {
      setUploadingDocuments((prev) => ({ ...prev, [propertyId]: false }));
    }
  };

  const handleRemoveDocument = (propertyId: string, docId: string) => {
    Alert.alert(
      "Remover documento",
      "Tem certeza que deseja remover este documento?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: () => {
            setDocuments((prev) => ({
              ...prev,
              [propertyId]: prev[propertyId].filter((d) => d.id !== docId),
            }));
          },
        },
      ],
    );
  };

  const toggleProperty = (propertyId: string) => {
    setExpandedProperties((prev) => ({
      ...prev,
      [propertyId]: !prev[propertyId],
    }));
  };

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
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
            marginBottom: 20,
            padding: 12,
            borderWidth: 1,
            borderColor: "#e0e0e0", // Cor do borda fixa
            borderRadius: 8,
            backgroundColor: "#ffffff", // Fundo branco fixo
            elevation: 1,
            shadowColor: "#6d6d6d",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 1,
          }}
        >
          <TouchableOpacity
            onPress={() => toggleProperty(property.id)}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 0,
            }}
          >
            <ThemedText
              style={{ fontSize: 16, fontWeight: "700", color: "#000" }}
            >
              {property.address || "Imóvel"}
            </ThemedText>
            <ThemedText style={{ fontSize: 14, fontWeight: "700" }}>
              {expandedProperties[property.id] ? "−" : "+"}
            </ThemedText>
          </TouchableOpacity>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Última atualização:{" "}
              {latestUpdateByProperty[property.id]?.title || "-"}
              {latestUpdateByProperty[property.id]?.date
                ? ` · ${formatDate(latestUpdateByProperty[property.id]?.date)}`
                : ""}
            </ThemedText>
          </View>

          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <TouchableOpacity
              onPress={() => toggleProperty(property.id)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: borderColor,
                backgroundColor: "#ffffff",
              }}
            >
              <ThemedText
                style={{ fontSize: 12, fontWeight: "600", color: "#0b0b0b" }}
              >
                {expandedProperties[property.id]
                  ? "Ocultar detalhes"
                  : "Ver detalhes"}
              </ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Processo",
                  params: { propertyId: property.id },
                })
              }
              style={{
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: "#f15959",
              }}
            >
              <ThemedText
                style={{ fontSize: 12, fontWeight: "600", color: "#0b0b0b" }}
              >
                Ver processo
              </ThemedText>
            </TouchableOpacity>
          </View>

          {expandedProperties[property.id] && (
            <>
              <View style={{ gap: 0 }}>
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

              {/* Seção de documentos */}
              <View
                style={{
                  marginTop: 16,
                  borderTopWidth: 1,
                  borderColor,
                  paddingTop: 12,
                }}
              >
                <ThemedText
                  style={{ fontSize: 14, fontWeight: "600", marginBottom: 8 }}
                >
                  Documentos ({documents[property.id]?.length || 0})
                </ThemedText>

                {documents[property.id]?.length > 0 && (
                  <View style={{ marginBottom: 12 }}>
                    {documents[property.id].map((doc) => (
                      <View
                        key={doc.id}
                        style={{
                          padding: 12,
                          marginBottom: 8,
                          backgroundColor: "#f5f7fa",
                          borderRadius: 6,
                          borderLeftWidth: 4,
                          borderLeftColor: tintColor,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <View style={{ flex: 1, paddingRight: 8 }}>
                            <ThemedText
                              style={{
                                fontSize: 12,
                                fontWeight: "600",
                                color: "#111",
                              }}
                            >
                              {doc.fileName}
                            </ThemedText>
                            <ThemedText
                              style={{
                                fontSize: 11,
                                marginTop: 4,
                                color: "#555",
                              }}
                            >
                              {doc.description}
                            </ThemedText>
                          </View>

                          <TouchableOpacity
                            onPress={() =>
                              handleRemoveDocument(property.id, doc.id)
                            }
                            style={{ padding: 8 }}
                          >
                            <ThemedText
                              style={{ color: "#d11a2a", fontWeight: "700" }}
                            >
                              ✕
                            </ThemedText>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  onPress={() => handleAddDocument(property.id)}
                  disabled={!!uploadingDocuments[property.id]}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: tintColor,
                    borderRadius: 6,
                    alignItems: "center",
                    opacity: uploadingDocuments[property.id] ? 0.7 : 1,
                  }}
                >
                  {uploadingDocuments[property.id] ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <ActivityIndicator size="small" color="#333333" />
                      <ThemedText
                        style={{ color: "#333333", fontWeight: "600" }}
                      >
                        Enviando...
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText style={{ color: "#333333", fontWeight: "600" }}>
                      + Adicionar Documento
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </ThemedView>
      ))}
    </ScrollView>
  );
}
