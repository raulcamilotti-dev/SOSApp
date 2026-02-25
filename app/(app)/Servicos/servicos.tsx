import { isRadulUser } from "@/core/auth/auth.utils";
import { useAuth } from "@/core/auth/AuthContext";
import { ADMIN_PANEL_PERMISSIONS } from "@/core/auth/permissions";
import { usePermissions } from "@/core/auth/usePermissions";
import {
    MODULE_KEYS,
    type ModuleKey,
    getServiceRouteModule,
} from "@/core/modules/module-config";
import { useTenantModules } from "@/core/modules/ModulesContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

/* ------------------------------------------------------------------ */
/*  Types & Data                                                       */
/* ------------------------------------------------------------------ */

type ServiceItem = {
  id: string;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  route: string;
  /** Module required (defaults to core) */
  module?: ModuleKey;
  /** If true, only shown to users with admin permissions */
  adminOnly?: boolean;
  /** Only visible to the Radul platform-root tenant */
  platformOnly?: boolean;
};

type ServiceGroup = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  items: ServiceItem[];
};

const SERVICE_GROUPS: ServiceGroup[] = [
  {
    key: "servicos",
    label: "Serviços",
    icon: "briefcase-outline",
    items: [
      {
        id: "solicitar",
        title: "Serviços e Agendamento",
        description: "Buscar serviços e profissionais e agendar",
        icon: "search-outline",
        route: "/Servicos/SolicitarServico",
      },
      {
        id: "meus_servicos",
        title: "Meus Serviços",
        description: "Acompanhe seus processos e agendamentos",
        icon: "clipboard-outline",
        route: "/Servicos/MeusServicos",
      },
      {
        id: "minha_agenda",
        title: "Minha Agenda",
        description:
          "Visualize sua agenda e sincronize com Google, Outlook ou Apple",
        icon: "calendar-outline",
        route: "/Servicos/MinhaAgenda",
      },
    ],
  },
  {
    key: "empresas",
    label: "Empresas",
    icon: "business-outline",
    items: [
      {
        id: "minhas_empresas",
        title: "Minhas Empresas",
        description: "Gerencie suas empresas (CNPJ) e membros vinculados",
        icon: "business-outline",
        route: "/Servicos/MinhasEmpresas",
      },
    ],
  },

  {
    key: "documentos",
    label: "Documentos",
    icon: "document-text-outline",
    items: [
      {
        id: "minhas_assinaturas",
        title: "Minhas Assinaturas",
        description: "Documentos pendentes de assinatura digital",
        icon: "create-outline",
        route: "/Servicos/MinhasAssinaturas",
        module: MODULE_KEYS.DOCUMENTS,
      },
    ],
  },
  {
    key: "info",
    label: "Informações",
    icon: "information-circle-outline",
    items: [
      {
        id: "atendimento",
        title: "Atendimento",
        description: "Converse com nossa assistente virtual",
        icon: "chatbubble-ellipses-outline",
        route: "/Servicos/atendimento",
      },
      {
        id: "ajuda",
        title: "Suporte & Ajuda",
        description: "Aprenda a usar o app e tire suas dúvidas",
        icon: "help-circle-outline",
        route: "/Servicos/Ajuda",
      },
    ],
  },
  {
    key: "parceiros",
    label: "Parceiros",
    icon: "people-outline",
    items: [
      {
        id: "parceiro_canal",
        title: "Parceiro de Canal",
        description: "Acompanhe indicacoes e comissoes",
        icon: "ribbon-outline",
        route: "/Servicos/ParceiroCanal",
        platformOnly: true,
      },
    ],
  },
  {
    key: "gestao",
    label: "Gestão",
    icon: "settings-outline",
    items: [
      {
        id: "admin",
        title: "Administração",
        description: "Gerenciar páginas administrativas",
        icon: "shield-checkmark-outline",
        route: "/Administrador",
        adminOnly: true,
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ServicosScreen() {
  const { user } = useAuth();
  const isRadul = isRadulUser(user);
  const { hasAnyPermission } = usePermissions();
  const { isModuleEnabled } = useTenantModules();
  const router = useRouter();
  const backgroundColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({ light: "#fff", dark: "#23283a" }, "card");
  const textColor = useThemeColor({}, "text");
  const mutedTextColor = useThemeColor({}, "muted");
  const borderColor = useThemeColor({}, "border");
  const tintColor = useThemeColor({}, "tint");
  const groupHeaderBg = useThemeColor(
    { light: "#f8f9fa", dark: "#1a1e2e" },
    "background",
  );

  const canAccessAdmin = hasAnyPermission(ADMIN_PANEL_PERMISSIONS);

  /* Filter groups & items by module + permissions */
  const visibleGroups = useMemo(() => {
    const result: ServiceGroup[] = [];

    for (const group of SERVICE_GROUPS) {
      const visibleItems = group.items.filter((item) => {
        if (item.platformOnly && !isRadul) return false;
        if (item.adminOnly && !canAccessAdmin) return false;
        const mod = item.module ?? getServiceRouteModule(item.route);
        if (!isModuleEnabled(mod)) return false;
        return true;
      });

      if (visibleItems.length > 0) {
        result.push({ ...group, items: visibleItems });
      }
    }

    return result;
  }, [canAccessAdmin, isModuleEnabled, isRadul]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: 16, paddingBottom: 40 }}>
        <Text
          style={{
            fontSize: 28,
            fontWeight: "bold",
            color: textColor,
            marginBottom: 20,
            marginTop: 16,
          }}
        >
          Serviços
        </Text>

        {visibleGroups.map((group) => (
          <View key={group.key} style={{ marginBottom: 20 }}>
            {/* Group header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
                paddingHorizontal: 4,
              }}
            >
              <Ionicons name={group.icon} size={18} color={tintColor} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "700",
                  color: tintColor,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {group.label}
              </Text>
            </View>

            {/* Items */}
            {group.items.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(item.route as any)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? groupHeaderBg : cardColor,
                  borderRadius: 14,
                  marginBottom: 8,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: pressed ? tintColor + "40" : borderColor,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  transform: [{ scale: pressed ? 0.985 : 1 }],
                })}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    backgroundColor: tintColor + "12",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Ionicons name={item.icon} size={20} color={tintColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: textColor,
                      fontSize: 16,
                      fontWeight: "600",
                      marginBottom: 2,
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text
                    style={{
                      color: mutedTextColor,
                      fontSize: 13,
                    }}
                  >
                    {item.description}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={mutedTextColor}
                />
              </Pressable>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
