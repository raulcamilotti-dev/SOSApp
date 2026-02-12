import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  createDocumentResponse,
  listDocumentRequests,
  type DocumentRequest,
} from "@/services/document-requests";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { styles } from "../../theme/styles";

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
  url?: string;
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
  process_update_files?: ProcessUpdateFile[];
  attachments?: ProcessUpdateFile[];
  client_files?: ProcessUpdateFile[];
}

export default function EtapaPropertiesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<ProcessUpdate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<
    Map<string, DocumentRequest[]>
  >(new Map());
  const [loadingDocuments, setLoadingDocuments] = useState<Set<string>>(
    new Set(),
  );
  const [uploadingDocuments, setUploadingDocuments] = useState<Set<string>>(
    new Set(),
  );

  const tintColor = useThemeColor({}, "tint");
  const titleTextColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const bodyTextColor = useThemeColor({}, "text");
  const cardBorderColor = useThemeColor({}, "border");
  const cardBackground = useThemeColor({}, "card");
  const innerCardBackground = useThemeColor({}, "card");

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
      setError(err instanceof Error ? err.message : "Falha ao carregar imóvel");
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
      if (list[0]) {
        console.log("[processo] update sample", list[0]);
        console.log("[processo] update keys", Object.keys(list[0]));
        console.log("[processo] update files", {
          files: (list[0] as any).files,
          process_update_files: (list[0] as any).process_update_files,
          attachments: (list[0] as any).attachments,
          client_files: (list[0] as any).client_files,
        });
      }
      setUpdates(list);

      // Load document requests for each update
      const docRequests = new Map<string, DocumentRequest[]>();
      for (const update of list) {
        if (update.is_client_visible !== false) {
          try {
            const docs = await listDocumentRequests(update.id);
            docRequests.set(update.id, docs);
          } catch (err) {
            console.error("Erro ao carregar documentos solicitados:", err);
          }
        }
      }
      setDocumentRequests(docRequests);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao carregar atualizações",
      );
      setUpdates([]);
    }
  }, [propertyId, user?.id]);

  const handleUploadDocumentRequest = useCallback(
    async (documentRequestId: string, updateId: string) => {
      try {
        setUploadingDocuments((prev) => new Set(prev).add(documentRequestId));

        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/*"],
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.[0]) return;

        const file = result.assets[0];
        const formData = new FormData();
        formData.append("property_process_update_id", updateId);

        if (Platform.OS === "web") {
          const fileResponse = await fetch(file.uri);
          const blob = await fileResponse.blob();
          const webFile = new File([blob], file.name, {
            type: file.mimeType ?? blob.type ?? "application/octet-stream",
          });
          formData.append("files", webFile);
        } else {
          formData.append("files", {
            uri: file.uri,
            name: file.name,
            type: file.mimeType ?? "application/octet-stream",
          } as any);
        }

        const uploadResponse = await api.post(
          "https://n8n.sosescritura.com.br/webhook/property_process_updates_add_files",
          formData,
        );

        const responseData = uploadResponse.data?.data || uploadResponse.data;
        const fileId = responseData?.id || responseData?.drive_file_id;
        const fileLink = responseData?.drive_web_view_link || responseData?.url;

        if (fileId) {
          // Create document response and mark request as fulfilled
          await createDocumentResponse({
            document_request_id: documentRequestId,
            file_name: file.name,
            mime_type: file.mimeType ?? "application/octet-stream",
            drive_file_id: fileId,
            drive_web_view_link: fileLink,
          });

          // Update local state to mark as fulfilled
          setDocumentRequests((prev) => {
            const updated = new Map(prev);
            const docs = updated.get(updateId) || [];
            updated.set(
              updateId,
              docs.map((doc) =>
                doc.id === documentRequestId
                  ? { ...doc, is_fulfilled: true }
                  : doc,
              ),
            );
            return updated;
          });

          Alert.alert("Sucesso", "Documento enviado com sucesso!");
        }
      } catch (err) {
        console.error("Erro ao enviar documento:", err);
        Alert.alert("Erro", "Falha ao enviar documento");
      } finally {
        setUploadingDocuments((prev) => {
          const updated = new Set(prev);
          updated.delete(documentRequestId);
          return updated;
        });
      }
    },
    [],
  );

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
      <ThemedView
        style={[styles.processCard, { backgroundColor: cardBackground }]}
      >
        <ThemedText style={[styles.processTitle, { color: titleTextColor }]}>
          {property.address || "Imóvel"}
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          {property.city || ""} {property.state || ""}
        </ThemedText>
      </ThemedView>

      <ThemedView
        style={[styles.processCard, { backgroundColor: cardBackground }]}
      >
        <ThemedText style={[styles.processTitle, { color: titleTextColor }]}>
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
                  backgroundColor: innerCardBackground,
                }}
              >
                <ThemedText
                  style={{
                    fontWeight: "700",
                    fontSize: 14,
                    color: bodyTextColor,
                  }}
                >
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

                {(() => {
                  const files =
                    (Array.isArray(update.files) && update.files) ||
                    (Array.isArray(update.process_update_files) &&
                      update.process_update_files) ||
                    (Array.isArray(update.attachments) && update.attachments) ||
                    (Array.isArray(update.client_files) &&
                      update.client_files) ||
                    [];

                  if (files.length === 0) return null;

                  return (
                    <View style={{ marginTop: 8, gap: 6 }}>
                      {files
                        .filter((file) => file.is_client_visible !== false)
                        .map((file) => {
                          const fileUrl =
                            file.url ||
                            file.drive_web_view_link ||
                            file.drive_web_content_link;
                          return (
                            <View key={file.id}>
                              <TouchableOpacity
                                onPress={async () => {
                                  const url = fileUrl;
                                  console.log("[processo] file link", {
                                    id: file.id,
                                    url: file.url,
                                    drive_web_view_link:
                                      file.drive_web_view_link,
                                    drive_web_content_link:
                                      file.drive_web_content_link,
                                  });
                                  if (!url) {
                                    alert("Arquivo sem link disponível.");
                                    return;
                                  }
                                  const canOpen = await Linking.canOpenURL(url);
                                  if (canOpen) {
                                    Linking.openURL(url);
                                  } else {
                                    alert("Não foi possível abrir o link.");
                                  }
                                }}
                                activeOpacity={0.7}
                                style={{ alignSelf: "flex-start" }}
                              >
                                <ThemedText
                                  onPress={async () => {
                                    const url = fileUrl;
                                    if (!url) return;
                                    const canOpen =
                                      await Linking.canOpenURL(url);
                                    if (canOpen) {
                                      Linking.openURL(url);
                                    }
                                  }}
                                  style={{
                                    fontSize: 12,
                                    fontWeight: "600",
                                    color: fileUrl ? tintColor : bodyTextColor,
                                    textDecorationLine: fileUrl
                                      ? "underline"
                                      : "none",
                                  }}
                                >
                                  {file.file_name || "Arquivo"}
                                </ThemedText>
                              </TouchableOpacity>
                              {file.description ? (
                                <ThemedText
                                  style={{
                                    fontSize: 11,
                                    color: mutedTextColor,
                                  }}
                                >
                                  {file.description}
                                </ThemedText>
                              ) : null}
                            </View>
                          );
                        })}
                    </View>
                  );
                })()}

                {(() => {
                  const docs = documentRequests.get(update.id) || [];
                  if (docs.length === 0) return null;

                  return (
                    <View
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTopWidth: 1,
                        borderTopColor: cardBorderColor,
                      }}
                    >
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: bodyTextColor,
                          marginBottom: 8,
                        }}
                      >
                        Documentos solicitados
                      </ThemedText>
                      <View style={{ gap: 8 }}>
                        {docs.map((doc) => {
                          const isUploading = uploadingDocuments.has(doc.id);
                          return (
                            <View
                              key={doc.id}
                              style={{
                                paddingHorizontal: 10,
                                paddingVertical: 8,
                                backgroundColor: doc.is_fulfilled
                                  ? tintColor + "20"
                                  : cardBorderColor + "20",
                                borderRadius: 6,
                                borderLeftWidth: 3,
                                borderLeftColor: doc.is_fulfilled
                                  ? tintColor
                                  : mutedTextColor,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                }}
                              >
                                <View style={{ flex: 1 }}>
                                  <ThemedText
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "600",
                                      color: bodyTextColor,
                                    }}
                                  >
                                    {doc.document_type}
                                  </ThemedText>
                                  {doc.description ? (
                                    <ThemedText
                                      style={{
                                        fontSize: 11,
                                        color: mutedTextColor,
                                        marginTop: 2,
                                      }}
                                    >
                                      {doc.description}
                                    </ThemedText>
                                  ) : null}
                                  {doc.is_fulfilled ? (
                                    <ThemedText
                                      style={{
                                        fontSize: 10,
                                        color: tintColor,
                                        marginTop: 4,
                                        fontWeight: "600",
                                      }}
                                    >
                                      ✓ Enviado
                                    </ThemedText>
                                  ) : null}
                                </View>
                                {!doc.is_fulfilled ? (
                                  <TouchableOpacity
                                    onPress={() =>
                                      handleUploadDocumentRequest(
                                        doc.id,
                                        update.id,
                                      )
                                    }
                                    disabled={isUploading}
                                    style={{
                                      marginLeft: 8,
                                      paddingHorizontal: 10,
                                      paddingVertical: 6,
                                      backgroundColor: tintColor,
                                      borderRadius: 4,
                                    }}
                                  >
                                    {isUploading ? (
                                      <ActivityIndicator
                                        size="small"
                                        color={bodyTextColor}
                                      />
                                    ) : (
                                      <ThemedText
                                        style={{
                                          fontSize: 11,
                                          fontWeight: "600",
                                          color: "white",
                                        }}
                                      >
                                        Enviar
                                      </ThemedText>
                                    )}
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })()}
              </View>
            ))}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}
