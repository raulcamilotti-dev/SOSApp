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
import { useEffect, useState } from "react";
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
  ViewStyle,
} from "react-native";
import { styles } from "../../theme";

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

type CreatePropertyForm = {
  address: string;
  number: string;
  postal_code: string;
  complement: string;
  property_value: string;
  city: string;
  state: string;
  indicacao: string;
  has_registry: boolean;
  has_contract: boolean;
  part_of_larger_area: boolean;
  owner_relative: boolean;
  larger_area_registry: boolean;
  city_rural: boolean;
};

export default function PropertyListScreen() {
  const { user } = useAuth();
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
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  // Removed unused cepLoading state
  const [createForm, setCreateForm] = useState<CreatePropertyForm>({
    address: "",
    number: "",
    postal_code: "",
    complement: "",
    property_value: "",
    city: "",
    state: "",
    indicacao: "",
    has_registry: false,
    has_contract: false,
    part_of_larger_area: false,
    owner_relative: false,
    larger_area_registry: false,
    city_rural: false,
  });

  const router = useRouter();
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const onTintTextColor = useThemeColor({}, "background");
  const modalBackdrop = "rgba(0, 0, 0, 0.55)";
  const inputBackground = useThemeColor({}, "input");
  const inputTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");

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

  const resetCreateForm = () => {
    setCreateForm({
      address: "",
      number: "",
      postal_code: "",
      complement: "",
      property_value: "",
      city: "",
      state: "",
      indicacao: "",
      has_registry: false,
      has_contract: false,
      part_of_larger_area: false,
      owner_relative: false,
      larger_area_registry: false,
      city_rural: false,
    });
  };

  // Removed unused handleCepLookup function

  const handleCreateProperty = async () => {
    try {
      setCreateSubmitting(true);
      const sanitizedNumber = createForm.number.replace(/\D/g, "");
      const payload = {
        ...createForm,
        number: sanitizedNumber,
        user_id: user?.id,
      };
      await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_create",
        payload,
      );
      Alert.alert("Sucesso", "Imóvel criado com sucesso");
      setCreateModalVisible(false);
      resetCreateForm();
      await fetchProperties();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao criar imóvel";
      Alert.alert("Erro", message);
    } finally {
      setCreateSubmitting(false);
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
                    onPress: (text?: string) =>
                      resolve(text || baseDoc.description),
                  },
                ],
                "plain-text",
                baseDoc.description,
              );
            })
          : baseDoc.description;

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
        [propertyId]: prev[propertyId]
          ? [...prev[propertyId], newDoc]
          : [newDoc],
      }));
    } catch {
      Alert.alert("Erro", "Falha ao anexar documento");
    } finally {
      setUploadingDocuments((prev) => ({ ...prev, [propertyId]: false }));
    }
  };

  const handleRemoveDocument = (propertyId: string, docId: string) => {
    Alert.alert("Remover documento", "Deseja remover este documento?", [
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
    ]);
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
          styles.container as ViewStyle,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
        <ThemedText style={{ marginTop: 12 }}>Carregando imóveis...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView
        style={{
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          backgroundColor: cardColor,
          shadowColor: "#000",
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <ThemedText
          style={{ fontSize: 18, fontWeight: "700", color: textColor }}
        >
          Imóveis
        </ThemedText>
        <ThemedText style={{ fontSize: 14, color: mutedTextColor }}>
          Gestão de imóveis e acompanhamento de processos.
        </ThemedText>

        <TouchableOpacity
          onPress={() => setCreateModalVisible(true)}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: tintColor,
            borderRadius: 6,
            alignItems: "center",
          }}
        >
          <ThemedText style={{ color: onTintTextColor, fontWeight: "600" }}>
            Cadastrar novo imóvel
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      {properties.length === 0 ? (
        <ThemedText style={{ marginTop: 12, color: mutedTextColor }}>
          Nenhum imóvel encontrado.
        </ThemedText>
      ) : null}

      {properties.map((property) => {
        const updates = propertyFields.reduce(
          (acc, field) => {
            acc[field.field] = property[field.field] ?? "";
            return acc;
          },
          {} as Record<string, any>,
        );

        const propertyDocs = documents[property.id] || [];
        const expanded = expandedProperties[property.id];
        const latestUpdate = latestUpdateByProperty[property.id];

        return (
          <ThemedView
            key={property.id}
            style={{
              borderRadius: 12,
              padding: 16,
              marginBottom: 16,
              backgroundColor: cardColor,
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <TouchableOpacity onPress={() => toggleProperty(property.id)}>
              <ThemedText
                style={{ fontSize: 18, fontWeight: "700", color: textColor }}
              >
                {property.address || "Imóvel"}
              </ThemedText>
              <ThemedText style={{ fontSize: 14, color: mutedTextColor }}>
                {property.city || ""} {property.state || ""}
              </ThemedText>
            </TouchableOpacity>

            {latestUpdate ? (
              <ThemedText style={{ color: mutedTextColor, marginTop: 8 }}>
                Última atualização: {latestUpdate.title}
                {latestUpdate.date ? ` • ${formatDate(latestUpdate.date)}` : ""}
              </ThemedText>
            ) : null}

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => toggleProperty(property.id)}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: tintColor,
                  marginRight: 8,
                }}
              >
                <ThemedText
                  style={{ fontSize: 12, fontWeight: "600", color: tintColor }}
                >
                  {expanded ? "Ocultar detalhes" : "Ver detalhes"}
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  router.push({
                    pathname: "/Servicos/Processo",
                    params: { propertyId: property.id },
                  })
                }
              >
                <ThemedText
                  style={{ fontSize: 12, fontWeight: "600", color: tintColor }}
                >
                  Ver processo
                </ThemedText>
              </TouchableOpacity>
            </View>
            {expanded ? (
              <View style={{ marginTop: 12 }}>
                {propertyFields.map((field) => (
                  <FieldRenderer
                    key={field.field}
                    propertyId={property.id}
                    field={field.field}
                    label={field.label}
                    type={field.type}
                    options={field.options}
                    value={updates[field.field]}
                    onSave={(value: string | number | boolean) =>
                      handleSaveProperty(property.id, { [field.field]: value })
                    }
                    editable
                  />
                ))}
                <ThemedText
                  style={{ fontSize: 16, fontWeight: "700", marginTop: 16 }}
                >
                  Documentos
                </ThemedText>
                {propertyDocs.length === 0 ? (
                  <ThemedText style={{ color: mutedTextColor }}>
                    Nenhum documento anexado.
                  </ThemedText>
                ) : (
                  propertyDocs.map((doc) => (
                    <View key={doc.id} style={{ marginTop: 8 }}>
                      <ThemedText
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: tintColor,
                        }}
                      >
                        {doc.fileName}
                      </ThemedText>
                      <ThemedText
                        style={{
                          fontSize: 11,
                          marginTop: 4,
                          color: mutedTextColor,
                        }}
                      >
                        {doc.description}
                      </ThemedText>
                      <TouchableOpacity
                        onPress={() =>
                          handleRemoveDocument(property.id, doc.id)
                        }
                        style={{ marginTop: 4 }}
                      >
                        <ThemedText
                          style={{ color: tintColor, fontWeight: "700" }}
                        >
                          ✕
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  ))
                )}
                <TouchableOpacity
                  onPress={() => handleAddDocument(property.id)}
                  disabled={!!uploadingDocuments[property.id]}
                  style={{
                    marginTop: 12,
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
                      <ActivityIndicator size="small" color={onTintTextColor} />
                      <ThemedText
                        style={{ color: onTintTextColor, fontWeight: "600" }}
                      >
                        Enviando...
                      </ThemedText>
                    </View>
                  ) : (
                    <ThemedText
                      style={{ color: onTintTextColor, fontWeight: "600" }}
                    >
                      + Adicionar Documento
                    </ThemedText>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </ThemedView>
        );
      })}
      {/* Move Modal inside main return */}
      <Modal
        transparent
        visible={createModalVisible}
        animationType="slide"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: modalBackdrop,
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: cardColor,
              borderRadius: 12,
              padding: 16,
              maxHeight: "90%",
            }}
          >
            <ThemedText
              style={{ fontSize: 18, fontWeight: "700", color: textColor }}
            >
              Criar imóvel
            </ThemedText>

            <ScrollView
              style={{ marginTop: 12, marginBottom: 8 }}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {[
                { key: "postal_code", label: "CEP" },
                { key: "address", label: "Endereço" },
                { key: "number", label: "Número" },
                { key: "complement", label: "Complemento" },
                { key: "city", label: "Cidade" },
                { key: "state", label: "Estado" },
                { key: "property_value", label: "Valor do imóvel" },
                { key: "indicacao", label: "Código promocional" },
                // Add boolean fields for switches
                {
                  key: "has_registry",
                  label: "Possui registro",
                  type: "boolean",
                },
                {
                  key: "has_contract",
                  label: "Possui contrato",
                  type: "boolean",
                },
                {
                  key: "part_of_larger_area",
                  label: "Parte de área maior",
                  type: "boolean",
                },
                {
                  key: "owner_relative",
                  label: "Proprietário é parente",
                  type: "boolean",
                },
                {
                  key: "larger_area_registry",
                  label: "Área maior registrada",
                  type: "boolean",
                },
                { key: "city_rural", label: "Imóvel rural", type: "boolean" },
              ].map((field) => (
                <View key={field.key} style={{ marginBottom: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {field.label}
                  </ThemedText>
                  {field.type === "boolean" ? (
                    <Switch
                      value={(createForm as any)[field.key]}
                      onValueChange={(value) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          [field.key]: value,
                        }))
                      }
                    />
                  ) : (
                    <TextInput
                      value={(createForm as any)[field.key]}
                      onChangeText={(text) => {
                        const nextValue =
                          field.key === "number"
                            ? text.replace(/\D/g, "")
                            : text;
                        setCreateForm((prev) => ({
                          ...prev,
                          [field.key]: nextValue,
                        }));
                      }}
                      style={{
                        backgroundColor: inputBackground,
                        color: inputTextColor,
                        borderRadius: 6,
                        padding: 8,
                        borderWidth: 1,
                        borderColor,
                        marginTop: 4,
                      }}
                      placeholder={field.label}
                      placeholderTextColor={placeholderColor}
                      keyboardType={
                        field.key === "number" ? "numeric" : "default"
                      }
                      editable={!createSubmitting}
                      autoCapitalize="none"
                    />
                  )}
                </View>
              ))}
            </ScrollView>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                marginTop: 12,
                justifyContent: "flex-end",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setCreateModalVisible(false);
                  resetCreateForm();
                }}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor: cardColor,
                }}
              >
                <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                  Cancelar
                </ThemedText>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleCreateProperty}
                disabled={createSubmitting}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 6,
                  backgroundColor: createSubmitting
                    ? mutedTextColor
                    : tintColor,
                }}
              >
                <ThemedText
                  style={{ color: onTintTextColor, fontWeight: "700" }}
                >
                  {createSubmitting ? "Salvando..." : "Salvar"}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
