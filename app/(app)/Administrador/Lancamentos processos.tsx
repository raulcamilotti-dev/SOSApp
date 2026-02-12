import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import * as DocumentPicker from "expo-document-picker";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    Switch,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { styles } from "../../theme/styles";

interface Property {
  id: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  cpf?: string | null;
  user_id?: string | null;
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
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isClientVisible, setIsClientVisible] = useState(true);
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [clientFilter, setClientFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [clientNameByKey, setClientNameByKey] = useState<
    Record<string, string>
  >({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [documentRequests, setDocumentRequests] = useState<
    DocumentRequestItem[]
  >([]);
  const [newDocumentType, setNewDocumentType] = useState("");
  const [newDocumentDescription, setNewDocumentDescription] = useState("");

  const tintColor = useThemeColor({}, "tint");
  const mutedTextColor = useThemeColor({}, "muted");
  const primaryTextColor = useThemeColor({}, "text");
  const placeholderColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const borderTopColor = useThemeColor({}, "border");
  const inputBackground = useThemeColor({}, "input");
  const onTintTextColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");

  const normalize = (value?: string | null) =>
    (value ?? "").toString().toLowerCase();

  const resolveClientKey = (property: Property) => {
    return (
      property.cpf ||
      property.user_id ||
      property.user?.id ||
      property.client?.user_id ||
      property.client?.id ||
      property.customer?.user_id ||
      property.customer?.id ||
      ""
    );
  };

  const resolveClientName = (property: Property) => {
    const key = resolveClientKey(property);
    const apiName = key ? clientNameByKey[key] : "";
    return (
      apiName ||
      property.client_name ||
      property.customer_name ||
      property.fullname ||
      property.name ||
      property.owner_name ||
      property.client?.name ||
      property.customer?.name ||
      ""
    );
  };

  const matchesFilter = (property: Property) => {
    const clientValue = normalize(clientFilter);
    const propertyValue = normalize(propertyFilter);

    const clientFields = [
      resolveClientName(property),
      property.cpf,
      property.email,
    ]
      .map((field) => normalize(field))
      .join(" ");

    const propertyFieldsText = [
      property.address,
      property.number,
      property.city,
      property.state,
      property.postal_code,
    ]
      .map((field) => normalize(field))
      .join(" ");

    const clientOk = clientValue ? clientFields.includes(clientValue) : true;
    const propertyOk = propertyValue
      ? propertyFieldsText.includes(propertyValue)
      : true;
    return clientOk && propertyOk;
  };

  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_list_allclients",
      );
      const list = Array.isArray(response.data) ? response.data : [];
      setProperties(list);

      setClientNameByKey({});
    } catch {
      Alert.alert("Erro", "Falha ao carregar imóveis");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

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

  const handleSubmit = async () => {
    setSuccessMessage(null);
    if (!selectedPropertyId) {
      Alert.alert("Atenção", "Selecione um imóvel");
      return;
    }

    if (!title.trim()) {
      Alert.alert("Atenção", "Informe o título da atualização");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("property_id", selectedPropertyId);
      if (user?.id) formData.append("user_id", user.id);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      formData.append("is_client_visible", String(isClientVisible));

      for (const file of files) {
        if (Platform.OS === "web") {
          const fileResponse = await fetch(file.uri);
          const blob = await fileResponse.blob();
          const webFile = new File([blob], file.name, {
            type: file.mimeType ?? blob.type ?? "application/octet-stream",
          });
          formData.append("files", webFile);
          formData.append("file_name", file.name);
          formData.append("file_description", description);
        } else {
          formData.append("files", {
            uri: file.uri,
            name: file.name,
            type: file.mimeType ?? "application/octet-stream",
          } as any);
          formData.append("file_name", file.name);
          formData.append("file_description", description);
        }
      }

      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_process_update_create_advogado",
        formData,
      );

      const processUpdateId = response.data?.id || response.data?.data?.id;

      // Create document requests if any
      if (isClientVisible && documentRequests.length > 0 && processUpdateId) {
        for (const docRequest of documentRequests) {
          try {
            await createDocumentRequest({
              property_process_update_id: processUpdateId,
              document_type: docRequest.type,
              description: docRequest.description || undefined,
            });
          } catch (error) {
            console.error("Erro ao criar solicitação de documento:", error);
          }
        }
      }

      setTitle("");
      setDescription("");
      setIsClientVisible(true);
      setFiles([]);
      setDocumentRequests([]);
      setNewDocumentType("");
      setNewDocumentDescription("");
      setSuccessMessage("Atualização publicada com sucesso.");
    } catch {
      Alert.alert("Erro", "Falha ao publicar atualização");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Lançar atualização (Advogado)
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Publique atualizações para seus clientes.
        </ThemedText>
      </ThemedView>

      <ThemedView style={[styles.processCard, { marginTop: 16 }]}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Dados da atualização
        </ThemedText>

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
          <TouchableOpacity onPress={handlePickFile} style={{ marginTop: 8 }}>
            <ThemedText style={{ color: tintColor, fontWeight: "600" }}>
              Adicionar arquivo
            </ThemedText>
          </TouchableOpacity>

          {files.length > 0 ? (
            <View style={{ marginTop: 8, gap: 6 }}>
              {files.map((file) => (
                <View
                  key={file.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    {file.name}
                  </ThemedText>
                  <TouchableOpacity onPress={() => removeFile(file.id)}>
                    <ThemedText style={{ color: tintColor, fontSize: 12 }}>
                      Remover
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              ))}
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
          Pesquisar imóveis
        </ThemedText>

        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Filtrar por cliente
          </ThemedText>
          <TextInput
            value={clientFilter}
            onChangeText={setClientFilter}
            placeholder="Ex.: Maria"
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
            Filtrar por imóvel
          </ThemedText>
          <TextInput
            value={propertyFilter}
            onChangeText={setPropertyFilter}
            placeholder="Ex.: Rua A, SP"
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

      {!loading && properties.length === 0 ? (
        <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
          Nenhum imóvel encontrado.
        </ThemedText>
      ) : null}

      {!loading && properties.length > 0 ? (
        <View style={{ gap: 12 }}>
          {properties.filter(matchesFilter).map((property) => (
            <TouchableOpacity
              key={property.id}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 10,
                padding: 12,
                backgroundColor: cardColor,
              }}
              onPress={() => setSelectedPropertyId(property.id)}
            >
              <ThemedText
                style={{ fontWeight: "600", color: primaryTextColor }}
              >
                {resolveClientName(property) || "Cliente"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                {property.address || "Endereço não informado"}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                {property.city || ""} {property.state || ""}
              </ThemedText>
              {property.id === selectedPropertyId ? (
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
    </ScrollView>
  );
}
