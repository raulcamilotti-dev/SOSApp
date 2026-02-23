/**
 * KANBAN SCREEN — Generic, reusable Kanban board component.
 *
 * Same philosophy as CrudScreen: schema-driven, callback-based,
 * one component to render any Kanban board.
 *
 * Features:
 * - Generic type <T> for items
 * - Theme-aware (light/dark mode)
 * - Horizontal scroll with web arrow navigation
 * - Built-in move modal (column transition)
 * - Built-in search
 * - Pull-to-refresh (native)
 * - Customizable cards via `renderCard` or `getCardTitle` + `getCardFields` + `getCardActions`
 * - Header slots for back buttons, create buttons, nav chips
 * - Ref with `reload()` for external trigger
 */

import { spacing, typography } from "@/app/theme/styles";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import React, {
    type ReactNode,
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

/** A single Kanban column definition */
export interface KanbanColumnDef {
  /** Unique column identifier (e.g. step ID or status string) */
  id: string;
  /** Column header text */
  label: string;
  /** Header background color (hex) */
  color: string;
  /** Sort position (ascending) */
  order: number;
  /** Optional description shown in the move modal */
  description?: string;
}

/** A metadata row shown on the default card */
export interface KanbanCardField {
  /** Ionicons name (e.g. "person-outline") */
  icon?: string;
  /** Field text content */
  text: string;
}

/** An action button shown on the default card */
export interface KanbanCardAction {
  label: string;
  /** Ionicons name */
  icon: string;
  /** Background color */
  color: string;
  onPress: () => void;
  disabled?: boolean;
}

/** Theme colors passed to renderCard for custom card rendering */
export interface KanbanTheme {
  bg: string;
  cardBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  tintColor: string;
}

/** Ref handle exposed by KanbanScreen */
export interface KanbanScreenRef {
  /** Force reload of columns + items */
  reload: () => void;
}

/** Props for KanbanScreen<T> */
export interface KanbanScreenProps<T> {
  /* ── Identity ── */
  title: string;
  subtitle?: string;
  /** Dynamic subtitle computed from board counts. Overrides `subtitle` if provided. */
  getSubtitle?: (totalItems: number, visibleItems: number) => string;

  /* ── Data ── */
  /** Fetch column definitions. Called on mount + every reload. */
  loadColumns: () => Promise<KanbanColumnDef[]>;
  /** Fetch all items to display on the board. */
  loadItems: () => Promise<T[]>;
  /** Extract unique ID from an item */
  getId: (item: T) => string;
  /** Extract column ID from an item (which column it belongs to) */
  getColumnId: (item: T) => string;

  /* ── Card presentation (default card) ── */
  /** Card title text */
  getCardTitle: (item: T) => string;
  /** Metadata rows below the title (icon + text) */
  getCardFields?: (item: T) => KanbanCardField[];
  /** Action buttons at the bottom of the card */
  getCardActions?: (item: T, columnId: string) => KanbanCardAction[];
  /** Custom ReactNode for badges area (between fields and actions) */
  renderCardBadges?: (item: T) => ReactNode;

  /* ── Card presentation (full override) ── */
  /** Full custom card renderer. When provided, getCardFields/Actions/Badges are ignored. */
  renderCard?: (item: T, columnId: string, theme: KanbanTheme) => ReactNode;

  /* ── Card interaction ── */
  /** Tap on card title */
  onCardPress?: (item: T) => void;
  /** Long press on card (default: opens move modal if onMoveItem is set) */
  onCardLongPress?: (item: T) => void;

  /* ── Search ── */
  searchPlaceholder?: string;
  /** Return array of searchable string values for an item */
  searchFields?: (item: T) => (string | null | undefined)[];

  /* ── Move / transition ── */
  /** Called when user moves an item to a new column via the move modal.
   *  KanbanScreen auto-reloads after successful move. */
  onMoveItem?: (item: T, toColumnId: string) => Promise<void>;
  /** Label for the move modal title (default: "Mover para") */
  moveModalTitle?: string;

  /* ── Header slots ── */
  /** Content rendered BEFORE the title row (e.g., back button) */
  headerBefore?: ReactNode;
  /** Content rendered AFTER the search bar (e.g., nav chips, hints) */
  headerAfter?: ReactNode;
  /** Label for a create/add button next to the title */
  createButtonLabel?: string;
  /** Handler for the create button */
  onCreatePress?: () => void;

  /* ── Board layout ── */
  /** Column width in pixels (default: 300) */
  columnWidth?: number;
  /** Text shown in empty columns (default: "Nenhum item") */
  emptyColumnText?: string;
  /** Loading text (default: "Carregando...") */
  loadingText?: string;

  /* ── Extra ── */
  /** Render extra modals after the board (tasks modal, create lead, etc.) */
  renderExtraModals?: () => ReactNode;
}

/* ═══════════════════════════════════════════════════════
 * COMPONENT
 * ═══════════════════════════════════════════════════════ */

function KanbanScreenInner<T>(
  props: KanbanScreenProps<T>,
  ref: React.Ref<KanbanScreenRef>,
) {
  /* ── Theme ── */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");

  const theme: KanbanTheme = {
    bg,
    cardBg,
    textColor,
    mutedColor,
    borderColor,
    tintColor,
  };

  /* ── Destructure props for stable references ── */
  const {
    loadColumns: propLoadColumns,
    loadItems: propLoadItems,
    searchFields: propSearchFields,
    onMoveItem: propOnMoveItem,
    getColumnId,
    getSubtitle,
    subtitle: propSubtitle,
    columnWidth: propColumnWidth,
    getCardFields,
    getCardActions,
    renderCardBadges,
    renderCard: propRenderCard,
    onCardPress,
    onCardLongPress,
    getId,
    getCardTitle,
    searchPlaceholder,
    moveModalTitle,
    headerBefore,
    headerAfter,
    createButtonLabel,
    onCreatePress,
    emptyColumnText,
    loadingText,
    renderExtraModals,
    title,
  } = props;

  /* ── State ── */
  const [columns, setColumns] = useState<KanbanColumnDef[]>([]);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  // Move modal
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [moving, setMoving] = useState(false);

  // Horizontal scroll
  const kanbanScrollRef = useRef<ScrollView>(null);
  const [scrollX, setScrollX] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [viewWidth, setViewWidth] = useState(0);

  /* ── Data loading ── */

  const loadData = useCallback(async () => {
    try {
      const [cols, itms] = await Promise.all([
        propLoadColumns(),
        propLoadItems(),
      ]);
      setColumns(cols.sort((a, b) => a.order - b.order));
      setItems(itms);
    } catch (err) {
      console.error("KanbanScreen loadData error:", err);
      Alert.alert("Erro", "Falha ao carregar dados do kanban");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [propLoadColumns, propLoadItems]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  useImperativeHandle(ref, () => ({ reload: loadData }));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  /* ── Search ── */

  const matchesSearch = useCallback(
    (item: T) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      if (!propSearchFields) return true;
      return propSearchFields(item)
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ")
        .includes(term);
    },
    [search, propSearchFields],
  );

  /* ── Build column data ── */

  const columnSet = new Set(columns.map((c) => c.id));
  const columnData = columns.map((col) => ({
    column: col,
    items: items
      .filter((item) => getColumnId(item) === col.id)
      .filter(matchesSearch),
  }));

  const totalItems = items.filter((item) =>
    columnSet.has(getColumnId(item)),
  ).length;
  const visibleItems = columnData.reduce((s, c) => s + c.items.length, 0);

  const subtitleText =
    getSubtitle?.(totalItems, visibleItems) ??
    propSubtitle ??
    `${visibleItems} de ${totalItems} itens`;

  /* ── Horizontal scroll helpers ── */

  const COLUMN_WIDTH = propColumnWidth ?? 300;

  const scrollKanban = useCallback(
    (direction: "left" | "right") => {
      const step = COLUMN_WIDTH + spacing.md;
      const newX = direction === "right" ? scrollX + step : scrollX - step;
      const clamped = Math.max(0, Math.min(newX, contentWidth - viewWidth));
      kanbanScrollRef.current?.scrollTo({ x: clamped, animated: true });
    },
    [scrollX, contentWidth, viewWidth, COLUMN_WIDTH],
  );

  const canScrollLeft = scrollX > 10;
  const canScrollRight = contentWidth - viewWidth - scrollX > 10;

  /* ── Move modal ── */

  const openMoveModal = useCallback((item: T) => {
    setSelectedItem(item);
    setMoveModalVisible(true);
  }, []);

  const handleMove = useCallback(
    async (toColumnId: string) => {
      if (!selectedItem || !propOnMoveItem) return;
      setMoving(true);
      try {
        await propOnMoveItem(selectedItem, toColumnId);
        setMoveModalVisible(false);
        setSelectedItem(null);
        // Auto-reload
        loadData();
      } catch {
        Alert.alert("Erro", "Falha ao mover item");
      } finally {
        setMoving(false);
      }
    },
    [selectedItem, propOnMoveItem, loadData],
  );

  /* ── Default card renderer ── */

  const renderDefaultCard = (item: T, columnId: string) => {
    const fields = getCardFields?.(item) ?? [];
    const actions = getCardActions?.(item, columnId) ?? [];

    return (
      <TouchableOpacity
        key={getId(item)}
        style={[s.card, { backgroundColor: cardBg, borderColor }]}
        onLongPress={() => {
          if (onCardLongPress) {
            onCardLongPress(item);
          } else if (propOnMoveItem) {
            openMoveModal(item);
          }
        }}
        activeOpacity={0.9}
      >
        {/* Title */}
        <TouchableOpacity
          onPress={() => onCardPress?.(item)}
          activeOpacity={0.7}
          disabled={!onCardPress}
        >
          <Text style={[s.cardTitle, { color: textColor }]} numberOfLines={2}>
            {getCardTitle(item)}
          </Text>
        </TouchableOpacity>

        {/* Metadata rows */}
        {fields.map((f, i) => (
          <View key={i} style={s.cardRow}>
            {f.icon && (
              <Ionicons name={f.icon as any} size={12} color={mutedColor} />
            )}
            <Text style={[s.cardMeta, { color: mutedColor }]} numberOfLines={1}>
              {f.text}
            </Text>
          </View>
        ))}

        {/* Badges area */}
        {renderCardBadges?.(item)}

        {/* Action buttons */}
        {actions.length > 0 && (
          <View style={s.cardActions}>
            {actions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={[
                  s.actionBtn,
                  {
                    backgroundColor: action.color,
                    opacity: action.disabled ? 0.5 : 1,
                  },
                ]}
                onPress={action.onPress}
                disabled={action.disabled}
              >
                <Ionicons name={action.icon as any} size={12} color="#fff" />
                <Text style={s.actionBtnText}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  /* ── Card rendering (delegates to custom or default) ── */

  const renderCardItem = (item: T, columnId: string) => {
    if (propRenderCard) {
      return (
        <React.Fragment key={getId(item)}>
          {propRenderCard(item, columnId, theme)}
        </React.Fragment>
      );
    }
    return renderDefaultCard(item, columnId);
  };

  /* ── Column rendering ── */

  const renderColumn = ({
    column,
    items: colItems,
  }: {
    column: KanbanColumnDef;
    items: T[];
  }) => {
    const content = (
      <>
        <View style={[s.columnHeader, { backgroundColor: column.color }]}>
          <Text style={s.columnTitle} numberOfLines={2}>
            {column.label}
          </Text>
          <View style={s.columnBadge}>
            <Text style={s.columnBadgeText}>{colItems.length}</Text>
          </View>
        </View>
        <View style={[s.columnContent, { backgroundColor: bg }]}>
          {colItems.length === 0 ? (
            <View style={s.emptyCol}>
              <Text style={[s.emptyText, { color: mutedColor }]}>
                {emptyColumnText ?? "Nenhum item"}
              </Text>
            </View>
          ) : (
            colItems.map((item) => renderCardItem(item, column.id))
          )}
        </View>
      </>
    );

    if (Platform.OS === "web") {
      return (
        <View
          key={column.id}
          style={[
            s.column,
            { borderColor, width: COLUMN_WIDTH, overflow: "auto" as any },
          ]}
        >
          {content}
        </View>
      );
    }

    return (
      <View
        key={column.id}
        style={[s.column, { borderColor, width: COLUMN_WIDTH }]}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
        >
          {content}
        </ScrollView>
      </View>
    );
  };

  /* ── Loading state ── */

  if (loading) {
    return (
      <View style={[s.container, { backgroundColor: bg }]}>
        <View style={s.centered}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={[s.loadingText, { color: mutedColor }]}>
            {loadingText ?? "Carregando..."}
          </Text>
        </View>
      </View>
    );
  }

  /* ── Main render ── */

  return (
    <View style={[s.container, { backgroundColor: bg }]}>
      {/* ═══ Header ═══ */}
      <View
        style={[
          s.header,
          { backgroundColor: cardBg, borderBottomColor: borderColor },
        ]}
      >
        {/* Before slot (back buttons, breadcrumbs) */}
        {headerBefore}

        {/* Title row */}
        <View style={s.headerTopRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: textColor }]}>{title}</Text>
            <Text style={[s.headerSubtitle, { color: mutedColor }]}>
              {subtitleText}
            </Text>
          </View>
          {createButtonLabel && onCreatePress && (
            <TouchableOpacity
              style={[s.addBtn, { backgroundColor: tintColor }]}
              onPress={onCreatePress}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={s.addBtnText}>{createButtonLabel}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Search */}
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={searchPlaceholder ?? "Pesquisar..."}
          placeholderTextColor={mutedColor}
          style={[
            s.searchInput,
            { backgroundColor: bg, borderColor, color: textColor },
          ]}
        />

        {/* After slot (nav chips, hints) */}
        {headerAfter}
      </View>

      {/* ═══ Kanban Board ═══ */}
      <View style={{ flex: 1, position: "relative" }}>
        {/* Left scroll arrow (web only) */}
        {Platform.OS === "web" && canScrollLeft && (
          <TouchableOpacity
            onPress={() => scrollKanban("left")}
            style={[s.scrollArrow, s.scrollArrowLeft]}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}

        <ScrollView
          ref={kanbanScrollRef}
          horizontal
          showsHorizontalScrollIndicator={Platform.OS === "web"}
          style={s.kanbanScroll}
          contentContainerStyle={s.kanbanBoard}
          onScroll={(e) => {
            setScrollX(e.nativeEvent.contentOffset.x);
            if (Platform.OS !== "web") {
              setViewWidth(e.nativeEvent.layoutMeasurement.width);
              setContentWidth(e.nativeEvent.contentSize.width);
            }
          }}
          scrollEventThrottle={16}
          onContentSizeChange={(w) => setContentWidth(w)}
          onLayout={(e) => setViewWidth(e.nativeEvent.layout.width)}
          refreshControl={
            Platform.OS !== "web" ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            ) : undefined
          }
        >
          {columnData.map(renderColumn)}
        </ScrollView>

        {/* Right scroll arrow (web only) */}
        {Platform.OS === "web" && canScrollRight && (
          <TouchableOpacity
            onPress={() => scrollKanban("right")}
            style={[s.scrollArrow, s.scrollArrowRight]}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ═══ Move Modal ═══ */}
      {propOnMoveItem && (
        <Modal
          visible={moveModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMoveModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.modalTitle, { color: textColor }]}>
                    {moveModalTitle ?? "Mover para"}
                  </Text>
                  {selectedItem && (
                    <Text
                      style={[s.modalSubtitle, { color: mutedColor }]}
                      numberOfLines={1}
                    >
                      {getCardTitle(selectedItem)}
                    </Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => setMoveModalVisible(false)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 400 }}>
                {columns
                  .filter((col) =>
                    selectedItem ? col.id !== getColumnId(selectedItem) : true,
                  )
                  .map((col) => (
                    <TouchableOpacity
                      key={col.id}
                      style={[
                        s.stepOption,
                        { borderColor, borderLeftColor: col.color },
                      ]}
                      onPress={() => handleMove(col.id)}
                      disabled={moving}
                    >
                      <Text style={[s.stepOptionName, { color: textColor }]}>
                        {col.label}
                      </Text>
                      {col.description ? (
                        <Text style={[s.stepOptionDesc, { color: mutedColor }]}>
                          {col.description}
                        </Text>
                      ) : null}
                      {moving && (
                        <ActivityIndicator
                          size="small"
                          color={tintColor}
                          style={{ position: "absolute", right: spacing.md }}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                {columns.filter((col) =>
                  selectedItem ? col.id !== getColumnId(selectedItem) : true,
                ).length === 0 && (
                  <Text
                    style={{
                      color: mutedColor,
                      textAlign: "center",
                      padding: 24,
                      fontStyle: "italic",
                    }}
                  >
                    Nenhuma transição disponível.
                  </Text>
                )}
              </ScrollView>

              <TouchableOpacity
                style={[s.cancelBtn, { borderColor }]}
                onPress={() => setMoveModalVisible(false)}
              >
                <Text style={[s.cancelBtnText, { color: textColor }]}>
                  Cancelar
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Extra modals from the screen */}
      {renderExtraModals?.()}
    </View>
  );
}

/* ── Export with generic type support ── */

export const KanbanScreen = React.forwardRef(KanbanScreenInner) as <T>(
  props: KanbanScreenProps<T> & { ref?: React.Ref<KanbanScreenRef> },
) => React.ReactElement;

/* ═══════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════ */

const s = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { ...typography.body, marginTop: spacing.sm },

  // Header
  header: {
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  headerTitle: {
    ...typography.title,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    ...typography.caption,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  searchInput: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
  },

  // Kanban board
  kanbanScroll: { flex: 1 },
  kanbanBoard: {
    flexDirection: "row",
    padding: spacing.md,
    gap: spacing.md,
  },
  column: {
    borderRadius: 10,
    borderWidth: 1,
    ...Platform.select({
      web: {
        maxHeight: "calc(100vh - 260px)" as any,
        overflowY: "auto" as any,
        overflowX: "hidden" as any,
      },
      default: { overflow: "hidden" as const },
    }),
  },
  columnHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    ...Platform.select({
      web: { position: "sticky" as any, top: 0, zIndex: 10 },
      default: {},
    }),
  },
  columnTitle: {
    flex: 1,
    ...typography.body,
    fontWeight: "700",
    color: "#fff",
    marginRight: spacing.sm,
  },
  columnBadge: {
    backgroundColor: "rgba(255,255,255,0.3)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  columnBadgeText: { ...typography.caption, fontWeight: "700", color: "#fff" },
  columnContent: { flex: 1, padding: spacing.sm },
  emptyCol: { padding: spacing.lg, alignItems: "center" },
  emptyText: { ...typography.caption, fontStyle: "italic" },

  // Scroll arrows (web)
  scrollArrow: {
    position: "absolute",
    top: "50%",
    zIndex: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    ...(Platform.OS === "web"
      ? { transform: [{ translateY: -18 }], cursor: "pointer" as any }
      : { transform: [{ translateY: -18 }] }),
  } as any,
  scrollArrowLeft: { left: 4 } as any,
  scrollArrowRight: { right: 4 } as any,

  // Card
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...(Platform.OS === "web"
      ? { boxShadow: "0px 1px 3px rgba(0,0,0,0.08)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 2,
          elevation: 1,
        }),
  },
  cardTitle: { ...typography.body, fontWeight: "600", marginBottom: 4 },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  cardMeta: { ...typography.caption, flex: 1 },
  cardActions: {
    flexDirection: "row",
    gap: 6,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: 5,
    borderRadius: 6,
  },
  actionBtnText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  // Move modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  modalTitle: { ...typography.subtitle, fontWeight: "700" },
  modalSubtitle: { ...typography.caption, marginTop: 2 },
  stepOption: {
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  stepOptionName: { ...typography.body, fontWeight: "600" },
  stepOptionDesc: { ...typography.caption, marginTop: 2 },
  cancelBtn: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  cancelBtnText: { ...typography.body, fontWeight: "600" },
});
