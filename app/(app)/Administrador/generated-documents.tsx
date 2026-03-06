/**
 * Biblioteca de Documentos — View, preview, download, edit drafts, and manage generated documents.
 *
 * Route: /Administrador/generated-documents
 */
import { ThemedText } from "@/components/themed-text";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
    buildFullHtml,
    createDocumentFolder,
    deleteDocumentFolder,
    listDocumentFolders,
    deleteGeneratedDocument,
    getTemplate,
    listGeneratedDocuments,
    type DocumentFolder,
    updateGeneratedDocument,
    type DocumentTemplate,
    type GeneratedDocument,
} from "@/services/document-templates";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ── Status configuration ── */
const STATUS_MAP: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  draft: {
    label: "Rascunho",
    color: "#f59e0b",
    icon: "document-text-outline",
  },
  generated: {
    label: "Gerado",
    color: "#10b981",
    icon: "checkmark-circle-outline",
  },
  sent: { label: "Enviado", color: "#3b82f6", icon: "send-outline" },
  signed: { label: "Assinado", color: "#8b5cf6", icon: "ribbon-outline" },
};

type StatusFilter = "all" | "draft" | "generated" | "sent" | "signed";
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "draft", label: "Rascunhos" },
  { key: "generated", label: "Gerados" },
  { key: "sent", label: "Enviados" },
  { key: "signed", label: "Assinados" },
];

type FolderFilter = "all" | "none" | string;

export default function GeneratedDocumentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tenantId = user?.tenant_id;

  /* ── Theme ── */
  const tintColor = useThemeColor({}, "tint");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const cardBg = useThemeColor({}, "card");
  const borderColor = useThemeColor({}, "border");
  const bgColor = useThemeColor({}, "background");

  /* ── State ── */
  const [docs, setDocs] = useState<GeneratedDocument[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [folderFilter, setFolderFilter] = useState<FolderFilter>("all");
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);
  const [moveDoc, setMoveDoc] = useState<GeneratedDocument | null>(null);

  // Preview modal
  const [previewDoc, setPreviewDoc] = useState<GeneratedDocument | null>(null);
  const [previewHtml, setPreviewHtml] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Template cache for preview
  const templateCache = useRef<Record<string, DocumentTemplate>>({});

  /* ── Load documents ── */
  const loadDocs = useCallback(async () => {
    try {
      const [list, folderList] = await Promise.all([
        listGeneratedDocuments(tenantId),
        listDocumentFolders(tenantId),
      ]);
      setDocs(
        list.sort((a, b) => {
          const da = a.updated_at || a.created_at || "";
          const db = b.updated_at || b.created_at || "";
          return db.localeCompare(da);
        }),
      );
      setFolders(folderList);
    } catch {
      // ignore
    }
  }, [tenantId]);

  // Reload on screen focus (e.g. after editing a draft)
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadDocs().finally(() => setLoading(false));
    }, [loadDocs]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDocs();
    setRefreshing(false);
  }, [loadDocs]);

  const folderById = useMemo(() => {
    const map: Record<string, DocumentFolder> = {};
    for (const folder of folders) {
      map[folder.id] = folder;
    }
    return map;
  }, [folders]);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || !tenantId || !user?.id) return;
    try {
      setSavingFolder(true);
      await createDocumentFolder({
        tenant_id: tenantId,
        name,
        created_by: String(user.id),
      });
      setNewFolderName("");
      await loadDocs();
    } finally {
      setSavingFolder(false);
    }
  }, [loadDocs, newFolderName, tenantId, user?.id]);

  const removeFolder = useCallback(
    async (folder: DocumentFolder) => {
      const hasDocs = docs.some((d) => d.folder_id === folder.id);
      if (hasDocs) {
        Alert.alert(
          "Pasta em uso",
          "Mova os documentos desta pasta antes de excluir.",
        );
        return;
      }
      await deleteDocumentFolder(folder.id);
      if (folderFilter === folder.id) setFolderFilter("all");
      await loadDocs();
    },
    [docs, folderFilter, loadDocs],
  );

  const moveDocumentToFolder = useCallback(
    async (doc: GeneratedDocument, nextFolderId: string | null) => {
      await updateGeneratedDocument({ id: doc.id, folder_id: nextFolderId });
      setMoveDoc(null);
      await loadDocs();
    },
    [loadDocs],
  );

  /* ── Filtered & searched docs ── */
  const filtered = useMemo(() => {
    let list = docs;
    if (statusFilter !== "all") {
      list = list.filter((d) => d.status === statusFilter);
    }
    if (folderFilter === "none") {
      list = list.filter((d) => !d.folder_id);
    } else if (folderFilter !== "all") {
      list = list.filter((d) => d.folder_id === folderFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name?.toLowerCase().includes(q) ||
          d.status?.toLowerCase().includes(q) ||
          String(folderById[String(d.folder_id ?? "")]?.name ?? "")
            .toLowerCase()
            .includes(q),
      );
    }
    return list;
  }, [docs, statusFilter, folderFilter, search, folderById]);

  /* ── Status counts ── */
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length };
    for (const d of docs) {
      counts[d.status] = (counts[d.status] || 0) + 1;
    }
    return counts;
  }, [docs]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { all: docs.length, none: 0 };
    for (const d of docs) {
      if (!d.folder_id) {
        counts.none += 1;
      } else {
        counts[d.folder_id] = (counts[d.folder_id] || 0) + 1;
      }
    }
    return counts;
  }, [docs]);

  /* ── Preview handler ── */
  const handlePreview = async (doc: GeneratedDocument) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);

    try {
      if (
        doc.filled_html?.includes("<!DOCTYPE") ||
        doc.filled_html?.includes("<html")
      ) {
        setPreviewHtml(doc.filled_html);
      } else if (doc.filled_html && doc.template_id) {
        let tmpl = templateCache.current[doc.template_id];
        if (!tmpl) {
          tmpl = await getTemplate(doc.template_id);
          if (tmpl) templateCache.current[doc.template_id] = tmpl;
        }
        if (tmpl) {
          setPreviewHtml(buildFullHtml(tmpl, doc.filled_html));
        } else {
          setPreviewHtml(doc.filled_html);
        }
      } else {
        setPreviewHtml(doc.filled_html || "<p>Sem conteúdo</p>");
      }
    } catch {
      setPreviewHtml(doc.filled_html || "<p>Erro ao carregar preview</p>");
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ── Download handler ── */
  const handleDownload = async (doc: GeneratedDocument) => {
    if (Platform.OS === "web") {
      // Try PDF first
      if (doc.pdf_base64) {
        try {
          const link = document.createElement("a");
          link.href = `data:application/pdf;base64,${doc.pdf_base64}`;
          link.download = `${doc.name || "documento"}.pdf`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        } catch {
          // fallback
        }
      }
      if (doc.pdf_url) {
        window.open(doc.pdf_url, "_blank");
        return;
      }
      // Fallback: download HTML content
      if (doc.filled_html) {
        try {
          let html = doc.filled_html;
          if (
            !html.includes("<!DOCTYPE") &&
            !html.includes("<html") &&
            doc.template_id
          ) {
            let tmpl = templateCache.current[doc.template_id];
            if (!tmpl) {
              tmpl = await getTemplate(doc.template_id);
              if (tmpl) templateCache.current[doc.template_id] = tmpl;
            }
            if (tmpl) html = buildFullHtml(tmpl, html);
          }
          const blob = new Blob([html], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${doc.name || "documento"}.html`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          return;
        } catch {
          // ignore
        }
      }
      window.alert("Documento não disponível para download.");
    } else {
      if (doc.pdf_url) {
        Linking.openURL(doc.pdf_url);
      } else {
        Alert.alert("Aviso", "PDF não disponível para download.");
      }
    }
  };

  /* ── Delete handler ── */
  const handleDelete = (doc: GeneratedDocument) => {
    const doDelete = async () => {
      try {
        await deleteGeneratedDocument(doc.id);
        setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      } catch {
        if (Platform.OS === "web") {
          window.alert("Erro ao excluir documento.");
        } else {
          Alert.alert("Erro", "Não foi possível excluir o documento.");
        }
      }
    };

    if (Platform.OS === "web") {
      if (window.confirm(`Excluir "${doc.name}"?`)) {
        doDelete();
      }
    } else {
      Alert.alert("Excluir", `Excluir "${doc.name}"?`, [
        { text: "Cancelar", style: "cancel" },
        { text: "Excluir", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  /* ── Mark as sent ── */
  const handleMarkSent = async (doc: GeneratedDocument) => {
    try {
      await updateGeneratedDocument({ id: doc.id, status: "sent" });
      setDocs((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, status: "sent" as const } : d,
        ),
      );
    } catch {
      if (Platform.OS === "web") {
        window.alert("Erro ao atualizar status.");
      } else {
        Alert.alert("Erro", "Não foi possível atualizar o status.");
      }
    }
  };

  /* ── Format date ── */
  const formatDate = (date?: string) => {
    if (!date) return "";
    try {
      return new Date(date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return date;
    }
  };

  /* ── Relative time ── */
  const relativeTime = (date?: string) => {
    if (!date) return "";
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `há ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `há ${days}d`;
    return formatDate(date);
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: bgColor,
        }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bgColor }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tintColor}
        />
      }
    >
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 4,
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={textColor} />
        </TouchableOpacity>
        <ThemedText
          style={{
            fontSize: 22,
            fontWeight: "700",
            color: textColor,
            flex: 1,
          }}
        >
          Biblioteca de Documentos
        </ThemedText>
        <TouchableOpacity
          onPress={() =>
            router.push("/Administrador/document-generator" as never)
          }
          style={{
            backgroundColor: tintColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 7,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
          }}
        >
          <Ionicons name="add" size={16} color="white" />
          <ThemedText
            style={{ color: "white", fontWeight: "700", fontSize: 13 }}
          >
            Novo
          </ThemedText>
        </TouchableOpacity>
      </View>
      <ThemedText style={{ fontSize: 13, color: mutedColor, marginBottom: 14 }}>
        {docs.length} documento{docs.length !== 1 ? "s" : ""}
      </ThemedText>

      {/* ── Status filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ gap: 6 }}
      >
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          const count = statusCounts[f.key] || 0;
          const statusDef = f.key !== "all" ? STATUS_MAP[f.key] : null;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setStatusFilter(f.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: active
                  ? (statusDef?.color ?? tintColor) + "20"
                  : cardBg,
                borderWidth: 1,
                borderColor: active
                  ? (statusDef?.color ?? tintColor) + "60"
                  : borderColor,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: active ? "700" : "500",
                  color: active ? (statusDef?.color ?? tintColor) : mutedColor,
                }}
              >
                {f.label}
              </ThemedText>
              {count > 0 && (
                <View
                  style={{
                    backgroundColor: active
                      ? (statusDef?.color ?? tintColor) + "30"
                      : borderColor,
                    borderRadius: 10,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    minWidth: 18,
                    alignItems: "center",
                  }}
                >
                  <ThemedText
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: active
                        ? (statusDef?.color ?? tintColor)
                        : mutedColor,
                    }}
                  >
                    {count}
                  </ThemedText>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Folder filter tabs ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
        contentContainerStyle={{ gap: 6, alignItems: "center" }}
      >
        <TouchableOpacity
          onPress={() => setFolderFilter("all")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: folderFilter === "all" ? tintColor + "20" : cardBg,
            borderWidth: 1,
            borderColor: folderFilter === "all" ? tintColor + "60" : borderColor,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Ionicons
            name="folder-open-outline"
            size={12}
            color={folderFilter === "all" ? tintColor : mutedColor}
          />
          <ThemedText
            style={{
              fontSize: 12,
              fontWeight: folderFilter === "all" ? "700" : "500",
              color: folderFilter === "all" ? tintColor : mutedColor,
            }}
          >
            Todas ({folderCounts.all || 0})
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setFolderFilter("none")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: folderFilter === "none" ? "#f59e0b20" : cardBg,
            borderWidth: 1,
            borderColor: folderFilter === "none" ? "#f59e0b60" : borderColor,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <ThemedText
            style={{
              fontSize: 12,
              fontWeight: folderFilter === "none" ? "700" : "500",
              color: folderFilter === "none" ? "#f59e0b" : mutedColor,
            }}
          >
            Sem pasta ({folderCounts.none || 0})
          </ThemedText>
        </TouchableOpacity>

        {folders.map((folder) => {
          const active = folderFilter === folder.id;
          const count = folderCounts[folder.id] || 0;
          return (
            <TouchableOpacity
              key={folder.id}
              onPress={() => setFolderFilter(folder.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                backgroundColor: active ? tintColor + "20" : cardBg,
                borderWidth: 1,
                borderColor: active ? tintColor + "60" : borderColor,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Ionicons
                name="folder-outline"
                size={12}
                color={active ? tintColor : mutedColor}
              />
              <ThemedText
                style={{
                  fontSize: 12,
                  fontWeight: active ? "700" : "500",
                  color: active ? tintColor : mutedColor,
                }}
              >
                {folder.name} ({count})
              </ThemedText>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          onPress={() => setFolderModalOpen(true)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            backgroundColor: tintColor + "15",
            borderWidth: 1,
            borderColor: tintColor + "35",
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 6,
          }}
        >
          <Ionicons name="settings-outline" size={12} color={tintColor} />
          <ThemedText
            style={{ fontSize: 12, fontWeight: "700", color: tintColor }}
          >
            Pastas
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Search ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: cardBg,
          borderWidth: 1,
          borderColor,
          borderRadius: 10,
          paddingHorizontal: 10,
          marginBottom: 14,
          gap: 6,
        }}
      >
        <Ionicons name="search" size={16} color={mutedColor} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar documentos..."
          placeholderTextColor={mutedColor}
          style={{
            flex: 1,
            paddingVertical: 10,
            fontSize: 14,
            color: textColor,
          }}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={16} color={mutedColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Empty state ── */}
      {filtered.length === 0 && (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 40,
            gap: 12,
          }}
        >
          <Ionicons name="documents-outline" size={48} color={mutedColor} />
          <ThemedText
            style={{ fontSize: 15, fontWeight: "600", color: mutedColor }}
          >
            {search || statusFilter !== "all"
              ? "Nenhum documento encontrado"
              : "Nenhum documento gerado ainda"}
          </ThemedText>
          {!search && statusFilter === "all" && (
            <TouchableOpacity
              onPress={() =>
                router.push("/Administrador/document-generator" as never)
              }
              style={{
                backgroundColor: tintColor,
                borderRadius: 8,
                paddingHorizontal: 16,
                paddingVertical: 10,
                marginTop: 8,
              }}
            >
              <ThemedText
                style={{ color: "white", fontWeight: "700", fontSize: 14 }}
              >
                Gerar primeiro documento
              </ThemedText>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Document list ── */}
      {filtered.map((doc) => {
        const status = STATUS_MAP[doc.status] ?? STATUS_MAP.draft;
        const hasPdf = !!doc.pdf_base64 || !!doc.pdf_url;
        const hasContent = hasPdf || !!doc.filled_html;
        const isDraft = doc.status === "draft";
        const isGenerated = doc.status === "generated";

        return (
          <TouchableOpacity
            key={doc.id}
            onPress={() => handlePreview(doc)}
            activeOpacity={0.7}
            style={{
              backgroundColor: cardBg,
              borderWidth: 1,
              borderColor: isDraft ? "#f59e0b30" : borderColor,
              borderRadius: 12,
              padding: 14,
              marginBottom: 10,
            }}
          >
            {/* Row 1: Icon + Title + Status badge */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 6,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: status.color + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Ionicons
                  name={status.icon as any}
                  size={16}
                  color={status.color}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{
                    fontSize: 14,
                    fontWeight: "700",
                    color: textColor,
                  }}
                  numberOfLines={1}
                >
                  {doc.name}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 11, color: mutedColor, marginTop: 1 }}
                >
                  {relativeTime(doc.updated_at || doc.created_at)}
                  {doc.created_at !== doc.updated_at && doc.updated_at
                    ? " · editado"
                    : ""}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 10, color: mutedColor, marginTop: 2 }}
                >
                  {doc.folder_id
                    ? `Pasta: ${folderById[doc.folder_id]?.name ?? "—"}`
                    : "Sem pasta"}
                </ThemedText>
              </View>
              <View
                style={{
                  backgroundColor: status.color + "20",
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                }}
              >
                <ThemedText
                  style={{
                    fontSize: 10,
                    fontWeight: "700",
                    color: status.color,
                  }}
                >
                  {status.label}
                </ThemedText>
              </View>
            </View>

            {/* Row 2: Action buttons */}
            <View
              style={{
                flexDirection: "row",
                gap: 6,
                marginTop: 4,
              }}
            >
              {/* Preview */}
              <TouchableOpacity
                onPress={() => handlePreview(doc)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  backgroundColor: bgColor,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 7,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                }}
              >
                <Ionicons name="eye-outline" size={13} color={mutedColor} />
                <ThemedText
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: mutedColor,
                  }}
                >
                  Preview
                </ThemedText>
              </TouchableOpacity>

              {/* Download */}
              {hasContent && !isDraft && (
                <TouchableOpacity
                  onPress={() => handleDownload(doc)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    backgroundColor: "#3b82f610",
                    borderWidth: 1,
                    borderColor: "#3b82f630",
                    borderRadius: 7,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Ionicons name="download-outline" size={13} color="#3b82f6" />
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: "#3b82f6",
                    }}
                  >
                    {hasPdf ? "PDF" : "Baixar"}
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Edit draft */}
              {isDraft && (
                <TouchableOpacity
                  onPress={() =>
                    router.push({
                      pathname: "/Administrador/document-generator" as never,
                      params: {
                        draftId: doc.id,
                        templateId: doc.template_id,
                      },
                    } as never)
                  }
                  style={{
                    flex: 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    backgroundColor: tintColor + "12",
                    borderWidth: 1,
                    borderColor: tintColor + "30",
                    borderRadius: 7,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Ionicons name="create-outline" size={13} color={tintColor} />
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: tintColor,
                    }}
                  >
                    Continuar Editando
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Mark as sent — indicates document was delivered to client/recipient */}
              {isGenerated && (
                <TouchableOpacity
                  onPress={() => {
                    const doMark = () => handleMarkSent(doc);
                    if (Platform.OS === "web") {
                      if (
                        window.confirm(
                          "Marcar este documento como entregue ao destinatário?\n\nIsso indica que o documento já foi enviado por e-mail, WhatsApp ou outro meio.",
                        )
                      ) {
                        doMark();
                      }
                    } else {
                      Alert.alert(
                        "Confirmar envio",
                        "Marcar este documento como entregue ao destinatário?\n\nIsso indica que o documento já foi enviado por e-mail, WhatsApp ou outro meio.",
                        [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Confirmar", onPress: doMark },
                        ],
                      );
                    }
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    backgroundColor: "#3b82f610",
                    borderWidth: 1,
                    borderColor: "#3b82f630",
                    borderRadius: 7,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                  }}
                >
                  <Ionicons name="send-outline" size={13} color="#3b82f6" />
                  <ThemedText
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: "#3b82f6",
                    }}
                  >
                    Já Enviei
                  </ThemedText>
                </TouchableOpacity>
              )}

              {/* Move to folder */}
              <TouchableOpacity
                onPress={() => setMoveDoc(doc)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  backgroundColor: "#64748b10",
                  borderWidth: 1,
                  borderColor: "#64748b30",
                  borderRadius: 7,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                }}
              >
                <Ionicons name="folder-open-outline" size={13} color="#94a3b8" />
                <ThemedText
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: "#94a3b8",
                  }}
                >
                  Mover
                </ThemedText>
              </TouchableOpacity>

              {/* Spacer to push delete right */}
              <View style={{ flex: isDraft ? 0 : 1 }} />

              {/* Delete */}
              <TouchableOpacity
                onPress={() => handleDelete(doc)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "#ef444410",
                  borderRadius: 7,
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                }}
              >
                <Ionicons name="trash-outline" size={13} color="#ef4444" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  FOLDER MANAGEMENT MODAL                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        visible={folderModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFolderModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              padding: 14,
              gap: 10,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <ThemedText style={{ fontSize: 16, fontWeight: "700" }}>
                Pastas
              </ThemedText>
              <TouchableOpacity onPress={() => setFolderModalOpen(false)}>
                <Ionicons name="close" size={22} color={mutedColor} />
              </TouchableOpacity>
            </View>

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <TextInput
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="Nome da nova pasta"
                placeholderTextColor={mutedColor}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  color: textColor,
                  backgroundColor: bgColor,
                }}
              />
              <TouchableOpacity
                disabled={savingFolder || !newFolderName.trim()}
                onPress={createFolder}
                style={{
                  backgroundColor:
                    savingFolder || !newFolderName.trim()
                      ? "#64748b66"
                      : tintColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                }}
              >
                <ThemedText style={{ color: "white", fontWeight: "700" }}>
                  Criar
                </ThemedText>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 300 }}>
              {folders.length === 0 ? (
                <ThemedText style={{ color: mutedColor, fontSize: 13 }}>
                  Nenhuma pasta criada.
                </ThemedText>
              ) : (
                folders.map((folder) => (
                  <View
                    key={folder.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: borderColor,
                    }}
                  >
                    <Ionicons name="folder-outline" size={16} color={tintColor} />
                    <ThemedText style={{ flex: 1, fontSize: 13 }}>
                      {folder.name}
                    </ThemedText>
                    <ThemedText style={{ color: mutedColor, fontSize: 11 }}>
                      {folderCounts[folder.id] || 0}
                    </ThemedText>
                    <TouchableOpacity
                      onPress={() => {
                        const exec = () => removeFolder(folder);
                        if (Platform.OS === "web") {
                          if (
                            window.confirm(
                              `Excluir a pasta "${folder.name}"?`,
                            )
                          ) {
                            exec();
                          }
                        } else {
                          Alert.alert(
                            "Excluir pasta",
                            `Excluir a pasta "${folder.name}"?`,
                            [
                              { text: "Cancelar", style: "cancel" },
                              {
                                text: "Excluir",
                                style: "destructive",
                                onPress: exec,
                              },
                            ],
                          );
                        }
                      }}
                      style={{
                        backgroundColor: "#ef444410",
                        borderRadius: 7,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                      }}
                    >
                      <Ionicons name="trash-outline" size={13} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  MOVE DOCUMENT MODAL                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!moveDoc}
        transparent
        animationType="fade"
        onRequestClose={() => setMoveDoc(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 14,
              borderWidth: 1,
              borderColor,
              padding: 14,
              gap: 10,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <ThemedText style={{ fontSize: 16, fontWeight: "700", flex: 1 }}>
                Mover documento
              </ThemedText>
              <TouchableOpacity onPress={() => setMoveDoc(null)}>
                <Ionicons name="close" size={22} color={mutedColor} />
              </TouchableOpacity>
            </View>
            <ThemedText style={{ fontSize: 12, color: mutedColor }}>
              {moveDoc?.name}
            </ThemedText>

            <ScrollView style={{ maxHeight: 320 }}>
              <TouchableOpacity
                onPress={() =>
                  moveDoc ? moveDocumentToFolder(moveDoc, null) : undefined
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 9,
                }}
              >
                <Ionicons name="remove-circle-outline" size={16} color="#f59e0b" />
                <ThemedText style={{ fontSize: 13 }}>Sem pasta</ThemedText>
              </TouchableOpacity>
              {folders.map((folder) => (
                <TouchableOpacity
                  key={folder.id}
                  onPress={() =>
                    moveDoc ? moveDocumentToFolder(moveDoc, folder.id) : undefined
                  }
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingVertical: 9,
                  }}
                >
                  <Ionicons name="folder-outline" size={16} color={tintColor} />
                  <ThemedText style={{ fontSize: 13 }}>{folder.name}</ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/*  PREVIEW MODAL                                             */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <Modal
        visible={!!previewDoc}
        transparent
        animationType="slide"
        onRequestClose={() => setPreviewDoc(null)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.4)",
          }}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "90%",
              flex: 1,
            }}
          >
            {/* Modal header */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText
                  style={{ fontSize: 16, fontWeight: "700", color: textColor }}
                  numberOfLines={1}
                >
                  {previewDoc?.name}
                </ThemedText>
                <ThemedText
                  style={{ fontSize: 11, color: mutedColor, marginTop: 2 }}
                >
                  {previewDoc
                    ? formatDate(previewDoc.updated_at || previewDoc.created_at)
                    : ""}
                  {previewDoc
                    ? ` · ${(STATUS_MAP[previewDoc.status] ?? STATUS_MAP.draft).label}`
                    : ""}
                </ThemedText>
              </View>
              <TouchableOpacity onPress={() => setPreviewDoc(null)}>
                <Ionicons name="close" size={24} color={mutedColor} />
              </TouchableOpacity>
            </View>

            {/* Modal body - HTML preview */}
            {previewLoading ? (
              <View
                style={{
                  flex: 1,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <ActivityIndicator size="large" color={tintColor} />
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }}>
                {Platform.OS === "web" ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      padding: 16,
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: textColor,
                        fontSize: 13,
                        lineHeight: 20,
                      }}
                    >
                      {(previewHtml || "")
                        .replace(/<[^>]*>/g, " ")
                        .replace(/&nbsp;/g, " ")
                        .replace(/\s+/g, " ")
                        .trim() || "Sem conteúdo"}
                    </ThemedText>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Modal footer actions */}
            {previewDoc && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: borderColor,
                }}
              >
                {previewDoc.status === "draft" && (
                  <TouchableOpacity
                    onPress={() => {
                      setPreviewDoc(null);
                      router.push({
                        pathname: "/Administrador/document-generator" as never,
                        params: {
                          draftId: previewDoc.id,
                          templateId: previewDoc.template_id,
                        },
                      } as never);
                    }}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      backgroundColor: tintColor,
                      borderRadius: 8,
                      paddingVertical: 10,
                    }}
                  >
                    <Ionicons name="create-outline" size={15} color="white" />
                    <ThemedText
                      style={{
                        fontSize: 13,
                        fontWeight: "700",
                        color: "white",
                      }}
                    >
                      Continuar Editando
                    </ThemedText>
                  </TouchableOpacity>
                )}
                {(!!previewDoc.pdf_base64 ||
                  !!previewDoc.pdf_url ||
                  !!previewDoc.filled_html) &&
                  previewDoc.status !== "draft" && (
                    <TouchableOpacity
                      onPress={() => handleDownload(previewDoc)}
                      style={{
                        flex: 1,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 5,
                        backgroundColor: "#3b82f6",
                        borderRadius: 8,
                        paddingVertical: 10,
                      }}
                    >
                      <Ionicons
                        name="download-outline"
                        size={15}
                        color="white"
                      />
                      <ThemedText
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "white",
                        }}
                      >
                        {previewDoc.pdf_base64 || previewDoc.pdf_url
                          ? "Download PDF"
                          : "Baixar HTML"}
                      </ThemedText>
                    </TouchableOpacity>
                  )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
