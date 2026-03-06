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
  onPress: () => void | Promise<void>;
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

/** Default palette for column color picker */
export const DEFAULT_COLUMN_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#0ea5e9",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

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

  /* ── Column editing (opt-in, Trello-like) ── */
  /** Enable inline column editing UI (add, rename, reorder, color) */
  editable?: boolean;
  /** Called to add a new column. KanbanScreen auto-reloads after. */
  onAddColumn?: (column: {
    label: string;
    color: string;
    order: number;
  }) => Promise<void>;
  /** Called to rename a column. KanbanScreen auto-reloads after. */
  onRenameColumn?: (columnId: string, newLabel: string) => Promise<void>;
  /** Called to swap a column with its neighbor. KanbanScreen auto-reloads after. */
  onReorderColumn?: (
    columnId: string,
    direction: "left" | "right",
  ) => Promise<void>;
  /** Called to change column color. KanbanScreen auto-reloads after. */
  onChangeColumnColor?: (columnId: string, newColor: string) => Promise<void>;
  /** Preset color palette for column color picker (default: DEFAULT_COLUMN_COLORS) */
  columnColors?: string[];
  /** Label for the advanced settings button (e.g. "Configurações avançadas") */
  advancedSettingsLabel?: string;
  /** Navigate to advanced workflow editor */
  onAdvancedSettings?: () => void;
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
    // Editable props
    editable,
    onAddColumn,
    onRenameColumn,
    onReorderColumn,
    onChangeColumnColor,
    columnColors,
    advancedSettingsLabel,
    onAdvancedSettings,
  } = props;

  const editColors = columnColors ?? DEFAULT_COLUMN_COLORS;

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
  const [loadingActionKey, setLoadingActionKey] = useState<string | null>(null);

  // Column editing state
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] = useState("");
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(
    null,
  );
  const [addColumnModalVisible, setAddColumnModalVisible] = useState(false);
  const [newColumnLabel, setNewColumnLabel] = useState("");
  const [newColumnColor, setNewColumnColor] = useState(
    DEFAULT_COLUMN_COLORS[0],
  );
  const [columnSaving, setColumnSaving] = useState(false);

  // Drag-and-drop (web only)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

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

  /* ── Column editing handlers ── */

  const startRenameColumn = useCallback(
    (columnId: string, currentLabel: string) => {
      setEditingColumnId(columnId);
      setEditingColumnLabel(currentLabel);
    },
    [],
  );

  const commitRenameColumn = useCallback(async () => {
    if (!editingColumnId || !onRenameColumn) return;
    const trimmed = editingColumnLabel.trim();
    if (!trimmed) {
      setEditingColumnId(null);
      return;
    }
    setColumnSaving(true);
    try {
      await onRenameColumn(editingColumnId, trimmed);
      setEditingColumnId(null);
      loadData();
    } catch {
      Alert.alert("Erro", "Falha ao renomear coluna");
    } finally {
      setColumnSaving(false);
    }
  }, [editingColumnId, editingColumnLabel, onRenameColumn, loadData]);

  const handleReorderColumn = useCallback(
    async (columnId: string, direction: "left" | "right") => {
      if (!onReorderColumn) return;
      setColumnSaving(true);
      try {
        await onReorderColumn(columnId, direction);
        loadData();
      } catch {
        Alert.alert("Erro", "Falha ao reordenar coluna");
      } finally {
        setColumnSaving(false);
      }
    },
    [onReorderColumn, loadData],
  );

  const openColorPicker = useCallback((columnId: string) => {
    setColorPickerColumnId(columnId);
  }, []);

  const handleColorChange = useCallback(
    async (color: string) => {
      if (!colorPickerColumnId || !onChangeColumnColor) return;
      setColumnSaving(true);
      try {
        await onChangeColumnColor(colorPickerColumnId, color);
        setColorPickerColumnId(null);
        loadData();
      } catch {
        Alert.alert("Erro", "Falha ao alterar cor");
      } finally {
        setColumnSaving(false);
      }
    },
    [colorPickerColumnId, onChangeColumnColor, loadData],
  );

  const openAddColumnModal = useCallback(() => {
    setNewColumnLabel("");
    setNewColumnColor(editColors[0]);
    setAddColumnModalVisible(true);
  }, [editColors]);

  const handleAddColumn = useCallback(async () => {
    if (!onAddColumn) return;
    const trimmed = newColumnLabel.trim();
    if (!trimmed) return;
    setColumnSaving(true);
    try {
      const maxOrder =
        columns.length > 0 ? Math.max(...columns.map((c) => c.order)) : 0;
      await onAddColumn({
        label: trimmed,
        color: newColumnColor,
        order: maxOrder + 1,
      });
      setAddColumnModalVisible(false);
      loadData();
    } catch {
      Alert.alert("Erro", "Falha ao criar coluna");
    } finally {
      setColumnSaving(false);
    }
  }, [onAddColumn, newColumnLabel, newColumnColor, columns, loadData]);

  /* ── Web drag-and-drop handlers ── */

  const handleDragStart = useCallback((itemId: string) => {
    setDraggedItemId(itemId);
  }, []);

  const handleDragOver = useCallback((columnId: string) => {
    setDragOverColumnId(columnId);
  }, []);

  const handleDrop = useCallback(
    async (toColumnId: string) => {
      if (!draggedItemId || !propOnMoveItem) {
        setDraggedItemId(null);
        setDragOverColumnId(null);
        return;
      }
      const item = items.find((i) => getId(i) === draggedItemId);
      if (!item || getColumnId(item) === toColumnId) {
        setDraggedItemId(null);
        setDragOverColumnId(null);
        return;
      }
      setDraggedItemId(null);
      setDragOverColumnId(null);
      try {
        await propOnMoveItem(item, toColumnId);
        loadData();
      } catch {
        Alert.alert("Erro", "Falha ao mover item");
      }
    },
    [draggedItemId, propOnMoveItem, items, getId, getColumnId, loadData],
  );

  const handleDragEnd = useCallback(() => {
    setDraggedItemId(null);
    setDragOverColumnId(null);
  }, []);

  /* ── Default card renderer ── */

  const renderDefaultCard = (item: T, columnId: string) => {
    const fields = getCardFields?.(item) ?? [];
    const actions = getCardActions?.(item, columnId) ?? [];
    const itemActionPrefix = `${getId(item)}::`;
    const isItemBusy = !!loadingActionKey?.startsWith(itemActionPrefix);

    const handleActionPress = async (
      action: KanbanCardAction,
      actionIndex: number,
    ) => {
      const key = `${itemActionPrefix}${columnId}::${actionIndex}`;
      setLoadingActionKey(key);
      try {
        await Promise.resolve(action.onPress());
      } finally {
        setLoadingActionKey((current) => (current === key ? null : current));
      }
    };

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
            {actions.map((action, i) => {
              const actionKey = `${itemActionPrefix}${columnId}::${i}`;
              const isLoading = loadingActionKey === actionKey;
              const isDisabled = !!action.disabled || isItemBusy;
              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    s.actionBtn,
                    {
                      backgroundColor: action.color,
                      opacity: isDisabled ? 0.5 : 1,
                    },
                  ]}
                  onPress={() => {
                    void handleActionPress(action, i);
                  }}
                  disabled={isDisabled}
                >
                  {isLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons
                        name={action.icon as any}
                        size={12}
                        color="#fff"
                      />
                      <Text style={s.actionBtnText}>{action.label}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
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

  /* ── Card rendering with drag-and-drop (web) ── */

  const renderCardWithDrag = (item: T, columnId: string) => {
    const cardNode = renderCardItem(item, columnId);
    if (Platform.OS !== "web" || !propOnMoveItem) return cardNode;

    const itemId = getId(item);
    const isDragging = draggedItemId === itemId;

    return (
      <View
        key={itemId}
        {...({
          draggable: true,
          onDragStart: () => handleDragStart(itemId),
          onDragEnd: handleDragEnd,
        } as any)}
        style={{ opacity: isDragging ? 0.4 : 1, cursor: "grab" } as any}
      >
        {cardNode}
      </View>
    );
  };

  /* ── Column rendering ── */

  const renderColumn = ({
    column,
    items: colItems,
  }: {
    column: KanbanColumnDef;
    items: T[];
  }) => {
    const colIndex = columns.findIndex((c) => c.id === column.id);
    const isFirst = colIndex === 0;
    const isLast = colIndex === columns.length - 1;
    const isEditing = editingColumnId === column.id;
    const isDragOver = dragOverColumnId === column.id;

    const columnHeader = (
      <View style={[s.columnHeader, { backgroundColor: column.color }]}>
        {/* Editable header */}
        {editable && isEditing && onRenameColumn ? (
          <TextInput
            value={editingColumnLabel}
            onChangeText={setEditingColumnLabel}
            onBlur={commitRenameColumn}
            onSubmitEditing={commitRenameColumn}
            autoFocus
            style={[s.columnTitle, s.columnTitleInput]}
            selectTextOnFocus
          />
        ) : (
          <TouchableOpacity
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
            onPress={
              editable && onRenameColumn
                ? () => startRenameColumn(column.id, column.label)
                : undefined
            }
            disabled={!editable || !onRenameColumn}
            activeOpacity={editable ? 0.7 : 1}
          >
            {/* Color dot (tap to change) */}
            {editable && onChangeColumnColor && (
              <TouchableOpacity
                onPress={() => openColorPicker(column.id)}
                style={s.colorDot}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <View
                  style={[
                    s.colorDotInner,
                    {
                      backgroundColor: "#fff",
                      borderColor: "rgba(255,255,255,0.6)",
                    },
                  ]}
                />
              </TouchableOpacity>
            )}
            <Text style={s.columnTitle} numberOfLines={2}>
              {column.label}
            </Text>
          </TouchableOpacity>
        )}

        {/* Reorder arrows */}
        {editable && onReorderColumn && !isEditing && (
          <View style={{ flexDirection: "row", gap: 2, marginRight: 4 }}>
            <TouchableOpacity
              onPress={() => handleReorderColumn(column.id, "left")}
              disabled={isFirst || columnSaving}
              style={{ opacity: isFirst ? 0.3 : 1, padding: 2 }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="chevron-back" size={14} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleReorderColumn(column.id, "right")}
              disabled={isLast || columnSaving}
              style={{ opacity: isLast ? 0.3 : 1, padding: 2 }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Ionicons name="chevron-forward" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <View style={s.columnBadge}>
          <Text style={s.columnBadgeText}>{colItems.length}</Text>
        </View>
      </View>
    );

    const content = (
      <>
        {columnHeader}
        <View style={[s.columnContent, { backgroundColor: bg }]}>
          {colItems.length === 0 ? (
            <View style={s.emptyCol}>
              <Text style={[s.emptyText, { color: mutedColor }]}>
                {emptyColumnText ?? "Nenhum item"}
              </Text>
            </View>
          ) : (
            colItems.map((item) => renderCardWithDrag(item, column.id))
          )}
        </View>
      </>
    );

    // Web drag-and-drop column wrapper
    const webDragProps =
      Platform.OS === "web" && propOnMoveItem
        ? {
            onDragOver: (e: any) => {
              e.preventDefault();
              handleDragOver(column.id);
            },
            onDragLeave: () => setDragOverColumnId(null),
            onDrop: (e: any) => {
              e.preventDefault();
              handleDrop(column.id);
            },
          }
        : {};

    if (Platform.OS === "web") {
      return (
        <View
          key={column.id}
          {...(webDragProps as any)}
          style={[
            s.column,
            {
              borderColor: isDragOver ? tintColor : borderColor,
              borderWidth: isDragOver ? 2 : 1,
              width: COLUMN_WIDTH,
              overflow: "auto" as any,
            },
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
          {editable && onAdvancedSettings && (
            <TouchableOpacity
              style={[s.settingsBtn, { borderColor }]}
              onPress={onAdvancedSettings}
            >
              <Ionicons name="settings-outline" size={18} color={mutedColor} />
              {advancedSettingsLabel ? (
                <Text style={[s.settingsBtnText, { color: mutedColor }]}>
                  {advancedSettingsLabel}
                </Text>
              ) : null}
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

          {/* ── Add column button (Trello-like) ── */}
          {editable && onAddColumn && (
            <TouchableOpacity
              onPress={openAddColumnModal}
              style={[s.addColumnBtn, { borderColor, backgroundColor: cardBg }]}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={mutedColor} />
              <Text style={[s.addColumnBtnText, { color: mutedColor }]}>
                Adicionar coluna
              </Text>
            </TouchableOpacity>
          )}
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

      {/* ═══ Color Picker Modal ═══ */}
      {editable && onChangeColumnColor && (
        <Modal
          visible={!!colorPickerColumnId}
          transparent
          animationType="fade"
          onRequestClose={() => setColorPickerColumnId(null)}
        >
          <View style={s.modalOverlay}>
            <View
              style={[
                s.modalSheet,
                { backgroundColor: cardBg, maxHeight: "50%" },
              ]}
            >
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: textColor }]}>
                  Cor da coluna
                </Text>
                <TouchableOpacity onPress={() => setColorPickerColumnId(null)}>
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>
              <View style={s.colorGrid}>
                {editColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => handleColorChange(color)}
                    disabled={columnSaving}
                    style={[
                      s.colorGridItem,
                      {
                        backgroundColor: color,
                        opacity: columnSaving ? 0.5 : 1,
                      },
                    ]}
                  >
                    {columns.find((c) => c.id === colorPickerColumnId)
                      ?.color === color && (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              {columnSaving && (
                <ActivityIndicator
                  size="small"
                  color={tintColor}
                  style={{ marginTop: spacing.sm }}
                />
              )}
            </View>
          </View>
        </Modal>
      )}

      {/* ═══ Add Column Modal ═══ */}
      {editable && onAddColumn && (
        <Modal
          visible={addColumnModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setAddColumnModalVisible(false)}
        >
          <View style={s.modalOverlay}>
            <View style={[s.modalSheet, { backgroundColor: cardBg }]}>
              <View style={s.modalHeader}>
                <Text style={[s.modalTitle, { color: textColor }]}>
                  Nova coluna
                </Text>
                <TouchableOpacity
                  onPress={() => setAddColumnModalVisible(false)}
                >
                  <Ionicons name="close" size={24} color={mutedColor} />
                </TouchableOpacity>
              </View>

              <Text style={[s.addColumnFieldLabel, { color: mutedColor }]}>
                Nome
              </Text>
              <TextInput
                value={newColumnLabel}
                onChangeText={setNewColumnLabel}
                placeholder="Ex: Em andamento"
                placeholderTextColor={mutedColor}
                autoFocus
                style={[
                  s.searchInput,
                  {
                    backgroundColor: bg,
                    borderColor,
                    color: textColor,
                    marginTop: 4,
                  },
                ]}
              />

              <Text
                style={[
                  s.addColumnFieldLabel,
                  { color: mutedColor, marginTop: spacing.md },
                ]}
              >
                Cor
              </Text>
              <View style={s.colorGrid}>
                {editColors.map((color) => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setNewColumnColor(color)}
                    style={[
                      s.colorGridItem,
                      { backgroundColor: color },
                      newColumnColor === color && s.colorGridItemSelected,
                    ]}
                  >
                    {newColumnColor === color && (
                      <Ionicons name="checkmark" size={18} color="#fff" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview */}
              {newColumnLabel.trim() ? (
                <View
                  style={[
                    s.addColumnPreview,
                    { backgroundColor: newColumnColor },
                  ]}
                >
                  <Text style={s.addColumnPreviewText} numberOfLines={1}>
                    {newColumnLabel.trim()}
                  </Text>
                </View>
              ) : null}

              <View
                style={{
                  flexDirection: "row",
                  gap: spacing.sm,
                  marginTop: spacing.lg,
                }}
              >
                <TouchableOpacity
                  style={[s.cancelBtn, { borderColor, flex: 1 }]}
                  onPress={() => setAddColumnModalVisible(false)}
                >
                  <Text style={[s.cancelBtnText, { color: textColor }]}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    s.addBtn,
                    {
                      backgroundColor:
                        columnSaving || !newColumnLabel.trim()
                          ? mutedColor
                          : tintColor,
                      flex: 1,
                      justifyContent: "center",
                    },
                  ]}
                  onPress={handleAddColumn}
                  disabled={columnSaving || !newColumnLabel.trim()}
                >
                  {columnSaving ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={s.addBtnText}>Adicionar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
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
    flexWrap: "wrap",
    gap: 6,
    marginTop: spacing.sm,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    minHeight: 28,
    minWidth: 88,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: "pointer" as any },
      default: {},
    }),
  },
  actionBtnText: { fontSize: 11, fontWeight: "700", color: "#fff" },

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

  // Settings button (header)
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
  },
  settingsBtnText: { fontSize: 12, fontWeight: "600" },

  // Column editing
  columnTitleInput: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    color: "#fff",
    fontSize: 14,
    fontWeight: "700" as const,
  },
  colorDot: {
    width: 20,
    height: 20,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  colorDotInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
  },

  // Add column button (Trello-like)
  addColumnBtn: {
    width: 220,
    minHeight: 80,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed" as any,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: spacing.md,
    alignSelf: "flex-start" as const,
  },
  addColumnBtnText: { fontSize: 13, fontWeight: "600" as const },

  // Color picker grid (shared by color picker modal & add column modal)
  colorGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  colorGridItem: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  colorGridItemSelected: {
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.8)",
  },

  // Add column modal extras
  addColumnFieldLabel: {
    fontSize: 12,
    fontWeight: "600" as const,
    marginTop: spacing.sm,
  },
  addColumnPreview: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: 8,
    alignItems: "center" as const,
  },
  addColumnPreviewText: {
    color: "#fff",
    fontWeight: "700" as const,
    fontSize: 14,
  },
});
