import { styles } from "@/app/theme/styles";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useThemeColor } from "@/hooks/use-theme-color";
import { getTableInfo, listTables, type TableInfoRow } from "@/services/schema";
// rom "@/services/schema";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const humanize = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export default function TablesScreen() {
  // Busca as tabelas ao montar o componente
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const tablesList = await listTables();
        setTables(tablesList);
        setError("");
      } catch {
        setError("Erro ao carregar tabelas.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const isAutoColumn = (col: TableInfoRow) => {
    const def = String(col.column_default ?? "").toLowerCase();
    return (
      def.includes("gen_random_uuid") ||
      def.includes("uuid_generate_v4") ||
      def.includes("nextval(") ||
      def.includes("now()") ||
      def.includes("current_timestamp") ||
      col.is_identity === "YES" ||
      (col.is_generated && col.is_generated !== "NEVER")
    );
  };
  const inferReferencedTable = (col: TableInfoRow) => {
    if (col.referenced_table_name) return col.referenced_table_name;
    if (col.data_type === "uuid" && col.column_name.endsWith("_id")) {
      return col.column_name.replace(/_id$/i, "");
    }
    return null;
  };
  const isSystemColumnName = (name: string) =>
    ["created_at", "updated_at", "deleted_at"].includes(name.toLowerCase());
  const inferFieldType = (col: TableInfoRow) => {
    const dataType = String(col.data_type ?? "").toLowerCase();
    if (dataType.includes("json")) return "json";
    if (dataType.includes("text")) return "multiline";
    return undefined;
  };

  // State and hooks
  const [error, setError] = useState("");
  const [tables, setTables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [builderTableName, setBuilderTableName] = useState("");
  const [builderScreenName, setBuilderScreenName] = useState("");
  const [builderRoute, setBuilderRoute] = useState("");
  const [builderAppGroup, setBuilderAppGroup] = useState<
    "Administrador" | "Servicos"
  >("Administrador");
  // const [builderAutoName, setBuilderAutoName] = useState(""); // não usado
  const [search, setSearch] = useState("");
  const [columns, setColumns] = useState<TableInfoRow[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [execLoading] = useState(false);
  const [execError] = useState<string | null>(null);
  const [execResult] = useState<any[] | null>(null);
  const [builderUseCrud, setBuilderUseCrud] = useState(true);
  const [builderPayloadMode, setBuilderPayloadMode] = useState<
    "payload" | "data"
  >("payload");
  const [builderIncludeTable, setBuilderIncludeTable] = useState(true);
  const [builderReferenceLabels, setBuilderReferenceLabels] = useState<
    Record<string, string>
  >({});
  const [referenceTableColumns, setReferenceTableColumns] = useState<
    Record<string, TableInfoRow[]>
  >({});
  const [builderCopyStatus, setBuilderCopyStatus] = useState("");
  const [builderRouteStatus, setBuilderRouteStatus] = useState("");
  // Theme color variables
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const cardColor = useThemeColor({}, "card");
  const inputBackground = useThemeColor({}, "input");
  const tintColor = useThemeColor({}, "tint");
  // const backgroundColor = useThemeColor({}, "background"); // não usado

  useEffect(() => {
    if (!selectedTable) return;
    setBuilderRoute(`/${builderAppGroup}/${selectedTable}`);
  }, [builderAppGroup, selectedTable]);

  // onRefresh already declared above, remove this duplicate.

  const uniqueColumns = useMemo(() => {
    return columns.filter(
      (col, idx, arr) =>
        arr.findIndex((c) => c.column_name === col.column_name) === idx,
    );
  }, [columns]);

  const referenceColumns = useMemo(
    () => uniqueColumns.filter((col) => inferReferencedTable(col)),
    [uniqueColumns],
  );

  useEffect(() => {
    if (uniqueColumns.length === 0) return;
    setBuilderReferenceLabels((prev) => {
      const next = { ...prev };
      let changed = false;
      uniqueColumns.forEach((col) => {
        if (inferReferencedTable(col) && !next[col.column_name]) {
          next[col.column_name] = "name";
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [uniqueColumns]);

  useEffect(() => {
    const refs = referenceColumns
      .map((col) => inferReferencedTable(col))
      .filter((ref): ref is string => !!ref);
    const uniqueRefs = Array.from(new Set(refs));
    const missing = uniqueRefs.filter((ref) => !referenceTableColumns[ref]);
    if (missing.length === 0) return;

    let active = true;
    (async () => {
      const results = await Promise.all(
        missing.map(async (refTable) => {
          try {
            const info = await getTableInfo(refTable);
            return { refTable, info };
          } catch {
            return { refTable, info: [] as TableInfoRow[] };
          }
        }),
      );
      if (!active) return;
      setReferenceTableColumns((prev) => {
        const next = { ...prev };
        results.forEach((res) => {
          next[res.refTable] = res.info;
        });
        return next;
      });
    })();

    return () => {
      active = false;
    };
  }, [referenceColumns, referenceTableColumns]);

  const builderTemplate = useMemo(() => {
    const tableName = builderTableName || selectedTable || "sua_tabela";
    const screenName = builderScreenName || tableName;
    const title = humanize(tableName);
    const route = builderRoute || `/${builderAppGroup}/${screenName}`;
    const payloadKey = builderPayloadMode === "payload" ? "payload" : "data";
    const tableLine = builderIncludeTable ? `, table: "${tableName}"` : "";
    const filePath = `app/(app)/${builderAppGroup}/${screenName}.tsx`;
    const idField =
      uniqueColumns.find((col) => col.column_name === "id")?.column_name ??
      uniqueColumns[0]?.column_name ??
      "id";
    const titleField =
      uniqueColumns.find((col) => col.column_name !== idField)?.column_name ??
      idField;
    const fieldLines = uniqueColumns.length
      ? uniqueColumns
          .map((col, index) => {
            const label = humanize(col.column_name);
            const referencedTable = inferReferencedTable(col);
            const fieldType = referencedTable
              ? "reference"
              : inferFieldType(col);
            const hideInForm =
              isAutoColumn(col) || isSystemColumnName(col.column_name);
            const required = col.is_nullable === "NO" && !hideInForm;
            const visibleInList = !hideInForm && index < 5;
            const entries = [
              `key: "${col.column_name}"`,
              `label: "${label}"`,
              `placeholder: "${label}"`,
            ];
            if (fieldType) entries.push(`type: "${fieldType}"`);
            if (referencedTable) {
              const labelField =
                builderReferenceLabels[col.column_name] || "name";
              entries.push(`referenceTable: "${referencedTable}"`);
              entries.push(`referenceLabelField: "${labelField}"`);
              entries.push(`referenceSearchField: "${labelField}"`);
              entries.push('referenceIdField: "id"');
            }
            if (required) entries.push("required: true");
            if (visibleInList) entries.push("visibleInList: true");
            if (hideInForm) entries.push("visibleInForm: false");
            return `  {\n    ${entries.join(",\n    ")}\n  },`;
          })
          .join("\n")
      : "  // Defina campos aqui";
    if (!builderUseCrud) {
      return `// Rota sugerida: ${route}\n// Tela: app/(app)/Administrador/${screenName}.tsx\n// TODO: implementar sua tela manualmente.`;
    }
    return `import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";\nimport { api } from "@/services/api";\n\ntype Row = Record<string, unknown>;\n\nconst ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";\n\nconst listRows = async (): Promise<Row[]> => {\n  const response = await api.post(ENDPOINT, { action: "list"${tableLine} });\n  const data = response.data;\n  const list = Array.isArray(data) ? data : (data?.data ?? []);\n  return Array.isArray(list) ? (list as Row[]) : [];\n};\n\nconst createRow = async (payload: Partial<Row>): Promise<unknown> => {\n  const response = await api.post(ENDPOINT, { action: "create"${tableLine}, ${payloadKey}: payload });\n  return response.data;\n};\n\nconst updateRow = async (payload: Partial<Row> & { id?: string | null }): Promise<unknown> => {\n  if (!payload.id) {\n    throw new Error("Id obrigatorio para atualizar");\n  }\n  const response = await api.post(ENDPOINT, { action: "update"${tableLine}, ${payloadKey}: payload });\n  return response.data;\n};\n\nexport default function ${humanize(screenName).replace(/\s+/g, "")}Screen() {\n  const fields: CrudFieldConfig<Row>[] = [\n${fieldLines}\n  ];\n\n  return (\n    <CrudScreen<Row>\n      title="${title}"\n      subtitle="Gestao de ${title.toLowerCase()}"\n      fields={fields}\n      loadItems={listRows}\n      createItem={createRow}\n      updateItem={updateRow}\n      getId={(item) => String(item.${idField} ?? "") }\n      getTitle={(item) => String(item.${titleField} ?? "${title}") }\n    />\n  );\n}\n\n// Rota sugerida: ${route}\n// Tela: ${filePath}\n// Ajuste o payload conforme o webhook do n8n.`;
  }, [
    builderRoute,
    builderScreenName,
    builderTableName,
    builderUseCrud,
    builderPayloadMode,
    builderIncludeTable,
    builderAppGroup,
    builderReferenceLabels,
    uniqueColumns,
    selectedTable,
  ]);

  const builderAdminEntry = useMemo(() => {
    if (builderAppGroup !== "Administrador") {
      return "";
    }
    const screenName = builderScreenName || selectedTable || "nova-tela";
    const title = humanize(builderTableName || selectedTable || screenName);
    const route = builderRoute || `/${builderAppGroup}/${screenName}`;
    return `{
    id: "${screenName}",
    title: "${title}",
    description: "Gestão de ${title.toLowerCase()}",
    icon: "list-outline",
    route: "${route}",
  },`;
  }, [
    builderAppGroup,
    builderRoute,
    builderScreenName,
    builderTableName,
    selectedTable,
  ]);

  const handleCopyBuilder = useCallback(async () => {
    if (!builderTemplate.trim()) return;
    await Clipboard.setStringAsync(builderTemplate);
    setBuilderCopyStatus("Template copiado");
  }, [builderTemplate]);

  const handleCopyRoute = useCallback(async () => {
    if (!builderAdminEntry.trim()) return;
    await Clipboard.setStringAsync(builderAdminEntry);
    setBuilderRouteStatus("Entrada do menu copiada");
  }, [builderAdminEntry]);

  const handleCopy = useCallback(async () => {
    if (!queryText.trim()) return;
    await Clipboard.setStringAsync(queryText);
    setCopyStatus("Query copiada");
  }, [queryText]);

  if (loading) {
    return (
      <ThemedView
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }
  function onRefresh(): void {
    throw new Error("Function not implemented.");
  }

  // Duplicate onRefresh and unreachable code removed.

  // ...existing code...

  async function handleSelect(table: string) {
    setSelectedTable(table);
    setDetailsLoading(true);
    setColumns([]);
    setError("");
    // Preenche campos do builder e sugere query
    setBuilderTableName(table);
    setBuilderScreenName(table);
    setBuilderRoute(`/${builderAppGroup}/${table}`);
    setQueryText(`SELECT * FROM ${table} LIMIT 50;`);
    try {
      const info = await getTableInfo(table);
      setColumns(info);
    } catch {
      setError("Erro ao buscar colunas da tabela.");
    } finally {
      setDetailsLoading(false);
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <ThemedView style={styles.processCard}>
        <ThemedText style={[styles.processTitle, { color: textColor }]}>
          Tabelas do banco
        </ThemedText>
        <ThemedText style={[styles.processSubtitle, { color: mutedTextColor }]}>
          Consulte colunas e formatos para gerar telas CRUD.
        </ThemedText>
      </ThemedView>

      <ThemedView style={[styles.processCard, { marginTop: 12 }]}>
        <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
          Pesquisar tabela
        </ThemedText>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Ex.: tenants"
          placeholderTextColor={mutedTextColor}
          style={{
            borderWidth: 1,
            borderColor,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
            backgroundColor: inputBackground,
            color: textColor,
            marginTop: 6,
          }}
        />
      </ThemedView>

      {error ? (
        <ThemedText style={{ color: tintColor, marginTop: 12 }}>
          {error}
        </ThemedText>
      ) : null}

      {tables
        .filter((table) =>
          !search ? true : table.toLowerCase().includes(search.toLowerCase()),
        )
        .map((table) => (
          <TouchableOpacity
            key={table}
            onPress={() => handleSelect(table)}
            style={{ marginTop: 12 }}
          >
            <ThemedView
              style={[
                styles.processCard,
                { borderColor: borderColor, backgroundColor: cardColor },
              ]}
            >
              <ThemedText
                style={{ fontSize: 15, fontWeight: "600", color: textColor }}
              >
                {table}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                Clique para ver colunas
              </ThemedText>
            </ThemedView>
          </TouchableOpacity>
        ))}

      {selectedTable ? (
        <ThemedView style={[styles.processCard, { marginTop: 16 }]}>
          <ThemedText style={[styles.processTitle, { color: textColor }]}>
            {selectedTable}
          </ThemedText>

          {detailsLoading ? (
            <ActivityIndicator style={{ marginTop: 12 }} />
          ) : (
            <View style={{ marginTop: 12, gap: 8 }}>
              {uniqueColumns.length === 0 ? (
                <ThemedText style={{ color: mutedTextColor }}>
                  Nenhuma coluna encontrada.
                </ThemedText>
              ) : (
                uniqueColumns.map((col) => (
                  <View
                    key={`${selectedTable}-${col.column_name}`}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      padding: 10,
                      backgroundColor: cardColor,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "600", color: textColor }}>
                      {col.column_name}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Tipo: {col.data_type}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Nullable: {col.is_nullable ?? "-"}
                    </ThemedText>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Default: {col.column_default ?? "-"}
                    </ThemedText>
                    {inferReferencedTable(col) ? (
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        FK: {inferReferencedTable(col)}.
                        {col.referenced_column_name ?? "id"}
                      </ThemedText>
                    ) : null}
                    {isAutoColumn(col) ? (
                      <ThemedText
                        style={{ fontSize: 12, color: mutedTextColor }}
                      >
                        Auto: sim
                      </ThemedText>
                    ) : null}
                  </View>
                ))
              )}

              <View style={{ marginTop: 12 }}>
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Query
                </ThemedText>
                <TextInput
                  value={queryText}
                  onChangeText={setQueryText}
                  multiline
                  placeholder="Query SQL"
                  placeholderTextColor={mutedTextColor}
                  style={{
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 120,
                    backgroundColor: inputBackground,
                    color: textColor,
                    marginTop: 6,
                    textAlignVertical: "top",
                  }}
                />
                <TouchableOpacity
                  onPress={handleCopy}
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: tintColor,
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Copiar
                  </ThemedText>
                </TouchableOpacity>
                {copyStatus ? (
                  <ThemedText style={{ marginTop: 6, color: tintColor }}>
                    {copyStatus}
                  </ThemedText>
                ) : null}

                <TouchableOpacity
                  onPress={() => selectedTable && handleSelect(selectedTable)}
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    {execLoading ? "Executando..." : "Executar"}
                  </ThemedText>
                </TouchableOpacity>

                {execError ? (
                  <ThemedText style={{ marginTop: 6, color: tintColor }}>
                    {execError}
                  </ThemedText>
                ) : null}

                {execResult ? (
                  <View style={{ marginTop: 10 }}>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Resultado (máx. 50 linhas)
                    </ThemedText>
                    <ThemedText
                      style={{ marginTop: 6, color: textColor, fontSize: 12 }}
                    >
                      {JSON.stringify(execResult.slice(0, 50), null, 2)}
                    </ThemedText>
                  </View>
                ) : null}
              </View>

              <View style={{ marginTop: 16 }}>
                <ThemedText style={[styles.processTitle, { color: textColor }]}>
                  Builder de tela CRUD
                </ThemedText>
                <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                  Preencha as perguntas e copie o template da tela.
                </ThemedText>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Nome da tabela
                  </ThemedText>
                  <TextInput
                    value={builderTableName}
                    onChangeText={setBuilderTableName}
                    placeholder="Ex.: tenants"
                    placeholderTextColor={mutedTextColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                    }}
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Nome da tela/arquivo
                  </ThemedText>
                  <TextInput
                    value={builderScreenName}
                    onChangeText={setBuilderScreenName}
                    placeholder="Ex.: tenants"
                    placeholderTextColor={mutedTextColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                    }}
                  />
                </View>

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Rota desejada
                  </ThemedText>
                  <TextInput
                    value={builderRoute}
                    onChangeText={setBuilderRoute}
                    placeholder="Ex.: /Administrador/tenants"
                    placeholderTextColor={mutedTextColor}
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                    }}
                  />
                </View>

                <TouchableOpacity
                  onPress={() => setBuilderUseCrud((prev) => !prev)}
                  style={{
                    marginTop: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    {builderUseCrud
                      ? "Usar CrudScreen: Sim"
                      : "Usar CrudScreen: Não"}
                  </ThemedText>
                </TouchableOpacity>

                <View
                  style={{
                    marginTop: 8,
                    flexDirection: "row",
                    borderWidth: 1,
                    borderColor,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setBuilderAppGroup("Administrador")}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      backgroundColor:
                        builderAppGroup === "Administrador"
                          ? tintColor
                          : cardColor,
                      alignItems: "center",
                    }}
                  >
                    <ThemedText
                      style={{
                        color:
                          builderAppGroup === "Administrador"
                            ? "#ffffff"
                            : textColor,
                        fontWeight: "600",
                      }}
                    >
                      Administrador
                    </ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setBuilderAppGroup("Servicos")}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      backgroundColor:
                        builderAppGroup === "Servicos" ? tintColor : cardColor,
                      alignItems: "center",
                      borderLeftWidth: 1,
                      borderLeftColor: borderColor,
                    }}
                  >
                    <ThemedText
                      style={{
                        color:
                          builderAppGroup === "Servicos"
                            ? "#ffffff"
                            : textColor,
                        fontWeight: "600",
                      }}
                    >
                      Servicos
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  onPress={() =>
                    setBuilderPayloadMode((prev) =>
                      prev === "payload" ? "data" : "payload",
                    )
                  }
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Formato do payload: {builderPayloadMode}
                  </ThemedText>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setBuilderIncludeTable((prev) => !prev)}
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: cardColor,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Incluir table no body: {builderIncludeTable ? "Sim" : "Não"}
                  </ThemedText>
                </TouchableOpacity>

                {referenceColumns.length > 0 ? (
                  <View style={{ marginTop: 12 }}>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Campos de referência
                    </ThemedText>
                    {referenceColumns.map((col) => {
                      const refTable = inferReferencedTable(col);
                      if (!refTable) return null;
                      const refCols = referenceTableColumns[refTable] ?? [];
                      return (
                        <View key={col.column_name} style={{ marginTop: 10 }}>
                          <ThemedText
                            style={{ fontSize: 12, color: mutedTextColor }}
                          >
                            {col.column_name} → {refTable}
                          </ThemedText>
                          <TextInput
                            value={
                              builderReferenceLabels[col.column_name] ?? ""
                            }
                            onChangeText={(text) =>
                              setBuilderReferenceLabels((prev) => ({
                                ...prev,
                                [col.column_name]: text,
                              }))
                            }
                            placeholder="Campo exibido (ex.: name)"
                            placeholderTextColor={mutedTextColor}
                            style={{
                              borderWidth: 1,
                              borderColor,
                              borderRadius: 8,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              backgroundColor: inputBackground,
                              color: textColor,
                              marginTop: 6,
                            }}
                          />
                          {refCols.length > 0 ? (
                            <View
                              style={{
                                marginTop: 6,
                                flexDirection: "row",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              {refCols.map((refCol) => (
                                <TouchableOpacity
                                  key={`${col.column_name}-${refCol.column_name}`}
                                  onPress={() =>
                                    setBuilderReferenceLabels((prev) => ({
                                      ...prev,
                                      [col.column_name]: refCol.column_name,
                                    }))
                                  }
                                  style={{
                                    paddingVertical: 6,
                                    paddingHorizontal: 10,
                                    backgroundColor: cardColor,
                                    borderRadius: 6,
                                    borderWidth: 1,
                                    borderColor,
                                  }}
                                >
                                  <ThemedText
                                    style={{
                                      color: textColor,
                                      fontSize: 12,
                                      fontWeight: "600",
                                    }}
                                  >
                                    {refCol.column_name}
                                  </ThemedText>
                                </TouchableOpacity>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <View style={{ marginTop: 12 }}>
                  <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                    Template gerado
                  </ThemedText>
                  <TextInput
                    value={builderTemplate}
                    editable={false}
                    multiline
                    style={{
                      borderWidth: 1,
                      borderColor,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      minHeight: 160,
                      backgroundColor: inputBackground,
                      color: textColor,
                      marginTop: 6,
                      textAlignVertical: "top",
                    }}
                  />
                </View>

                <TouchableOpacity
                  onPress={handleCopyBuilder}
                  style={{
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    backgroundColor: tintColor,
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                >
                  <ThemedText style={{ color: textColor, fontWeight: "600" }}>
                    Copiar template
                  </ThemedText>
                </TouchableOpacity>

                {builderCopyStatus ? (
                  <ThemedText style={{ marginTop: 6, color: tintColor }}>
                    {builderCopyStatus}
                  </ThemedText>
                ) : null}

                {builderAppGroup === "Administrador" ? (
                  <View style={{ marginTop: 12 }}>
                    <ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
                      Entrada no menu Admin
                    </ThemedText>
                    <TextInput
                      value={builderAdminEntry}
                      editable={false}
                      multiline
                      style={{
                        borderWidth: 1,
                        borderColor,
                        borderRadius: 8,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        minHeight: 90,
                        backgroundColor: inputBackground,
                        color: textColor,
                        marginTop: 6,
                        textAlignVertical: "top",
                      }}
                    />

                    <TouchableOpacity
                      onPress={handleCopyRoute}
                      style={{
                        marginTop: 8,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: cardColor,
                        borderRadius: 6,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor,
                      }}
                    >
                      <ThemedText
                        style={{ color: textColor, fontWeight: "600" }}
                      >
                        Copiar entrada do menu
                      </ThemedText>
                    </TouchableOpacity>

                    {builderRouteStatus ? (
                      <ThemedText style={{ marginTop: 6, color: tintColor }}>
                        {builderRouteStatus}
                      </ThemedText>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>
          )}
        </ThemedView>
      ) : null}
    </ScrollView>
  );
}
