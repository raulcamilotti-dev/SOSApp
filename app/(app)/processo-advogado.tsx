import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useEffect, useState } from "react";
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
import { styles } from "../theme/styles";

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

  const tintColor = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
  const mutedTextColor = useThemeColor(
    { light: "#374151", dark: "#374151" },
    "text",
  );
  const primaryTextColor = useThemeColor(
    { light: "#0b0b0b", dark: "#0b0b0b" },
    "text",
  );
  const placeholderColor = "#6b7280";
  const borderColor = useThemeColor({ light: "#e0e0e0", dark: "#333" }, "text");

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

  const hasSearch =
    clientFilter.trim().length > 0 || propertyFilter.trim().length > 0;
  const fetchProperties = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_list_allclients",
      );
      const list = Array.isArray(response.data) ? response.data : [];
      setProperties(list);

      const clientKeys = Array.from(
        new Set(
          list
            .map(
              (item: Property) =>
                item.cpf ||
                item.user_id ||
                item.user?.id ||
                item.client?.user_id ||
                item.client?.id ||
                item.customer?.user_id ||
                item.customer?.id,
            )
            .filter((id: string | null | undefined): id is string => !!id),
        ),
      );

      if (clientKeys.length > 0) {
        const results = await Promise.all(
          clientKeys.map(async (key) => {
            try {
              const clientResponse = await api.post(
                "https://n8n.sosescritura.com.br/webhook/client_info",
                { cpf: key },
              );
              const data = clientResponse.data;
              const payload = Array.isArray(data) ? data[0] : data;
              const name =
                payload?.fullname ||
                payload?.name ||
                payload?.client_name ||
                payload?.customer_name ||
                "";
              return { key, name };
            } catch {
              return { key, name: "" };
            }
          }),
        );

        setClientNameByKey((prev) => {
          const next = { ...prev };
          results.forEach(({ key, name }) => {
            if (name) next[key] = name;
          });
          return next;
        });
      }
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
        } else {
          formData.append("files", {
            uri: file.uri,
            name: file.name,
            type: file.mimeType ?? "application/octet-stream",
          } as any);
        }
      }

      await api.post(
        "https://n8n.sosescritura.com.br/webhook/property_process_update_create_advogado",
        formData,
      );

      setTitle("");
      setDescription("");
      setIsClientVisible(true);
      setFiles([]);
      setSuccessMessage("Atualização publicada com sucesso.");
    } catch {
      Alert.alert("Erro", "Falha ao publicar atualização");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedProperty = properties.find(
    (property) => property.id === selectedPropertyId,
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Publicar atualização
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Selecione o imóvel e descreva a atualização do processo.
        </ThemedText>
        <View style={{ marginTop: 12 }}>
          <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
            Imóvel selecionado
          </ThemedText>
          <ThemedText
            style={{ fontSize: 13, fontWeight: "700", color: primaryTextColor }}
          >
            {selectedProperty
              ? `${selectedProperty.address || "Imóvel"} · ${
                  resolveClientName(selectedProperty) || "Cliente não informado"
                }`
              : "Nenhum imóvel selecionado"}
          </ThemedText>
        </View>
      </ThemedView>

      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Detalhes
        </ThemedText>

        <View style={{ gap: 12, marginTop: 12 }}>
          <View>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Título
            </ThemedText>
            <TextInput
              value={title}
              onChangeText={(value) => {
                setSuccessMessage(null);
                setTitle(value);
              }}
              placeholder="Ex.: Documento protocolado"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: "#ffffff",
                color: primaryTextColor,
              }}
            />
          </View>

          <View>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Descrição
            </ThemedText>
            <TextInput
              value={description}
              onChangeText={(value) => {
                setSuccessMessage(null);
                setDescription(value);
              }}
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
                backgroundColor: "#ffffff",
                color: primaryTextColor,
                textAlignVertical: "top",
              }}
            />
          </View>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
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
        </View>
      </ThemedView>

      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Arquivos
        </ThemedText>
        {files.length === 0 ? (
          <ThemedText style={{ color: mutedTextColor, marginTop: 8 }}>
            Nenhum arquivo anexado.
          </ThemedText>
        ) : (
          <View style={{ gap: 8, marginTop: 12 }}>
            {files.map((file) => (
              <View
                key={file.id}
                style={{
                  padding: 10,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  backgroundColor: "#ffffff",
                }}
              >
                <ThemedText
                  style={{ fontWeight: "600", color: primaryTextColor }}
                >
                  {file.name}
                </ThemedText>
                <TouchableOpacity
                  onPress={() => removeFile(file.id)}
                  style={{ marginTop: 6 }}
                >
                  <ThemedText style={{ color: "#d11a2a", fontWeight: "600" }}>
                    Remover
                  </ThemedText>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={handlePickFile}
          style={{
            marginTop: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 6,
            backgroundColor: tintColor,
            alignItems: "center",
          }}
        >
          <ThemedText style={{ color: "#333333", fontWeight: "600" }}>
            + Adicionar arquivo
          </ThemedText>
        </TouchableOpacity>
      </ThemedView>

      <TouchableOpacity
        onPress={handleSubmit}
        disabled={submitting || !!successMessage || !selectedPropertyId}
        style={{
          paddingVertical: 12,
          borderRadius: 8,
          backgroundColor: tintColor,
          alignItems: "center",
          opacity:
            submitting || successMessage || !selectedPropertyId ? 0.7 : 1,
          marginBottom: 24,
        }}
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#333333" />
        ) : (
          <ThemedText style={{ color: "#333333", fontWeight: "700" }}>
            Publicar atualização
          </ThemedText>
        )}
      </TouchableOpacity>

      {successMessage ? (
        <ThemedView
          style={{
            marginBottom: 24,
            padding: 12,
            borderRadius: 8,
            backgroundColor: "#dcfce7",
            borderWidth: 1,
            borderColor: "#86efac",
          }}
        >
          <ThemedText style={{ color: "#166534", fontWeight: "600" }}>
            {successMessage}
          </ThemedText>
        </ThemedView>
      ) : null}

      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: primaryTextColor }]}>
          Pesquisar imóveis
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Faça a pesquisa para localizar o cliente e o imóvel.
        </ThemedText>

        <View style={{ gap: 8, marginTop: 12 }}>
          <View>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Filtrar por cliente (nome, CPF ou e-mail)
            </ThemedText>
            <TextInput
              value={clientFilter}
              onChangeText={setClientFilter}
              placeholder="Ex.: João ou 077.000.000-00"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: "#ffffff",
                color: primaryTextColor,
                marginTop: 6,
              }}
            />
          </View>

          <View>
            <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
              Filtrar por imóvel (endereço, cidade)
            </ThemedText>
            <TextInput
              value={propertyFilter}
              onChangeText={setPropertyFilter}
              placeholder="Ex.: Rua das Palmeiras"
              placeholderTextColor={placeholderColor}
              style={{
                borderWidth: 1,
                borderColor,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: "#ffffff",
                color: primaryTextColor,
                marginTop: 6,
              }}
            />
          </View>
        </View>

        {loading ? (
          <View style={{ paddingVertical: 16, alignItems: "center" }}>
            <ActivityIndicator size="large" />
          </View>
        ) : !hasSearch ? (
          <ThemedText style={{ color: mutedTextColor, marginTop: 12 }}>
            Digite um termo de pesquisa para listar os imóveis.
          </ThemedText>
        ) : (
          <View style={{ gap: 8, marginTop: 12 }}>
            {properties.filter(matchesFilter).map((property) => (
              <TouchableOpacity
                key={property.id}
                onPress={() => {
                  setSuccessMessage(null);
                  setSelectedPropertyId(property.id);
                }}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor,
                  backgroundColor:
                    selectedPropertyId === property.id ? "#e0f2fe" : "#ffffff",
                }}
              >
                <ThemedText
                  style={{
                    fontWeight: "700",
                    fontSize: 13,
                    color: primaryTextColor,
                  }}
                >
                  {property.address || "Imóvel"}
                </ThemedText>
                <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
                  {resolveClientName(property) || "Cliente não informado"}
                </ThemedText>
                <ThemedText style={{ color: mutedTextColor, fontSize: 12 }}>
                  {property.city || ""} {property.state || ""}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ThemedView>
    </ScrollView>
  );
}
