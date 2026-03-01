/**
 * PDV — Ponto de Venda (Point of Sale)
 *
 * Custom screen for in-person sales: hierarchical category→item catalog,
 * cart, customer identification (3 levels), role-based discount validation,
 * split payment, PIX QR code + copy-paste, pre-sale import, and parallel
 * post-sale fulfillment paths.
 *
 * NOT a CrudScreen — fully custom UI optimized for speed.
 */

import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
  buildSearchParams,
  CRUD_ENDPOINT,
  normalizeCrudList,
} from "@/services/crud";
import { generatePixPayload, generatePixQRCodeBase64 } from "@/services/pix";
import {
  listPreSaleItems,
  listPreSales,
  markPreSaleClosed,
  type PreSale,
} from "@/services/pre-sales";
import {
  createSale,
  type CreateSaleResult,
  type SaleItemInput,
} from "@/services/sales";
import { Ionicons } from "@expo/vector-icons";
import * as ExpoClipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  SectionList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  item_kind: "product" | "service";
  sell_price: number;
  cost_price: number;
  sku?: string;
  barcode?: string;
  track_stock: boolean;
  stock_quantity: number;
  is_composition: boolean;
  requires_scheduling: boolean;
  requires_separation: boolean;
  requires_delivery: boolean;
  commission_percent: number;
  duration_minutes?: number;
  unit_id?: string;
  is_active: boolean;
  service_type_id?: string;
}

interface ServiceType {
  id: string;
  name: string;
  icon?: string;
  color?: string;
}

interface CartItem {
  catalogItem: CatalogItem;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
}

type PaymentMethodKey =
  | "pix"
  | "credit_card"
  | "debit_card"
  | "cash"
  | "a_prazo";
const PAYMENT_METHODS: {
  key: PaymentMethodKey;
  label: string;
  icon: string;
}[] = [
  { key: "pix", label: "PIX", icon: "qr-code-outline" },
  { key: "credit_card", label: "Crédito", icon: "card-outline" },
  { key: "debit_card", label: "Débito", icon: "card-outline" },
  { key: "cash", label: "Dinheiro", icon: "cash-outline" },
  { key: "a_prazo", label: "A Prazo", icon: "time-outline" },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const fmt = (n: number | string | null | undefined) =>
  `R$ ${Number(n || 0)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

export default function PDVScreen() {
  const { user, availableTenants } = useAuth();
  const router = useRouter();
  const tenantId = user?.tenant_id ?? "";
  const partnerId = (user as any)?.partner_id;

  // Role ID for discount rules
  const currentRoleId = useMemo(() => {
    if (!tenantId) return undefined;
    const t = availableTenants.find((at) => String(at.id) === String(tenantId));
    return t?.role_id;
  }, [tenantId, availableTenants]);

  /* Theme */
  const bg = useThemeColor({}, "background");
  const cardBg = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const errorColor = "#ef4444";
  const successColor = "#22c55e";
  const warningColor = "#f59e0b";

  /* State */
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Category navigation
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);

  // Customer identification
  const [customerMode, setCustomerMode] = useState<"none" | "cpf" | "name">(
    "none",
  );
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerName, setCustomerName] = useState("");

  // Discount
  const [discountPercent, setDiscountPercent] = useState("");
  const [maxDiscount, setMaxDiscount] = useState<number>(100);
  const [discountWarning, setDiscountWarning] = useState("");
  const [canEditPrice, setCanEditPrice] = useState(false);

  // Price editing
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(
    null,
  );
  const [editingPriceValue, setEditingPriceValue] = useState("");

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodKey>("pix");

  // Result modal
  const [result, setResult] = useState<CreateSaleResult | null>(null);

  // PIX
  const [pixBrCode, setPixBrCode] = useState<string | null>(null);
  const [pixQrImage, setPixQrImage] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);

  // Pre-sale import
  const [showPreSaleSearch, setShowPreSaleSearch] = useState(false);
  const [preSaleSearch, setPreSaleSearch] = useState("");
  const [preSaleResults, setPreSaleResults] = useState<PreSale[]>([]);
  const [searchingPreSale, setSearchingPreSale] = useState(false);
  const [importingPreSale, setImportingPreSale] = useState<string | null>(null);
  const [activePreSale, setActivePreSale] = useState<PreSale | null>(null);

  const searchRef = useRef<TextInput>(null);

  /* ---------------------------------------------------------------- */
  /*  Load catalog + service types                                     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    (async () => {
      try {
        const [svcRes, typesRes] = await Promise.all([
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "services",
            ...buildSearchParams(
              [
                { field: "tenant_id", value: tenantId },
                {
                  field: "is_active",
                  value: "true",
                  operator: "equal" as const,
                },
              ],
              { sortColumn: "name ASC", limit: 2000 },
            ),
          }),
          api.post(CRUD_ENDPOINT, {
            action: "list",
            table: "service_types",
            ...buildSearchParams(
              [
                { field: "tenant_id", value: tenantId },
                {
                  field: "is_active",
                  value: "true",
                  operator: "equal" as const,
                },
              ],
              { sortColumn: "name ASC", autoExcludeDeleted: true },
            ),
          }),
        ]);

        const items = normalizeCrudList<Record<string, unknown>>(svcRes.data)
          .filter((r) => !r.deleted_at)
          .map(
            (r) =>
              ({
                id: String(r.id),
                name: String(r.name ?? ""),
                description: r.description ? String(r.description) : undefined,
                item_kind: (r.item_kind as "product" | "service") ?? "service",
                sell_price: Number(r.sell_price ?? 0),
                cost_price: Number(r.cost_price ?? 0),
                sku: r.sku ? String(r.sku) : undefined,
                barcode: r.barcode ? String(r.barcode) : undefined,
                track_stock: Boolean(r.track_stock),
                stock_quantity: Number(r.stock_quantity ?? 0),
                is_composition: Boolean(r.is_composition),
                requires_scheduling: Boolean(r.requires_scheduling),
                requires_separation: Boolean(r.requires_separation),
                requires_delivery: Boolean(r.requires_delivery),
                commission_percent: Number(r.commission_percent ?? 0),
                duration_minutes: r.duration_minutes
                  ? Number(r.duration_minutes)
                  : undefined,
                unit_id: r.unit_id ? String(r.unit_id) : undefined,
                is_active: Boolean(r.is_active),
                service_type_id: r.service_type_id
                  ? String(r.service_type_id)
                  : undefined,
              }) as CatalogItem,
          );
        setCatalog(items);

        const types = normalizeCrudList<Record<string, unknown>>(typesRes.data)
          .filter((r) => !r.deleted_at)
          .map(
            (r) =>
              ({
                id: String(r.id),
                name: String(r.name ?? ""),
                icon: r.icon ? String(r.icon) : undefined,
                color: r.color ? String(r.color) : undefined,
              }) as ServiceType,
          );
        setServiceTypes(types);
      } catch (err) {
        console.error("PDV: load catalog error", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  /* ---------------------------------------------------------------- */
  /*  Load discount rules for current role                             */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!tenantId || !currentRoleId) {
      setMaxDiscount(0);
      return;
    }
    (async () => {
      try {
        const res = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "discount_rules",
          ...buildSearchParams(
            [
              { field: "tenant_id", value: tenantId },
              { field: "role_id", value: currentRoleId },
              { field: "is_active", value: "true", operator: "equal" as const },
            ],
            { autoExcludeDeleted: true },
          ),
        });
        const rules = normalizeCrudList<Record<string, unknown>>(res.data);
        if (rules.length > 0) {
          setMaxDiscount(Number(rules[0].max_discount_percent ?? 0));
          setCanEditPrice(Boolean(rules[0].can_edit_price));
        } else {
          setMaxDiscount(0);
          setCanEditPrice(false);
        }
      } catch {
        setMaxDiscount(0);
        setCanEditPrice(false);
      }
    })();
  }, [tenantId, currentRoleId]);

  /* ---------------------------------------------------------------- */
  /*  Discount validation                                              */
  /* ---------------------------------------------------------------- */

  const handleDiscountChange = useCallback(
    (val: string) => {
      setDiscountPercent(val);
      const pct = parseFloat(val) || 0;
      if (pct > maxDiscount) {
        setDiscountWarning(
          `Máximo permitido: ${maxDiscount}%. Desconto será limitado.`,
        );
      } else {
        setDiscountWarning("");
      }
    },
    [maxDiscount],
  );

  const effectiveDiscount = useMemo(() => {
    const pct = parseFloat(discountPercent) || 0;
    return Math.min(pct, maxDiscount);
  }, [discountPercent, maxDiscount]);

  /* ---------------------------------------------------------------- */
  /*  Search / Category filtering                                      */
  /* ---------------------------------------------------------------- */

  const filtered = useMemo(() => {
    let items = catalog;
    if (selectedTypeId) {
      items = items.filter((c) => c.service_type_id === selectedTypeId);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.sku?.toLowerCase().includes(q) ||
          c.barcode?.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q),
      );
    }
    return items;
  }, [catalog, search, selectedTypeId]);

  // Build SectionList data for hierarchical view (when no search/filter)
  const sectionData = useMemo(() => {
    if (search.trim() || selectedTypeId) return null;
    if (serviceTypes.length === 0) return null;

    const typeMap = new Map(serviceTypes.map((t) => [t.id, t]));
    const groups: Record<string, CatalogItem[]> = {};
    const uncategorized: CatalogItem[] = [];

    for (const item of catalog) {
      if (item.service_type_id && typeMap.has(item.service_type_id)) {
        if (!groups[item.service_type_id]) groups[item.service_type_id] = [];
        groups[item.service_type_id].push(item);
      } else {
        uncategorized.push(item);
      }
    }

    const sections: {
      title: string;
      color?: string;
      data: CatalogItem[];
    }[] = [];
    for (const st of serviceTypes) {
      if (groups[st.id] && groups[st.id].length > 0) {
        sections.push({
          title: st.name,
          color: st.color ?? undefined,
          data: groups[st.id],
        });
      }
    }
    if (uncategorized.length > 0) {
      sections.push({ title: "Outros", data: uncategorized });
    }
    return sections.length > 0 ? sections : null;
  }, [catalog, serviceTypes, search, selectedTypeId]);

  /* ---------------------------------------------------------------- */
  /*  Cart operations                                                  */
  /* ---------------------------------------------------------------- */

  const addToCart = useCallback((item: CatalogItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.catalogItem.id === item.id);
      if (existing) {
        return prev.map((c) =>
          c.catalogItem.id === item.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          catalogItem: item,
          quantity: 1,
          unitPrice: item.sell_price,
          discountAmount: 0,
        },
      ];
    });
  }, []);

  const updateCartQty = useCallback((itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.catalogItem.id === itemId
            ? { ...c, quantity: Math.max(0, c.quantity + delta) }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  }, []);

  const removeFromCart = useCallback((itemId: string) => {
    setCart((prev) => prev.filter((c) => c.catalogItem.id !== itemId));
  }, []);

  const updateCartPrice = useCallback((itemId: string, newPrice: number) => {
    setCart((prev) =>
      prev.map((c) =>
        c.catalogItem.id === itemId ? { ...c, unitPrice: newPrice } : c,
      ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setCustomerMode("none");
    setCustomerCpf("");
    setCustomerName("");
    setDiscountPercent("");
    setDiscountWarning("");
    setPaymentMethod("pix");
    setPixBrCode(null);
    setPixQrImage(null);
    setPixCopied(false);
    setActivePreSale(null);
    setEditingPriceItemId(null);
    setEditingPriceValue("");
  }, []);

  /* ---------------------------------------------------------------- */
  /*  Pre-sale import                                                  */
  /* ---------------------------------------------------------------- */

  const searchPreSales = useCallback(async () => {
    if (!tenantId) return;
    setSearchingPreSale(true);
    try {
      const allOpen = await listPreSales(tenantId, {
        status: "open",
        partnerId: partnerId ?? undefined,
      });
      const q = preSaleSearch.toLowerCase().trim();
      const results = q
        ? allOpen.filter(
            (ps) =>
              ps.label.toLowerCase().includes(q) ||
              ps.id.toLowerCase().includes(q),
          )
        : allOpen;
      setPreSaleResults(results);
    } catch {
      setPreSaleResults([]);
    } finally {
      setSearchingPreSale(false);
    }
  }, [tenantId, partnerId, preSaleSearch]);

  useEffect(() => {
    if (showPreSaleSearch) searchPreSales();
  }, [showPreSaleSearch, searchPreSales]);

  const handleImportPreSale = useCallback(
    async (ps: PreSale) => {
      setImportingPreSale(ps.id);
      try {
        const items = await listPreSaleItems(ps.id);
        if (items.length === 0) {
          setShowPreSaleSearch(false);
          setTimeout(
            () => Alert.alert("Comanda vazia", "Esta comanda não tem itens."),
            200,
          );
          return;
        }
        const newCart: CartItem[] = items.map((psi) => {
          const catItem = catalog.find((c) => c.id === psi.service_id);
          return {
            catalogItem: catItem ?? {
              id: psi.service_id,
              name: psi.description ?? "Item",
              item_kind: (psi as any).item_kind ?? "service",
              sell_price: Number(psi.unit_price),
              cost_price: Number((psi as any).cost_price ?? 0),
              track_stock: false,
              stock_quantity: 0,
              is_composition: false,
              requires_scheduling: false,
              requires_separation: false,
              requires_delivery: false,
              commission_percent: 0,
              is_active: true,
            },
            quantity: psi.quantity,
            unitPrice: Number(psi.unit_price),
            discountAmount: Number(psi.discount_amount ?? 0),
          };
        });
        setCart(newCart);
        setActivePreSale(ps);
        setShowPreSaleSearch(false);
        setPreSaleSearch("");
      } catch (err: any) {
        Alert.alert(
          "Erro",
          err?.message ?? "Não foi possível importar a comanda.",
        );
      } finally {
        setImportingPreSale(null);
      }
    },
    [catalog],
  );

  /* ---------------------------------------------------------------- */
  /*  Totals                                                           */
  /* ---------------------------------------------------------------- */

  const subtotal = useMemo(
    () => cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0),
    [cart],
  );
  const discountAmt = useMemo(
    () => (subtotal * effectiveDiscount) / 100,
    [subtotal, effectiveDiscount],
  );
  const total = useMemo(
    () => Math.max(0, subtotal - discountAmt),
    [subtotal, discountAmt],
  );

  /* ---------------------------------------------------------------- */
  /*  PIX generation                                                   */
  /* ---------------------------------------------------------------- */

  const generatePix = useCallback(
    async (amount: number, saleId: string) => {
      try {
        const tenantRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "tenants",
          ...buildSearchParams([{ field: "id", value: tenantId }]),
        });
        const tenants = normalizeCrudList<Record<string, unknown>>(
          tenantRes.data,
        );
        const tenant = tenants[0];
        if (!tenant) {
          Alert.alert(
            "PIX indisponível",
            "Não foi possível carregar as configurações do tenant. Verifique sua conexão.",
          );
          return;
        }

        const config =
          typeof tenant.config === "string"
            ? JSON.parse(tenant.config)
            : ((tenant.config as Record<string, unknown>) ?? {});
        const billing = (config.billing ?? {}) as Record<string, unknown>;
        const pixKey = String(billing.pix_key ?? "");
        const merchantName = String(
          billing.pix_merchant_name ?? tenant.company_name ?? "Loja",
        );
        const merchantCity = String(billing.pix_merchant_city ?? "Brasil");

        if (!pixKey) {
          Alert.alert(
            "PIX não configurado",
            "Chave PIX não encontrada. Configure em Administrador → Tenants → Config → billing → pix_key.",
          );
          return;
        }

        const txId = `V${saleId.replace(/-/g, "").slice(0, 20)}`;
        const pixParams = {
          pixKey,
          merchantName,
          merchantCity,
          amount,
          txId,
          description: "Venda PDV",
        };
        const brCode = generatePixPayload(pixParams);
        if (!brCode) {
          Alert.alert(
            "Erro ao gerar PIX",
            "Não foi possível gerar o código PIX. Verifique se a chave PIX está correta.",
          );
          return;
        }
        setPixBrCode(brCode);

        const qr = await generatePixQRCodeBase64(pixParams);
        if (!qr) {
          // BRCode worked but QR image failed — still usable via copy-paste
          console.warn("PDV: PIX QR image generation failed, BRCode available");
        }
        setPixQrImage(qr);
      } catch (err) {
        console.error("PDV: PIX generation error", err);
        Alert.alert(
          "Erro ao gerar PIX",
          "Ocorreu um erro inesperado ao gerar o código PIX. A venda foi registrada.",
        );
      }
    },
    [tenantId],
  );

  /* ---------------------------------------------------------------- */
  /*  Submit sale                                                      */
  /* ---------------------------------------------------------------- */

  const handleSubmit = useCallback(async () => {
    if (cart.length === 0) {
      Alert.alert("Carrinho vazio", "Adicione itens ao carrinho.");
      return;
    }
    const pctInput = parseFloat(discountPercent) || 0;
    if (pctInput > maxDiscount) {
      Alert.alert(
        "Desconto não permitido",
        `Seu limite de desconto é ${maxDiscount}%. Ajuste o valor.`,
      );
      return;
    }
    for (const ci of cart) {
      if (
        ci.catalogItem.item_kind === "product" &&
        ci.catalogItem.track_stock &&
        ci.quantity > ci.catalogItem.stock_quantity
      ) {
        Alert.alert(
          "Estoque insuficiente",
          `${ci.catalogItem.name}: apenas ${ci.catalogItem.stock_quantity} em estoque.`,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const items: SaleItemInput[] = cart.map((c) => ({
        serviceId: c.catalogItem.id,
        quantity: c.quantity,
        unitPrice: c.unitPrice,
        discountAmount: c.discountAmount,
      }));

      const customer: { id?: string; cpf?: string; name?: string } = {};
      if (customerMode === "cpf" && customerCpf.trim()) {
        customer.cpf = customerCpf.replace(/\D/g, "");
        if (customerName.trim()) customer.name = customerName.trim();
      } else if (customerMode === "name" && customerName.trim()) {
        customer.name = customerName.trim();
      }

      const saleResult = await createSale({
        tenantId,
        partnerId: partnerId ?? undefined,
        soldByUserId: user?.id ?? "",
        customer,
        items,
        discount:
          effectiveDiscount > 0 ? { percent: effectiveDiscount } : undefined,
        paymentMethod,
        notes: activePreSale ? `Pré-venda: ${activePreSale.label}` : undefined,
      });

      // Close the pre-sale if imported
      if (activePreSale) {
        try {
          await markPreSaleClosed(
            activePreSale.id,
            saleResult.sale.id,
            user?.id ?? "",
          );
        } catch {
          // non-blocking
        }
      }

      // Generate PIX QR for PIX payments
      if (paymentMethod === "pix" && Number(saleResult.sale.total) > 0) {
        await generatePix(Number(saleResult.sale.total), saleResult.sale.id);
      }

      setResult(saleResult);

      // Update local stock
      setCatalog((prev) =>
        prev.map((c) => {
          const cartItem = cart.find((ci) => ci.catalogItem.id === c.id);
          if (cartItem && c.track_stock) {
            return {
              ...c,
              stock_quantity: Math.max(0, c.stock_quantity - cartItem.quantity),
            };
          }
          return c;
        }),
      );

      setCart([]);
    } catch (err: any) {
      Alert.alert(
        "Erro na venda",
        err?.message ?? "Não foi possível concluir a venda.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    cart,
    tenantId,
    partnerId,
    user,
    customerMode,
    customerCpf,
    customerName,
    discountPercent,
    effectiveDiscount,
    maxDiscount,
    paymentMethod,
    activePreSale,
    generatePix,
  ]);

  /* ---------------------------------------------------------------- */
  /*  Copy PIX code                                                    */
  /* ---------------------------------------------------------------- */

  const handleCopyPix = useCallback(() => {
    if (!pixBrCode) return;
    try {
      if (Platform.OS === "web") {
        navigator.clipboard.writeText(pixBrCode);
      } else {
        ExpoClipboard.setStringAsync(pixBrCode);
      }
    } catch {
      // ignore
    }
    setPixCopied(true);
    setTimeout(() => setPixCopied(false), 3000);
  }, [pixBrCode]);

  /* ---------------------------------------------------------------- */
  /*  Render helpers                                                   */
  /* ---------------------------------------------------------------- */

  const renderCatalogItem = useCallback(
    ({ item }: { item: CatalogItem }) => {
      const badge = item.item_kind === "product" ? "📦" : "🔧";
      const compBadge = item.is_composition ? " 🎁" : "";
      const stockLabel =
        item.item_kind === "product" && item.track_stock
          ? ` | Est: ${item.stock_quantity}`
          : "";

      return (
        <Pressable
          onPress={() => addToCart(item)}
          style={({ pressed }) => ({
            backgroundColor: pressed ? tintColor + "18" : cardBg,
            borderRadius: 10,
            padding: 12,
            marginBottom: 6,
            borderWidth: 1,
            borderColor: pressed ? tintColor + "40" : borderColor,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          })}
        >
          <Text style={{ fontSize: 22 }}>{badge}</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{ color: textColor, fontWeight: "600", fontSize: 14 }}
              numberOfLines={1}
            >
              {item.name}
              {compBadge}
            </Text>
            <Text style={{ color: mutedColor, fontSize: 12 }}>
              {fmt(item.sell_price)}
              {stockLabel}
              {item.sku ? ` | ${item.sku}` : ""}
            </Text>
          </View>
          <Ionicons name="add-circle" size={24} color={tintColor} />
        </Pressable>
      );
    },
    [addToCart, cardBg, borderColor, textColor, mutedColor, tintColor],
  );

  const renderCartItem = useCallback(
    (ci: CartItem, _index: number) => {
      const itemTotal = ci.unitPrice * ci.quantity;
      const isEditingPrice = editingPriceItemId === ci.catalogItem.id;
      const priceChanged = ci.unitPrice !== ci.catalogItem.sell_price;
      return (
        <View
          key={ci.catalogItem.id}
          style={{
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: borderColor,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: textColor, fontWeight: "600", fontSize: 13 }}
                numberOfLines={1}
              >
                {ci.catalogItem.item_kind === "product" ? "📦 " : "🔧 "}
                {ci.catalogItem.name}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  marginTop: 2,
                }}
              >
                <Text style={{ color: mutedColor, fontSize: 12 }}>
                  {ci.quantity}x {fmt(ci.unitPrice)} = {fmt(itemTotal)}
                </Text>
                {canEditPrice && !isEditingPrice && (
                  <TouchableOpacity
                    onPress={() => {
                      setEditingPriceItemId(ci.catalogItem.id);
                      setEditingPriceValue(
                        ci.unitPrice.toFixed(2).replace(".", ","),
                      );
                    }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="pencil" size={14} color={tintColor} />
                  </TouchableOpacity>
                )}
                {priceChanged && !isEditingPrice && (
                  <Text
                    style={{
                      color: warningColor,
                      fontSize: 10,
                      fontWeight: "600",
                    }}
                  >
                    (catálogo: {fmt(ci.catalogItem.sell_price)})
                  </Text>
                )}
              </View>
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              <TouchableOpacity
                onPress={() => updateCartQty(ci.catalogItem.id, -1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: errorColor + "20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="remove" size={18} color={errorColor} />
              </TouchableOpacity>
              <Text
                style={{
                  color: textColor,
                  fontWeight: "700",
                  fontSize: 15,
                  minWidth: 28,
                  textAlign: "center",
                }}
              >
                {ci.quantity}
              </Text>
              <TouchableOpacity
                onPress={() => updateCartQty(ci.catalogItem.id, 1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: successColor + "20",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="add" size={18} color={successColor} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeFromCart(ci.catalogItem.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{
                  marginLeft: 6,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: errorColor + "12",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="trash-outline" size={18} color={errorColor} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline price editor */}
          {isEditingPrice && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
                paddingLeft: 4,
              }}
            >
              <Text style={{ color: mutedColor, fontSize: 12 }}>R$</Text>
              <TextInput
                value={editingPriceValue}
                onChangeText={(t) =>
                  setEditingPriceValue(t.replace(/[^\d.,]/g, ""))
                }
                keyboardType="decimal-pad"
                autoFocus
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: tintColor,
                  borderRadius: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  color: textColor,
                  fontSize: 13,
                  maxWidth: 120,
                }}
                onSubmitEditing={() => {
                  const parsed = parseFloat(
                    editingPriceValue.replace(",", "."),
                  );
                  if (!isNaN(parsed) && parsed >= 0) {
                    updateCartPrice(ci.catalogItem.id, parsed);
                  }
                  setEditingPriceItemId(null);
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  const parsed = parseFloat(
                    editingPriceValue.replace(",", "."),
                  );
                  if (!isNaN(parsed) && parsed >= 0) {
                    updateCartPrice(ci.catalogItem.id, parsed);
                  }
                  setEditingPriceItemId(null);
                }}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  backgroundColor: tintColor,
                  borderRadius: 6,
                }}
              >
                <Ionicons name="checkmark" size={16} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setEditingPriceItemId(null)}
                style={{
                  paddingHorizontal: 6,
                  paddingVertical: 4,
                }}
              >
                <Ionicons name="close" size={16} color={mutedColor} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      );
    },
    [
      borderColor,
      textColor,
      mutedColor,
      tintColor,
      warningColor,
      errorColor,
      successColor,
      canEditPrice,
      editingPriceItemId,
      editingPriceValue,
      updateCartQty,
      removeFromCart,
      updateCartPrice,
    ],
  );

  /* ---------------------------------------------------------------- */
  /*  Layout                                                           */
  /* ---------------------------------------------------------------- */

  const { width } = Dimensions.get("window");
  const isWide = width >= 768;

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </ThemedView>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Category chips                                                   */
  /* ---------------------------------------------------------------- */

  const categoryChips = serviceTypes.length > 0 && (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginBottom: 8, flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingRight: 8 }}
    >
      <Pressable
        onPress={() => setSelectedTypeId(null)}
        style={{
          backgroundColor: !selectedTypeId ? tintColor : "transparent",
          borderRadius: 16,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderWidth: 1,
          borderColor: !selectedTypeId ? tintColor : borderColor,
        }}
      >
        <Text
          style={{
            color: !selectedTypeId ? "#fff" : mutedColor,
            fontSize: 12,
            fontWeight: "600",
          }}
        >
          Todos
        </Text>
      </Pressable>
      {serviceTypes.map((st) => {
        const isActive = selectedTypeId === st.id;
        const chipColor = st.color || tintColor;
        return (
          <Pressable
            key={st.id}
            onPress={() => setSelectedTypeId(isActive ? null : st.id)}
            style={{
              backgroundColor: isActive ? chipColor : "transparent",
              borderRadius: 16,
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: isActive ? chipColor : borderColor,
            }}
          >
            <Text
              style={{
                color: isActive ? "#fff" : mutedColor,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {st.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  /* ---------------------------------------------------------------- */
  /*  Catalog panel                                                    */
  /* ---------------------------------------------------------------- */

  const catalogPanel = (
    <View
      style={{ flex: isWide ? 1 : undefined, height: isWide ? "100%" : 380 }}
    >
      {/* Search */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: cardBg,
          borderRadius: 10,
          borderWidth: 1,
          borderColor,
          paddingHorizontal: 12,
          marginBottom: 8,
        }}
      >
        <Ionicons name="search" size={18} color={mutedColor} />
        <TextInput
          ref={searchRef}
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar nome, SKU, barcode..."
          placeholderTextColor={mutedColor}
          style={{
            flex: 1,
            color: textColor,
            paddingVertical: 10,
            paddingHorizontal: 8,
            fontSize: 14,
          }}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color={mutedColor} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category chips */}
      {categoryChips}

      {/* Items list — SectionList when grouped, FlatList otherwise */}
      {sectionData && !search.trim() && !selectedTypeId ? (
        <SectionList
          sections={sectionData}
          keyExtractor={(item) => item.id}
          renderItem={renderCatalogItem}
          nestedScrollEnabled
          renderSectionHeader={({ section }) => (
            <View
              style={{
                backgroundColor: bg,
                paddingVertical: 6,
                paddingHorizontal: 4,
                marginTop: 4,
                borderLeftWidth: 3,
                borderLeftColor: (section as any).color ?? tintColor,
                paddingLeft: 8,
              }}
            >
              <Text
                style={{
                  color: (section as any).color ?? tintColor,
                  fontWeight: "700",
                  fontSize: 13,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                {section.title}
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled
          ListEmptyComponent={
            <Text
              style={{
                color: mutedColor,
                textAlign: "center",
                marginTop: 30,
                fontSize: 14,
              }}
            >
              Nenhum item encontrado
            </Text>
          }
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderCatalogItem}
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text
              style={{
                color: mutedColor,
                textAlign: "center",
                marginTop: 30,
                fontSize: 14,
              }}
            >
              Nenhum item encontrado
            </Text>
          }
        />
      )}
    </View>
  );

  /* ---------------------------------------------------------------- */
  /*  Cart panel                                                       */
  /* ---------------------------------------------------------------- */

  const cartPanel = (
    <View
      style={{
        flex: isWide ? 1 : undefined,
        backgroundColor: cardBg,
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor,
        ...(isWide ? {} : { marginTop: 12 }),
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            flex: 1,
          }}
        >
          <Text style={{ color: textColor, fontWeight: "700", fontSize: 16 }}>
            🛒 Carrinho ({cart.length})
          </Text>
          {activePreSale && (
            <Text
              style={{ color: tintColor, fontSize: 11, fontWeight: "500" }}
              numberOfLines={1}
            >
              — {activePreSale.label}
            </Text>
          )}
        </View>
        {cart.length > 0 && (
          <TouchableOpacity onPress={clearCart}>
            <Text
              style={{ color: errorColor, fontSize: 13, fontWeight: "600" }}
            >
              Limpar
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Import pre-sale button when cart is empty */}
      {cart.length === 0 && !activePreSale && (
        <TouchableOpacity
          onPress={() => {
            setPreSaleSearch("");
            setPreSaleResults([]);
            setShowPreSaleSearch(true);
          }}
          style={{
            borderWidth: 1,
            borderColor: tintColor + "40",
            borderRadius: 10,
            borderStyle: "dashed",
            paddingVertical: 10,
            paddingHorizontal: 14,
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "center",
            gap: 6,
            marginBottom: 10,
          }}
        >
          <Ionicons name="receipt-outline" size={16} color={tintColor} />
          <Text style={{ color: tintColor, fontSize: 13, fontWeight: "600" }}>
            Importar Pré-Venda
          </Text>
        </TouchableOpacity>
      )}

      {/* Items */}
      <ScrollView
        style={{ maxHeight: isWide ? 200 : 160, marginBottom: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {cart.length === 0 ? (
          <Text
            style={{ color: mutedColor, textAlign: "center", marginTop: 20 }}
          >
            Carrinho vazio
          </Text>
        ) : (
          cart.map((ci, i) => renderCartItem(ci, i))
        )}
      </ScrollView>

      {/* ---- Customer ID ---- */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{
            color: textColor,
            fontWeight: "600",
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          👤 Cliente
        </Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {(
            [
              { key: "none", label: "Anônimo" },
              { key: "cpf", label: "CPF" },
              { key: "name", label: "Nome" },
            ] as const
          ).map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => setCustomerMode(opt.key)}
              style={{
                backgroundColor:
                  customerMode === opt.key ? tintColor : "transparent",
                borderRadius: 16,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderWidth: 1,
                borderColor: customerMode === opt.key ? tintColor : borderColor,
              }}
            >
              <Text
                style={{
                  color: customerMode === opt.key ? "#fff" : mutedColor,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {customerMode === "cpf" && (
          <TextInput
            value={customerCpf}
            onChangeText={setCustomerCpf}
            placeholder="CPF do cliente"
            placeholderTextColor={mutedColor}
            keyboardType="numeric"
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              color: textColor,
              fontSize: 13,
              marginBottom: 4,
            }}
          />
        )}
        {(customerMode === "cpf" || customerMode === "name") && (
          <TextInput
            value={customerName}
            onChangeText={setCustomerName}
            placeholder="Nome do cliente"
            placeholderTextColor={mutedColor}
            style={{
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              color: textColor,
              fontSize: 13,
            }}
          />
        )}
      </View>

      {/* ---- Discount ---- */}
      <View style={{ marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text style={{ color: textColor, fontWeight: "600", fontSize: 13 }}>
            🏷️ Desconto %
          </Text>
          <TextInput
            value={discountPercent}
            onChangeText={handleDiscountChange}
            placeholder="0"
            placeholderTextColor={mutedColor}
            keyboardType="decimal-pad"
            style={{
              borderWidth: 1,
              borderColor: discountWarning ? warningColor : borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
              color: textColor,
              fontSize: 13,
              width: 70,
              textAlign: "center",
            }}
          />
          <Text style={{ color: mutedColor, fontSize: 11 }}>
            (Máx: {maxDiscount}%)
          </Text>
        </View>
        {!!discountWarning && (
          <Text style={{ color: warningColor, fontSize: 11, marginTop: 3 }}>
            ⚠️ {discountWarning}
          </Text>
        )}
      </View>

      {/* ---- Payment method ---- */}
      <View style={{ marginBottom: 10 }}>
        <Text
          style={{
            color: textColor,
            fontWeight: "600",
            fontSize: 13,
            marginBottom: 6,
          }}
        >
          💳 Pagamento
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {PAYMENT_METHODS.map((pm) => {
            const isActive = paymentMethod === pm.key;
            return (
              <Pressable
                key={pm.key}
                onPress={() => setPaymentMethod(pm.key)}
                style={{
                  backgroundColor: isActive ? tintColor : "transparent",
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: isActive ? tintColor : borderColor,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Ionicons
                  name={pm.icon as any}
                  size={14}
                  color={isActive ? "#fff" : mutedColor}
                />
                <Text
                  style={{
                    color: isActive ? "#fff" : mutedColor,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {pm.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ---- Totals ---- */}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: borderColor,
          paddingTop: 10,
          gap: 4,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: mutedColor, fontSize: 13 }}>Subtotal</Text>
          <Text style={{ color: textColor, fontSize: 13 }}>
            {fmt(subtotal)}
          </Text>
        </View>
        {discountAmt > 0 && (
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text style={{ color: errorColor, fontSize: 13 }}>
              Desconto ({effectiveDiscount}%)
            </Text>
            <Text style={{ color: errorColor, fontSize: 13 }}>
              - {fmt(discountAmt)}
            </Text>
          </View>
        )}
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: textColor, fontWeight: "700", fontSize: 18 }}>
            Total
          </Text>
          <Text style={{ color: tintColor, fontWeight: "700", fontSize: 18 }}>
            {fmt(total)}
          </Text>
        </View>
      </View>

      {/* ---- Submit ---- */}
      <TouchableOpacity
        onPress={handleSubmit}
        disabled={submitting || cart.length === 0}
        style={{
          backgroundColor: cart.length === 0 ? mutedColor : tintColor,
          borderRadius: 12,
          paddingVertical: 14,
          marginTop: 12,
          alignItems: "center",
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
            Finalizar Venda
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );

  /* ---------------------------------------------------------------- */
  /*  Result modal (with PIX QR)                                       */
  /* ---------------------------------------------------------------- */

  const resultModal = (
    <Modal
      visible={!!result}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setResult(null);
        clearCart();
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: "center",
            alignItems: "center",
          }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={{
              backgroundColor: cardBg,
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 420,
            }}
          >
            <Text
              style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}
            >
              ✅
            </Text>
            <Text
              style={{
                color: textColor,
                fontWeight: "700",
                fontSize: 20,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Venda Concluída!
            </Text>
            {result && (
              <View style={{ gap: 4, marginBottom: 16 }}>
                <Text
                  style={{
                    color: mutedColor,
                    fontSize: 14,
                    textAlign: "center",
                  }}
                >
                  Total: {fmt(result.sale.total)}
                </Text>
                <Text
                  style={{
                    color: mutedColor,
                    fontSize: 13,
                    textAlign: "center",
                  }}
                >
                  Venda #{result.sale.id.slice(0, 8)}
                </Text>
                {result.pendingScheduling.length > 0 && (
                  <Text
                    style={{
                      color: warningColor,
                      fontSize: 13,
                      textAlign: "center",
                      marginTop: 6,
                    }}
                  >
                    ⚠️ {result.pendingScheduling.length} serviço(s) aguardando
                    agendamento
                  </Text>
                )}
              </View>
            )}

            {/* ---- PIX QR code section ---- */}
            {paymentMethod === "pix" && (pixQrImage || pixBrCode) && (
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: borderColor,
                  paddingTop: 16,
                  marginBottom: 16,
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    color: textColor,
                    fontWeight: "700",
                    fontSize: 16,
                  }}
                >
                  📱 Pagamento PIX
                </Text>

                {pixQrImage && (
                  <View
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <Image
                      source={{ uri: pixQrImage }}
                      style={{ width: 200, height: 200 }}
                      resizeMode="contain"
                    />
                  </View>
                )}

                {pixBrCode && (
                  <View style={{ width: "100%", gap: 8 }}>
                    <Text
                      style={{
                        color: mutedColor,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      Ou copie o código PIX:
                    </Text>
                    <Pressable
                      onPress={handleCopyPix}
                      style={{
                        backgroundColor: bg,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor,
                        padding: 10,
                      }}
                    >
                      <Text
                        style={{
                          color: mutedColor,
                          fontSize: 10,
                          fontFamily:
                            Platform.OS === "web" ? "monospace" : undefined,
                        }}
                        numberOfLines={3}
                        selectable
                      >
                        {pixBrCode}
                      </Text>
                    </Pressable>
                    <TouchableOpacity
                      onPress={handleCopyPix}
                      style={{
                        backgroundColor: pixCopied ? successColor : tintColor,
                        borderRadius: 10,
                        paddingVertical: 10,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name={pixCopied ? "checkmark" : "copy-outline"}
                        size={16}
                        color="#fff"
                      />
                      <Text
                        style={{
                          color: "#fff",
                          fontWeight: "700",
                          fontSize: 14,
                        }}
                      >
                        {pixCopied ? "Copiado!" : "Copiar Código PIX"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}

            {/* ---- Action buttons ---- */}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setResult(null);
                  clearCart();
                }}
                style={{
                  flex: 1,
                  backgroundColor: tintColor,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Nova Venda
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setResult(null);
                  clearCart();
                  router.back();
                }}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor,
                  borderRadius: 10,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: textColor, fontWeight: "600" }}>
                  Sair
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );

  /* ---------------------------------------------------------------- */
  /*  Pre-sale search modal                                            */
  /* ---------------------------------------------------------------- */

  const preSaleModal = (
    <Modal
      visible={showPreSaleSearch}
      transparent
      animationType="fade"
      onRequestClose={() => setShowPreSaleSearch(false)}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
        }}
      >
        <View
          style={{
            backgroundColor: cardBg,
            borderRadius: 16,
            padding: 20,
            width: "100%",
            maxWidth: 420,
            maxHeight: "80%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <Text style={{ color: textColor, fontWeight: "700", fontSize: 17 }}>
              📋 Importar Pré-Venda
            </Text>
            <TouchableOpacity onPress={() => setShowPreSaleSearch(false)}>
              <Ionicons name="close-circle" size={26} color={mutedColor} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: bg,
              borderRadius: 10,
              borderWidth: 1,
              borderColor,
              paddingHorizontal: 12,
              marginBottom: 12,
            }}
          >
            <Ionicons name="search" size={18} color={mutedColor} />
            <TextInput
              value={preSaleSearch}
              onChangeText={setPreSaleSearch}
              placeholder="Buscar por nome ou número..."
              placeholderTextColor={mutedColor}
              style={{
                flex: 1,
                color: textColor,
                paddingVertical: 10,
                paddingHorizontal: 8,
                fontSize: 14,
              }}
              autoCapitalize="none"
              autoFocus
              onSubmitEditing={searchPreSales}
            />
          </View>

          {/* Results */}
          {searchingPreSale ? (
            <ActivityIndicator color={tintColor} style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={preSaleResults}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text
                  style={{
                    color: mutedColor,
                    textAlign: "center",
                    marginTop: 20,
                    fontSize: 14,
                  }}
                >
                  Nenhuma comanda aberta encontrada
                </Text>
              }
              renderItem={({ item: ps }) => {
                const isImporting = importingPreSale === ps.id;
                return (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => !isImporting && handleImportPreSale(ps)}
                    style={{
                      backgroundColor: bg,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 6,
                      borderWidth: 1,
                      borderColor,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      opacity: isImporting ? 0.5 : 1,
                    }}
                  >
                    <Ionicons name="receipt" size={22} color={successColor} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: textColor,
                          fontWeight: "600",
                          fontSize: 14,
                        }}
                      >
                        {ps.label}
                      </Text>
                      <Text style={{ color: mutedColor, fontSize: 12 }}>
                        {fmt(ps.total)} — #{ps.id.slice(0, 8)}
                      </Text>
                    </View>
                    {isImporting ? (
                      <ActivityIndicator size="small" color={tintColor} />
                    ) : (
                      <Ionicons
                        name="arrow-forward-circle"
                        size={24}
                        color={tintColor}
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );

  /* ---------------------------------------------------------------- */
  /*  Main                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 16 }}>
        {/* Title */}
        <Text
          style={{
            color: textColor,
            fontWeight: "bold",
            fontSize: 24,
            marginBottom: 12,
          }}
        >
          🛒 Ponto de Venda
        </Text>

        {isWide ? (
          <View style={{ flex: 1, flexDirection: "row", gap: 16 }}>
            {catalogPanel}
            {cartPanel}
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false}>
            {catalogPanel}
            {cartPanel}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>
      {resultModal}
      {preSaleModal}
    </KeyboardAvoidingView>
  );
}
