import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    AI_AGENT_ENDPOINT,
    buildAiInsightMessage,
    extractAiInsightText,
    UNIVERSAL_AI_INSIGHT_PROMPT,
} from "@/services/ai-insights";
import { api, getApiErrorMessage } from "@/services/api";
import { buildSearchParams } from "@/services/crud";
import { createDocumentRequest } from "@/services/document-requests";
import {
    type GeneratedDocument,
    listGeneratedDocuments,
} from "@/services/document-templates";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../theme/styles";

interface ServiceOrderItem {
  id: string;
  title?: string | null;
  description?: string | null;
  customer_id?: string | null;
  process_status?: string | null;
  tenant_id?: string | null;
  [key: string]: any;
}

interface LocalFile {
  id: string;
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
}

interface DocumentRequestItem {
  id: string;
  type: string;
  description: string;
}

export default function ProcessoAdvogadoScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    taskId?: string;
    taskTitle?: string;
    serviceOrderId?: string;
    propertyId?: string;
    lockProperty?: string;
  }>();
  const [serviceOrders, setServiceOrders] = useState<ServiceOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isClientVisible, setIsClientVisible] = useState(true);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<
    DocumentRequestItem[]
  >([]);
  const [newDocumentType, setNewDocumentType] = useState("");
  const [newDocumentDescription, setNewDocumentDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Library picker state
  const [showLibraryPicker, setShowLibraryPicker] = useState(false);
  const [libraryDocs, setLibraryDocs] = useState<GeneratedDocument[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  const primaryTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const borderTopColor = useThemeColor({}, "border");
  const inputBackground = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");

  const contextTaskTitle = Array.isArray(params.taskTitle)
    ? params.taskTitle[0]
    : params.taskTitle;
  const contextOrderId = Array.isArray(params.serviceOrderId)
    ? params.serviceOrderId[0]
    : params.serviceOrderId;
  const contextPropertyId = Array.isArray(params.propertyId)
    ? params.propertyId[0]
    : params.propertyId;
  const lockOrder =
    (Array.isArray(params.lockProperty)
      ? params.lockProperty[0]
      : params.lockProperty) === "1";

  const selectedOrder = serviceOrders.find((o) => o.id === selectedOrderId);

  const normalize = (value?: string | null) =>
    (value ?? "").toString().toLowerCase();

  const matchesFilter = useCallback(
    (order: ServiceOrderItem) => {
      const filterValue = normalize(clientFilter);
      const orderFields = [order.title, order.description, order.id]
        .map((field) => normalize(field))
        .join(" ");
      return filterValue ? orderFields.includes(filterValue) : true;
    },
    [clientFilter],
  );

  const fetchServiceOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/api_crud",
        {
          action: "list",
          table: "service_orders",
          ...buildSearchParams([], { sortColumn: "created_at" }),
        },
      );
      const body = response.data;
      const raw = Array.isArray(body)
        ? body
        : (body?.data ?? body?.value ?? body?.items ?? []);
      const list = (Array.isArray(raw) ? raw : []).filter(
        (o: any) => !o.deleted_at,
      ) as ServiceOrderItem[];
      setServiceOrders(list);
    } catch {
      Alert.alert("Erro", "Falha ao carregar ordens de serviço");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServiceOrders();
  }, [fetchServiceOrders]);

  useEffect(() => {
    const ctxId = contextOrderId ?? contextPropertyId;
    if (!ctxId) return;
    const exists = serviceOrders.some((o) => o.id === ctxId);
    if (!exists) return;

    setSelectedOrderId((current) => (current === ctxId ? current : ctxId));
  }, [contextOrderId, contextPropertyId, serviceOrders]);

  const handlePickFile = async () => {
    setSuccessMessage(null);
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const file = result.assets[0];
    setFiles((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name: file.name ?? "Arquivo",
        uri: file.uri,
        mimeType: file.mimeType ?? "application/octet-stream",
        size: file.size ?? undefined,
      },
    ]);
  };

  const removeFile = (fileId: string) => {
    setSuccessMessage(null);
    setFiles((prev) => prev.filter((file) => file.id !== fileId));
  };

  /* ── Library picker handlers ── */
  const openLibraryPicker = async () => {
    setShowLibraryPicker(true);
    setLibrarySearch("");
    if (libraryDocs.length > 0) return;
    setLibraryLoading(true);
    try {
      const docs = await listGeneratedDocuments(user?.tenant_id || "");
      setLibraryDocs(
        docs.filter(
          (d) =>
            !d.deleted_at &&
            d.status !== "draft" &&
            (d.pdf_base64 || d.pdf_url || d.filled_html),
        ),
      );
    } catch {
      Alert.alert("Erro", "Falha ao carregar documentos da biblioteca");
    } finally {
      setLibraryLoading(false);
    }
  };

  const filteredLibraryDocs = useMemo(() => {
    if (!librarySearch.trim()) return libraryDocs;
    const q = librarySearch.toLowerCase();
    return libraryDocs.filter((d) => (d.name || "").toLowerCase().includes(q));
  }, [libraryDocs, librarySearch]);

  const selectLibraryDoc = (doc: GeneratedDocument) => {
    // Check if already added
    const alreadyAdded = files.some((f) => f.id === `lib-${doc.id}`);
    if (alreadyAdded) {
      Alert.alert("Aviso", "Este documento já foi adicionado.");
      return;
    }

    const hasPdf = !!doc.pdf_base64 || !!doc.pdf_url;
    const ext = hasPdf ? "pdf" : "html";
    const mimeType = hasPdf ? "application/pdf" : "text/html";

    // For PDF: use data URI with base64 or the pdf_url
    // For HTML: use a data URI with the HTML content
    let uri = "";
    if (doc.pdf_base64) {
      uri = `data:application/pdf;base64,${doc.pdf_base64}`;
    } else if (doc.pdf_url) {
      uri = doc.pdf_url;
    } else if (doc.filled_html) {
      if (Platform.OS === "web") {
        const blob = new Blob([doc.filled_html], { type: "text/html" });
        uri = URL.createObjectURL(blob);
      } else {
        uri = `data:text/html;base64,${btoa(unescape(encodeURIComponent(doc.filled_html)))}`;
      }
    }

    setFiles((prev) => [
      ...prev,
      {
        id: `lib-${doc.id}`,
        name: `${doc.name || "Documento"}.${ext}`,
        uri,
        mimeType,
        size: undefined,
      },
    ]);

    setShowLibraryPicker(false);
    setSuccessMessage(null);
  };

  const handleAiInsights = useCallback(async () => {
    try {
      setAiLoading(true);
      setAiError(null);

      const filteredOrders = serviceOrders.filter(matchesFilter);
      const selected = selectedOrder ?? null;

      const contextPayload = {
        screen: {
          name: "Administrador/lancamentos-processos",
          generated_at: new Date().toISOString(),
        },
        actor: {
          user_id: user?.id ?? null,
          role: user?.role ?? null,
          tenant_id: user?.tenant_id ?? null,
        },
        context: {
          task_title: contextTaskTitle ?? null,
          context_order_id: contextOrderId ?? null,
          lock_order: lockOrder,
        },
        form: {
          selected_order_id: selectedOrderId || null,
          title: title || null,
          description_length: description.trim().length,
          is_client_visible: isClientVisible,
          files_count: files.length,
          requested_documents_count: documentRequests.length,
          requested_documents: documentRequests.map((doc) => ({
            type: doc.type,
            has_description: Boolean(doc.description),
          })),
        },
        order_scope: {
          total_orders_loaded: serviceOrders.length,
          total_orders_filtered: filteredOrders.length,
          selected_order: selected
            ? {
                id: selected.id,
                title: selected.title ?? null,
                description: selected.description ?? null,
              }
            : null,
        },
      };

      const message = buildAiInsightMessage(
        contextPayload,
        "Contexto de publicação de atualização de processo no painel administrativo.",
      );

      const response = await api.post(AI_AGENT_ENDPOINT, {
        source: "admin_process_launch_insights",
        prompt: UNIVERSAL_AI_INSIGHT_PROMPT,
        message,
        context: contextPayload,
        user_id: user?.id ?? null,
        tenant_id: user?.tenant_id ?? null,
        property_id: selectedOrderId || contextOrderId || null,
      });

      const insightText = extractAiInsightText(response.data);
      if (!insightText) {
        throw new Error("A IA não retornou conteúdo para exibir");
      }

      setAiInsights(insightText);
    } catch (err) {
      setAiError(getApiErrorMessage(err, "Falha ao consultar a IA"));
      setAiInsights(null);
    } finally {
      setAiLoading(false);
    }
  }, [
    contextOrderId,
    contextTaskTitle,
    description,
    documentRequests,
    files.length,
    isClientVisible,
    lockOrder,
    matchesFilter,
    serviceOrders,
    selectedOrder,
    selectedOrderId,
    title,
    user?.id,
    user?.role,
    user?.tenant_id,
  ]);

  const handleSubmit = async () => {
    setSuccessMessage(null);
    if (!selectedOrderId) {
      Alert.alert("Atenção", "Selecione uma ordem de serviço");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Atenção", "Informe o título da atualização");
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create process_update via api_crud
      const updateRes = await api.post(
        "https://n8n.sosescritura.com.br/webhook/api_crud",
        {
          action: "create",
          table: "process_updates",
          payload: {
            service_order_id: selectedOrderId,
            title: title.trim(),
            description: description.trim(),
            is_client_visible: isClientVisible,
            created_by: user?.id || null,
          },
        },
      );

      const rawData =
        updateRes.data?.data ?? updateRes.data?.value ?? updateRes.data;
      const createdRow = Array.isArray(rawData) ? rawData[0] : rawData;
      const processUpdateId = createdRow?.id;

      if (!processUpdateId) {
        throw new Error(
          "Não foi possível identificar o ID da atualização criada",
        );
      }

      // 2. Upload files as base64 via api_crud
      for (const file of files) {
        let base64Data = "";

        // Library docs: data URI already contains base64 or is a blob URL
        if (file.id.startsWith("lib-") && file.uri.startsWith("data:")) {
          const commaIdx = file.uri.indexOf(",");
          base64Data =
            commaIdx >= 0 ? file.uri.substring(commaIdx + 1) : file.uri;
        } else if (file.id.startsWith("lib-") && file.uri.startsWith("blob:")) {
          // Blob URL from library HTML docs (web only)
          const resp = await fetch(file.uri);
          const blob = await resp.blob();
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] || result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else if (Platform.OS === "web") {
          const resp = await fetch(file.uri);
          const blob = await resp.blob();
          base64Data = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(",")[1] || result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } else {
          const fs = await import("expo-file-system");
          base64Data = await fs.readAsStringAsync(file.uri, {
            encoding: "base64",
          });
        }

        await api.post("https://n8n.sosescritura.com.br/webhook/api_crud", {
          action: "create",
          table: "process_update_files",
          payload: {
            process_update_id: processUpdateId,
            file_name: file.name,
            description: description.trim(),
            mime_type: file.mimeType || "application/octet-stream",
            file_size: file.size || null,
            file_data: base64Data,
            storage_type: "database",
            is_client_visible: isClientVisible,
          },
        });
      }

      // 3. Create document requests if any
      let requestsCreated = 0;
      let requestsFailed = 0;

      if (isClientVisible && documentRequests.length > 0) {
        const requestFailures: string[] = [];
        for (const docRequest of documentRequests) {
          try {
            await createDocumentRequest({
              process_update_id: processUpdateId,
              service_order_id: selectedOrderId,
              document_type: docRequest.type,
              description: docRequest.description || undefined,
            });
            requestsCreated += 1;
          } catch (error) {
            console.error("Erro ao criar solicitação de documento:", error);
            requestFailures.push(docRequest.type);
            requestsFailed += 1;
          }
        }

        if (requestFailures.length > 0) {
          Alert.alert(
            "Atenção",
            `A atualização foi criada, mas ${requestFailures.length} solicitação(ões) de documento falharam: ${requestFailures.join(", ")}.`,
          );
        }
      }

      setTitle("");
      setDescription("");
      setIsClientVisible(true);
      setFiles([]);
      setDocumentRequests([]);
      setNewDocumentType("");
      setNewDocumentDescription("");

      const successDetails =
        requestsCreated > 0 || requestsFailed > 0
          ? `Solicitações: ${requestsCreated} criada(s), ${requestsFailed} falha(s).`
          : "Nenhuma solicitação de documento nesta publicação.";

      const successText = `Atualização publicada com sucesso.\nID: ${processUpdateId}\n${successDetails}`;

      setSuccessMessage(successText);
      Alert.alert("Publicação concluída", successText);
    } catch (err: any) {
      const rawMessage =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        "Falha ao publicar atualização";

      console.error("Erro ao publicar atualização", err?.response?.data ?? err);

      Alert.alert("Erro", String(rawMessage));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <View style={{ flex: 1 }}>
            <ThemedText
              style={[styles.processTitle, { color: primaryTextColor }]}
            >
              Lançar atualização (Advogado)
            </ThemedText>
            <ThemedText
              style={[styles.processSubtitle, { color: mutedTextColor }]}
            >
              {contextTaskTitle
                ? `Publicação vinculada à tarefa: ${contextTaskTitle}`
                : "Publique atualizações para seus clientes."}
            </ThemedText>
          </View>
          {selectedOrderId ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: "/Servicos/Processo" as any,
                  params: { serviceOrderId: selectedOrderId },
                })
              }
              style={{
                backgroundColor: tintColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <ThemedText
                style={{
                  color: onTintTextColor,
                  fontWeight: "700",
                  fontSize: 13,
                }}
              >
                Ver Processo
              </ThemedText>
            </TouchableOpacity>
          ) : null}
        </View>
      </ThemedView>

      <ThemedView style={[styles.processCard, { marginTop: 16 }]}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ThemedText
            style={[styles.processTitle, { color: primaryTextColor }]}
          >
            Dados da atualização
          </ThemedText>
          <TouchableOpacity
            onPress={handleAiInsights}
            disabled={aiLoading}
            style={{
              backgroundColor: aiLoading ? `${tintColor}33` : tintColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              minWidth: 86,
              alignItems: "center",
            }}
          >
            {aiLoading ? (
              <ActivityIndicator size="small" color={onTintTextColor} />
            ) : (
              <ThemedText
                style={{
                  color: onTintTextColor,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                ✨ IA
              </ThemedText>
            )}
          </TouchableOpacity>
        </View>

        {aiError ? (
          <ThemedText style={{ marginTop: 8, color: tintColor }}>
            {aiError}
          </ThemedText>
        ) : null}

        {aiInsights ? (
          <View
            style={{
              marginTop: 10,
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              padding: 10,
              backgroundColor: cardColor,
            }}
          >
            <ThemedText
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: primaryTextColor,
              }}
            >
              Insights da IA
            </ThemedText>
            <ThemedText
              style={{ marginTop: 6, color: primaryTextColor, fontSize: 12 }}
            >
              {aiInsights}
            </ThemedText>
          </View>
        ) : null}

        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Título
          </ThemedText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex.: Documentos enviados"
            placeholderTextColor={placeholderColor}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: inputBackground,
              color: primaryTextColor,
              marginTop: 6,
            }}
          />
        </View>

        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Descrição
          </ThemedText>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Detalhe a atualização"
            placeholderTextColor={placeholderColor}
            multiline
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              minHeight: 90,
              backgroundColor: inputBackground,
              color: primaryTextColor,
              textAlignVertical: "top",
              marginTop: 6,
            }}
          />
        </View>

        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 12 }}
        >
          <Switch
            value={isClientVisible}
            onValueChange={(value) => {
              setSuccessMessage(null);
              setIsClientVisible(value);
            }}
          />
          <ThemedText style={{ marginLeft: 8, color: mutedTextColor }}>
            Visível para o cliente
          </ThemedText>
        </View>

        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
            Anexos
          </ThemedText>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 16,
              marginTop: 8,
            }}
          >
            <TouchableOpacity
              onPress={handlePickFile}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons name="attach-outline" size={16} color={tintColor} />
              <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
                Arquivo
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openLibraryPicker}
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <Ionicons name="library-outline" size={16} color={tintColor} />
              <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
                Biblioteca
              </ThemedText>
            </TouchableOpacity>
          </View>

          {files.length > 0 ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              {files.map((file) => {
                const isLibDoc = file.id.startsWith("lib-");
                return (
                  <View
                    key={file.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      backgroundColor: isLibDoc ? `${tintColor}08` : undefined,
                      borderRadius: 6,
                      paddingVertical: isLibDoc ? 4 : 0,
                      paddingHorizontal: isLibDoc ? 6 : 0,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        flex: 1,
                      }}
                    >
                      <Ionicons
                        name={
                          isLibDoc ? "document-text-outline" : "attach-outline"
                        }
                        size={13}
                        color={mutedTextColor}
                      />
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor, flex: 1 }}
                        numberOfLines={1}
                      >
                        {file.name}
                      </ThemedText>
                      {isLibDoc && (
                        <View
                          style={{
                            backgroundColor: `${tintColor}18`,
                            borderRadius: 4,
                            paddingHorizontal: 5,
                            paddingVertical: 1,
                          }}
                        >
                          <ThemedText
                            style={{
                              fontSize: 9,
                              color: tintColor,
                              fontWeight: "600",
                            }}
                          >
                            BIBLIOTECA
                          </ThemedText>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => removeFile(file.id)}
                      style={{ marginLeft: 8 }}
                    >
                      <ThemedText style={{ color: tintColor, fontSize: 12 }}>
                        Remover
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View
          style={{
            marginTop: 16,
            paddingTop: 16,
            borderTopWidth: 1,
            borderTopColor,
          }}
        >
          <ThemedText
            style={{ fontSize: 12, color: mutedTextColor, fontWeight: "600" }}
          >
            Solicitar documentos do cliente
          </ThemedText>

          <View style={{ marginTop: 12 }}>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Tipo de documento
            </ThemedText>
            <TextInput
              value={newDocumentType}
              onChangeText={setNewDocumentType}
              placeholder="Ex.: RG, Comprovante de Renda"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: primaryTextColor,
                marginTop: 6,
              }}
            />
          </View>

          <View style={{ marginTop: 12 }}>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Descrição (opcional)
            </ThemedText>
            <TextInput
              value={newDocumentDescription}
              onChangeText={setNewDocumentDescription}
              placeholder="Ex.: Documento original ou cópia autenticada"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                minHeight: 60,
                backgroundColor: inputBackground,
                color: primaryTextColor,
                textAlignVertical: "top",
                marginTop: 6,
              }}
            />
          </View>

          <TouchableOpacity
            onPress={() => {
              if (!newDocumentType.trim()) {
                Alert.alert("Atenção", "Informe o tipo de documento");
                return;
              }

              setDocumentRequests((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  type: newDocumentType.trim(),
                  description: newDocumentDescription.trim(),
                },
              ]);

              setNewDocumentType("");
              setNewDocumentDescription("");
            }}
            style={{
              marginTop: 12,
              backgroundColor: tintColor,
              paddingVertical: 10,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <ThemedText
              style={{
                color: onTintTextColor,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              Adicionar solicitação
            </ThemedText>
          </TouchableOpacity>

          {documentRequests.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <ThemedText
                style={{
                  fontSize: 12,
                  color: mutedTextColor,
                  fontWeight: "600",
                }}
              >
                Documentos solicitados ({documentRequests.length})
              </ThemedText>
              {documentRequests.map((doc) => (
                <View
                  key={doc.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    borderLeftWidth: 3,
                    borderLeftColor: tintColor,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <ThemedText
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: primaryTextColor,
                      }}
                    >
                      {doc.type}
                    </ThemedText>
                    {doc.description ? (
                      <ThemedText
                        style={{
                          fontSize: 11,
                          color: mutedTextColor,
                          marginTop: 4,
                        }}
                      >
                        {doc.description}
                      </ThemedText>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      setDocumentRequests((prev) =>
                        prev.filter((d) => d.id !== doc.id),
                      )
                    }
                    style={{ marginLeft: 12 }}
                  >
                    <ThemedText
                      style={{
                        color: tintColor,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      Remover
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            marginTop: 16,
            backgroundColor: submitting ? mutedTextColor : tintColor,
            paddingVertical: 12,
            borderRadius: 8,
            alignItems: "center",
          }}
        >
          <ThemedText style={{ color: onTintTextColor, fontWeight: "600" }}>
            {submitting ? "Publicando..." : "Publicar atualização"}
          </ThemedText>
        </TouchableOpacity>

        {successMessage ? (
          <ThemedText style={{ marginTop: 12, color: tintColor }}>
            {successMessage}
          </ThemedText>
        ) : null}
      </ThemedView>

      <ThemedView style={[styles.processCard, { marginTop: 16 }]}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          {lockOrder ? "Ordem da tarefa" : "Selecionar ordem de serviço"}
        </ThemedText>

        {lockOrder ? (
          selectedOrder ? (
            <View
              style={{
                marginTop: 12,
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 12,
                backgroundColor: cardColor,
              }}
            >
              <ThemedText
                style={{ fontWeight: "600", color: primaryTextColor }}
              >
                {selectedOrder.title || "Ordem de serviço"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                {selectedOrder.description || "Sem descrição"}
              </ThemedText>
              {selectedOrder.process_status ? (
                <ThemedText
                  style={{ fontSize: 12, color: mutedTextColor, marginTop: 2 }}
                >
                  Status: {selectedOrder.process_status}
                </ThemedText>
              ) : null}
              <ThemedText
                style={{
                  fontSize: 12,
                  color: tintColor,
                  fontWeight: "600",
                  marginTop: 6,
                }}
              >
                Ordem travada pelo contexto da tarefa
              </ThemedText>
            </View>
          ) : (
            <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
              Carregando ordem vinculada...
            </ThemedText>
          )
        ) : (
          <View style={{ marginTop: 12 }}>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Pesquisar
            </ThemedText>
            <TextInput
              value={clientFilter}
              onChangeText={setClientFilter}
              placeholder="Buscar por título ou descrição"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: inputBackground,
                color: primaryTextColor,
                marginTop: 6,
              }}
            />
          </View>
        )}
      </ThemedView>

      {loading ? (
        <ThemedView
          style={[
            styles.container,
            { justifyContent: "center", alignItems: "center" },
          ]}
        >
          <ActivityIndicator size="large" />
        </ThemedView>
      ) : null}

      {!loading && serviceOrders.length === 0 ? (
        <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
          Nenhuma ordem de serviço encontrada.
        </ThemedText>
      ) : null}

      {!loading && serviceOrders.length > 0 && !lockOrder ? (
        <View style={{ gap: 12 }}>
          {serviceOrders.filter(matchesFilter).map((order) => (
            <TouchableOpacity
              key={order.id}
              style={{
                borderWidth: 1,
                borderColor:
                  order.id === selectedOrderId ? tintColor : borderColor,
                borderRadius: 10,
                padding: 12,
                backgroundColor: cardColor,
              }}
              onPress={() => setSelectedOrderId(order.id)}
            >
              <ThemedText
                style={{ fontWeight: "600", color: primaryTextColor }}
              >
                {order.title || "Ordem de serviço"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                {order.description || "Sem descrição"}
              </ThemedText>
              {order.process_status ? (
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Status: {order.process_status}
                </ThemedText>
              ) : null}
              {order.id === selectedOrderId ? (
                <ThemedText
                  style={{
                    fontSize: 12,
                    color: tintColor,
                    fontWeight: "600",
                    marginTop: 6,
                  }}
                >
                  Selecionado
                </ThemedText>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {/* Library Picker Modal */}
      <Modal
        visible={showLibraryPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowLibraryPicker(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "80%",
              paddingBottom: Platform.OS === "ios" ? 34 : 16,
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: borderColor,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Ionicons name="library-outline" size={20} color={tintColor} />
                <ThemedText
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: primaryTextColor,
                  }}
                >
                  Biblioteca de Documentos
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => setShowLibraryPicker(false)}>
                <Ionicons name="close" size={22} color={mutedTextColor} />
              </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <TextInput
                value={librarySearch}
                onChangeText={setLibrarySearch}
                placeholder="Buscar documento..."
                placeholderTextColor={placeholderColor}
                style={{
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  backgroundColor: inputBackground,
                  color: primaryTextColor,
                  fontSize: 13,
                }}
              />
            </View>

            {/* Doc list */}
            <ScrollView
              style={{ paddingHorizontal: 16 }}
              contentContainerStyle={{ paddingBottom: 16, gap: 8 }}
            >
              {libraryLoading ? (
                <ActivityIndicator style={{ marginTop: 24 }} />
              ) : filteredLibraryDocs.length === 0 ? (
                <ThemedText
                  style={{
                    color: mutedTextColor,
                    textAlign: "center",
                    marginTop: 24,
                    fontSize: 13,
                  }}
                >
                  {libraryDocs.length === 0
                    ? "Nenhum documento gerado na biblioteca."
                    : "Nenhum documento encontrado."}
                </ThemedText>
              ) : (
                filteredLibraryDocs.map((doc) => {
                  const hasPdf = !!doc.pdf_base64 || !!doc.pdf_url;
                  const alreadyAdded = files.some(
                    (f) => f.id === `lib-${doc.id}`,
                  );
                  return (
                    <TouchableOpacity
                      key={doc.id}
                      onPress={() => selectLibraryDoc(doc)}
                      disabled={alreadyAdded}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        padding: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: alreadyAdded
                          ? `${tintColor}40`
                          : borderColor,
                        backgroundColor: alreadyAdded
                          ? `${tintColor}08`
                          : undefined,
                        opacity: alreadyAdded ? 0.6 : 1,
                      }}
                    >
                      <View
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 8,
                          backgroundColor: hasPdf ? "#ef444410" : "#3b82f610",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons
                          name={hasPdf ? "document-outline" : "code-outline"}
                          size={18}
                          color={hasPdf ? "#ef4444" : "#3b82f6"}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <ThemedText
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: primaryTextColor,
                          }}
                          numberOfLines={1}
                        >
                          {doc.name || "Documento"}
                        </ThemedText>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            marginTop: 2,
                          }}
                        >
                          <ThemedText
                            style={{ fontSize: 11, color: mutedTextColor }}
                          >
                            {hasPdf ? "PDF" : "HTML"}
                          </ThemedText>
                          {doc.status && (
                            <View
                              style={{
                                backgroundColor:
                                  doc.status === "sent"
                                    ? "#3b82f618"
                                    : doc.status === "signed"
                                      ? "#8b5cf618"
                                      : "#22c55e18",
                                borderRadius: 4,
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                              }}
                            >
                              <ThemedText
                                style={{
                                  fontSize: 9,
                                  fontWeight: "600",
                                  color:
                                    doc.status === "sent"
                                      ? "#3b82f6"
                                      : doc.status === "signed"
                                        ? "#8b5cf6"
                                        : "#22c55e",
                                }}
                              >
                                {doc.status === "generated"
                                  ? "Gerado"
                                  : doc.status === "sent"
                                    ? "Enviado"
                                    : doc.status === "signed"
                                      ? "Assinado"
                                      : doc.status}
                              </ThemedText>
                            </View>
                          )}
                        </View>
                      </View>
                      {alreadyAdded ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={18}
                          color={tintColor}
                        />
                      ) : (
                        <Ionicons
                          name="add-circle-outline"
                          size={18}
                          color={tintColor}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
