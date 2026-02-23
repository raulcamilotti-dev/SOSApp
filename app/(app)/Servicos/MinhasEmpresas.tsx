/**
 * Minhas Empresas (Client) — Users can create/manage their companies.
 * Flow: Enter CNPJ → auto-fill from BrasilAPI → save → invite members (CPFs).
 * The creator becomes the company admin automatically.
 * Other invited CPFs see company properties once they create an account.
 */
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { CnpjDetail } from "@/components/ui/CnpjDetail";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import {
    formatCnpj,
    formatCpf,
    lookupCnpj,
    validateCnpj,
    validateCpf,
} from "@/services/brasil-api";
import {
    addCompanyMember,
    type Company,
    type CompanyMember,
    createCompany,
    listCompanies,
    listCompanyMembers,
    removeCompanyMember,
} from "@/services/companies";
import {  buildSearchParams, CRUD_ENDPOINT } from "@/services/crud";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

export default function MinhasEmpresasScreen() {
  const { user } = useAuth();
  const tenantId = user?.tenant_id ?? "";
  const userCpf = (user?.cpf ?? "").replace(/\D/g, "");

  const bgColor = useThemeColor({}, "background");
  const cardColor = useThemeColor({}, "card");
  const textColor = useThemeColor({}, "text");
  const mutedColor = useThemeColor({}, "muted");
  const tintColor = useThemeColor({}, "tint");
  const borderColor = useThemeColor({}, "border");

  /* ---- state ---- */
  const [companies, setCompanies] = useState<Company[]>([]);
  const [memberships, setMemberships] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create company modal
  const [showCreate, setShowCreate] = useState(false);
  const [cnpjInput, setCnpjInput] = useState("");
  const [cnpjLooking, setCnpjLooking] = useState(false);
  const [cnpjData, setCnpjData] = useState<Partial<Company> | null>(null);
  const [creating, setCreating] = useState(false);

  // CNPJ consultation modal
  const [showCnpjConsulta, setShowCnpjConsulta] = useState(false);

  // Invite member modal
  const [inviteCompanyId, setInviteCompanyId] = useState<string | null>(null);
  const [inviteCpf, setInviteCpf] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviting, setInviting] = useState(false);

  /* ---- load ---- */

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      // Get user's memberships
      const allMembers = await listCompanyMembers(undefined, tenantId);
      const myMemberships = allMembers.filter((m) => m.cpf === userCpf);
      setMemberships(myMemberships);

      // Get companies for those memberships
      const allCompanies = await listCompanies(tenantId);
      const myCompanyIds = new Set(myMemberships.map((m) => m.company_id));
      const myCompanies = allCompanies.filter((c) => myCompanyIds.has(c.id));
      setCompanies(myCompanies);
    } catch {
      setError("Erro ao carregar empresas");
    } finally {
      setLoading(false);
    }
  }, [tenantId, userCpf]);

  useEffect(() => {
    if (userCpf) loadData();
  }, [loadData, userCpf]);

  /* ---- CNPJ lookup for creation ---- */

  const handleCnpjLookup = async () => {
    const digits = cnpjInput.replace(/\D/g, "");
    if (digits.length !== 14 || !validateCnpj(digits)) {
      Alert.alert("CNPJ inválido", "Verifique o número digitado.");
      return;
    }
    try {
      setCnpjLooking(true);
      const data = await lookupCnpj(digits);
      if (data) {
        setCnpjData({
          cnpj: digits,
          razao_social: data.razao_social,
          nome_fantasia: data.nome_fantasia || undefined,
          email: data.email || undefined,
          phone: data.ddd_telefone_1 || undefined,
          address: data.logradouro || undefined,
          number: data.numero || undefined,
          complement: data.complemento || undefined,
          neighborhood: data.bairro || undefined,
          city: data.municipio || undefined,
          state: data.uf || undefined,
          postal_code: (data.cep ?? "").replace(/\D/g, "") || undefined,
        });
      } else {
        setCnpjData({ cnpj: digits, razao_social: "" });
      }
    } catch {
      setCnpjData({ cnpj: digits, razao_social: "" });
    } finally {
      setCnpjLooking(false);
    }
  };

  /* ---- create company ---- */

  const handleCreate = async () => {
    if (!cnpjData?.cnpj || !cnpjData.razao_social) {
      Alert.alert("Erro", "Razão social obrigatória.");
      return;
    }
    try {
      setCreating(true);
      const newCompany = await createCompany({
        ...cnpjData,
        tenant_id: tenantId,
        created_by: user?.id,
      });

      // Auto-add creator as admin
      await addCompanyMember({
        company_id: newCompany.id,
        user_id: user?.id,
        cpf: userCpf,
        role: "admin",
        invited_by: user?.id,
        tenant_id: tenantId,
      });

      setShowCreate(false);
      setCnpjInput("");
      setCnpjData(null);
      await loadData();
      Alert.alert("Sucesso", "Empresa criada! Você é o administrador.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao criar empresa";
      Alert.alert("Erro", msg);
    } finally {
      setCreating(false);
    }
  };

  /* ---- invite member ---- */

  const handleInvite = async () => {
    const digits = inviteCpf.replace(/\D/g, "");
    if (digits.length !== 11 || !validateCpf(digits)) {
      Alert.alert("CPF inválido", "Verifique o número digitado.");
      return;
    }
    if (!inviteCompanyId) return;
    try {
      setInviting(true);
      // Check if already member
      const existing = await listCompanyMembers(inviteCompanyId);
      if (existing.some((m) => m.cpf === digits)) {
        Alert.alert("Atenção", "Este CPF já é membro desta empresa.");
        return;
      }
      // Try auto-link user_id
      let userId: string | undefined;
      try {
        const usersRes = await api.post(CRUD_ENDPOINT, {
          action: "list",
          table: "users",
          ...buildSearchParams([{ field: "cpf", value: digits }]),
        });
        const data = usersRes.data;
        const users = Array.isArray(data)
          ? data
          : (data?.data ?? data?.value ?? []);
        const match = (users as Record<string, string>[]).find(
          (u) => (u.cpf ?? "").replace(/\D/g, "") === digits && !u.deleted_at,
        );
        if (match) userId = match.id;
      } catch {
        /* ignore */
      }

      await addCompanyMember({
        company_id: inviteCompanyId,
        user_id: userId,
        cpf: digits,
        role: inviteRole,
        invited_by: user?.id,
        tenant_id: tenantId,
      });

      setInviteCompanyId(null);
      setInviteCpf("");
      setInviteRole("member");
      await loadData();
      Alert.alert(
        "Sucesso",
        userId
          ? "Membro adicionado com conta vinculada!"
          : "Convite enviado! Quando o CPF criar conta, terá acesso automaticamente.",
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao convidar";
      Alert.alert("Erro", msg);
    } finally {
      setInviting(false);
    }
  };

  /* ---- remove member ---- */

  const handleRemoveMember = (memberId: string, cpf: string) => {
    Alert.alert(
      "Remover membro",
      `Deseja remover ${formatCpf(cpf)} desta empresa?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Remover",
          style: "destructive",
          onPress: async () => {
            try {
              await removeCompanyMember(memberId);
              await loadData();
            } catch {
              Alert.alert("Erro", "Não foi possível remover o membro.");
            }
          },
        },
      ],
    );
  };

  // Expand/collapse members per company (avoid hooks in render callbacks)
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(
    new Set(),
  );
  const [companyMembersMap, setCompanyMembersMap] = useState<
    Record<string, CompanyMember[]>
  >({});
  const [membersLoadingMap, setMembersLoadingMap] = useState<
    Record<string, boolean>
  >({});

  const toggleExpandCompany = async (companyId: string) => {
    const isExpanded = expandedCompanies.has(companyId);
    const next = new Set(expandedCompanies);
    if (isExpanded) {
      next.delete(companyId);
    } else {
      next.add(companyId);
      if (!companyMembersMap[companyId]) {
        setMembersLoadingMap((p) => ({ ...p, [companyId]: true }));
        try {
          const list = await listCompanyMembers(companyId);
          setCompanyMembersMap((p) => ({ ...p, [companyId]: list }));
        } catch {
          /* ignore */
        }
        setMembersLoadingMap((p) => ({ ...p, [companyId]: false }));
      }
    }
    setExpandedCompanies(next);
  };

  /* ---- helpers ---- */

  const getMembershipForCompany = (companyId: string) =>
    memberships.find((m) => m.company_id === companyId);

  /* ================================================================ */
  /*  Render company card (no hooks — state managed in parent)         */
  /* ================================================================ */

  const renderCompanyCard = ({ item }: { item: Company }) => {
    const membership = getMembershipForCompany(item.id);
    const isAdmin = membership?.role === "admin";
    const showMembers = expandedCompanies.has(item.id);
    const membersList = companyMembersMap[item.id] ?? [];
    const membersLoading = membersLoadingMap[item.id] ?? false;

    return (
      <View
        style={{
          backgroundColor: cardColor,
          borderRadius: 12,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: borderColor,
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: textColor }}
              numberOfLines={2}
            >
              {item.nome_fantasia || item.razao_social}
            </Text>
            <Text style={{ fontSize: 13, color: mutedColor, marginTop: 2 }}>
              {formatCnpj(item.cnpj)}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: isAdmin ? tintColor + "20" : "#6366f120",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 4,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: isAdmin ? tintColor : "#6366f1",
              }}
            >
              {isAdmin ? "👑 Admin" : "👤 Membro"}
            </Text>
          </View>
        </View>

        {/* Details */}
        {(item.city || item.state) && (
          <Text style={{ fontSize: 12, color: mutedColor, marginTop: 6 }}>
            📍 {[item.city, item.state].filter(Boolean).join("/")}
          </Text>
        )}

        {/* Actions */}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <TouchableOpacity
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: tintColor + "15",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 6,
              gap: 4,
            }}
            onPress={() => toggleExpandCompany(item.id)}
          >
            <Ionicons
              name={showMembers ? "chevron-up" : "people"}
              size={14}
              color={tintColor}
            />
            <Text style={{ fontSize: 12, color: tintColor, fontWeight: "600" }}>
              {showMembers ? "Ocultar" : "Membros"}
            </Text>
          </TouchableOpacity>

          {isAdmin && (
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#22c55e15",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 6,
                gap: 4,
              }}
              onPress={() => {
                setInviteCompanyId(item.id);
                setInviteCpf("");
                setInviteRole("member");
              }}
            >
              <Ionicons name="person-add" size={14} color="#22c55e" />
              <Text
                style={{ fontSize: 12, color: "#22c55e", fontWeight: "600" }}
              >
                Convidar
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Members list (expandable) */}
        {showMembers && (
          <View
            style={{
              marginTop: 10,
              borderTopWidth: 1,
              borderTopColor: borderColor,
              paddingTop: 10,
            }}
          >
            {membersLoading ? (
              <ActivityIndicator size="small" />
            ) : membersList.length === 0 ? (
              <Text style={{ fontSize: 12, color: mutedColor }}>
                Nenhum membro encontrado.
              </Text>
            ) : (
              membersList.map((m) => (
                <View
                  key={m.id}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 6,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, color: textColor }}>
                      {formatCpf(m.cpf)} {m.role === "admin" ? "👑" : "👤"}
                    </Text>
                    <Text style={{ fontSize: 11, color: mutedColor }}>
                      {m.user_id ? "Conta vinculada" : "⏳ Aguardando conta"}
                    </Text>
                  </View>
                  {isAdmin && m.cpf !== userCpf && (
                    <TouchableOpacity
                      onPress={() => handleRemoveMember(m.id, m.cpf)}
                    >
                      <Ionicons name="trash" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}
          </View>
        )}
      </View>
    );
  };

  /* ---- Create Company Modal ---- */

  const renderCreateModal = () => (
    <Modal
      visible={showCreate}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowCreate(false)}
    >
      <ScrollView
        style={{ flex: 1, backgroundColor: bgColor }}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 20,
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: "700", color: textColor }}>
            Nova Empresa
          </Text>
          <TouchableOpacity onPress={() => setShowCreate(false)}>
            <Ionicons name="close" size={24} color={mutedColor} />
          </TouchableOpacity>
        </View>

        {/* CNPJ Input */}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: textColor,
            marginBottom: 6,
          }}
        >
          CNPJ
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
          <TextInput
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              color: textColor,
              backgroundColor: cardColor,
            }}
            placeholder="00.000.000/0000-00"
            placeholderTextColor={mutedColor}
            value={cnpjInput}
            onChangeText={setCnpjInput}
            keyboardType="number-pad"
            maxLength={18}
          />
          <TouchableOpacity
            style={{
              backgroundColor: tintColor,
              paddingHorizontal: 16,
              borderRadius: 8,
              justifyContent: "center",
            }}
            onPress={handleCnpjLookup}
            disabled={cnpjLooking}
          >
            {cnpjLooking ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Auto-filled data */}
        {cnpjData && (
          <View style={{ gap: 12 }}>
            <View>
              <Text
                style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}
              >
                Razão Social *
              </Text>
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: borderColor,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: textColor,
                  backgroundColor: cardColor,
                }}
                value={cnpjData.razao_social ?? ""}
                onChangeText={(v) =>
                  setCnpjData((prev) => ({ ...prev, razao_social: v }))
                }
              />
            </View>

            {cnpjData.nome_fantasia !== undefined && (
              <View>
                <Text
                  style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}
                >
                  Nome Fantasia
                </Text>
                <Text style={{ fontSize: 15, color: textColor }}>
                  {cnpjData.nome_fantasia || "-"}
                </Text>
              </View>
            )}

            {(cnpjData.city || cnpjData.state) && (
              <View>
                <Text
                  style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}
                >
                  Localização
                </Text>
                <Text style={{ fontSize: 15, color: textColor }}>
                  {[cnpjData.city, cnpjData.state].filter(Boolean).join("/")}
                </Text>
              </View>
            )}

            {cnpjData.address && (
              <View>
                <Text
                  style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}
                >
                  Endereço
                </Text>
                <Text style={{ fontSize: 15, color: textColor }}>
                  {[cnpjData.address, cnpjData.number, cnpjData.neighborhood]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={{
                backgroundColor: tintColor,
                paddingVertical: 14,
                borderRadius: 10,
                alignItems: "center",
                marginTop: 10,
              }}
              onPress={handleCreate}
              disabled={creating}
            >
              {creating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}
                >
                  Cadastrar Empresa
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </Modal>
  );

  /* ---- Invite Member Modal ---- */

  const renderInviteModal = () => (
    <Modal
      visible={!!inviteCompanyId}
      animationType="slide"
      transparent
      onRequestClose={() => setInviteCompanyId(null)}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <View
          style={{
            backgroundColor: bgColor,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: 20,
            paddingBottom: 40,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: textColor,
              marginBottom: 16,
            }}
          >
            Convidar Membro
          </Text>

          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: textColor,
              marginBottom: 6,
            }}
          >
            CPF do novo membro
          </Text>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: borderColor,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 10,
              fontSize: 16,
              color: textColor,
              backgroundColor: cardColor,
              marginBottom: 12,
            }}
            placeholder="000.000.000-00"
            placeholderTextColor={mutedColor}
            value={inviteCpf}
            onChangeText={setInviteCpf}
            keyboardType="number-pad"
            maxLength={14}
          />

          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: textColor,
              marginBottom: 6,
            }}
          >
            Papel
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
            {(["member", "admin"] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 2,
                  borderColor: inviteRole === r ? tintColor : borderColor,
                  backgroundColor:
                    inviteRole === r ? tintColor + "15" : cardColor,
                  alignItems: "center",
                }}
                onPress={() => setInviteRole(r)}
              >
                <Text
                  style={{
                    fontWeight: "600",
                    color: inviteRole === r ? tintColor : textColor,
                  }}
                >
                  {r === "admin" ? "👑 Admin" : "👤 Membro"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: borderColor,
                alignItems: "center",
              }}
              onPress={() => setInviteCompanyId(null)}
            >
              <Text style={{ color: textColor }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 8,
                backgroundColor: tintColor,
                alignItems: "center",
              }}
              onPress={handleInvite}
              disabled={inviting}
            >
              {inviting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  Convidar
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  /* ---- Main ---- */

  if (loading) {
    return (
      <ThemedView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator size="large" color={tintColor} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1, backgroundColor: bgColor }}>
      {/* Header */}
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <ThemedText style={{ fontSize: 22, fontWeight: "700" }}>
          Minhas Empresas
        </ThemedText>
        <ThemedText style={{ fontSize: 13, color: mutedColor, marginTop: 4 }}>
          Gerencie suas empresas (CNPJ) e convide outros CPFs como membros.
        </ThemedText>
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: "#6366f1",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            gap: 6,
            marginTop: 10,
          }}
          onPress={() => setShowCnpjConsulta(true)}
        >
          <Ionicons name="search" size={16} color="#fff" />
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>
            Consultar CNPJ
          </Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#ef4444" }}>{error}</Text>
        </View>
      ) : null}

      {/* Company list */}
      <FlatList
        data={companies}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8 }}
        renderItem={renderCompanyCard}
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              paddingVertical: 40,
            }}
          >
            <Ionicons name="business-outline" size={48} color={mutedColor} />
            <Text
              style={{
                fontSize: 15,
                color: mutedColor,
                marginTop: 12,
                textAlign: "center",
              }}
            >
              Você ainda não está vinculado a nenhuma empresa.
            </Text>
          </View>
        }
      />

      {/* FAB: Create company */}
      <TouchableOpacity
        style={{
          position: "absolute",
          right: 20,
          bottom: 20,
          backgroundColor: tintColor,
          width: 56,
          height: 56,
          borderRadius: 28,
          justifyContent: "center",
          alignItems: "center",
          elevation: 5,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 4,
        }}
        onPress={() => setShowCreate(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {renderCreateModal()}
      {renderInviteModal()}

      {/* CNPJ Consultation Modal */}
      <Modal
        visible={showCnpjConsulta}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCnpjConsulta(false)}
      >
        <View style={{ flex: 1, backgroundColor: bgColor, padding: 16 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 18, fontWeight: "700", color: textColor }}>
              Consultar CNPJ
            </Text>
            <TouchableOpacity onPress={() => setShowCnpjConsulta(false)}>
              <Ionicons name="close" size={24} color={mutedColor} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <CnpjDetail
              showInput
              source="brasilapi"
              onAdd={async (cnpjData) => {
                try {
                  const cnpjRaw =
                    "cnpj" in cnpjData
                      ? String((cnpjData as any).cnpj ?? "")
                      : "";
                  const digits = cnpjRaw.replace(/\\D/g, "");
                  if (!digits) {
                    Alert.alert("Erro", "CNPJ não encontrado nos dados.");
                    return;
                  }
                  const newCompany = await createCompany({
                    tenant_id: tenantId,
                    cnpj: digits,
                    razao_social:
                      (cnpjData as any).razao_social ??
                      (cnpjData as any).nome ??
                      "Não informada",
                    nome_fantasia:
                      (cnpjData as any).nome_fantasia ??
                      (cnpjData as any).fantasia ??
                      undefined,
                    email: (cnpjData as any).email ?? undefined,
                    phone:
                      (cnpjData as any).ddd_telefone_1 ??
                      (cnpjData as any).telefone ??
                      undefined,
                    address: (cnpjData as any).logradouro ?? undefined,
                    city:
                      (cnpjData as any).municipio ??
                      (cnpjData as any).cidade ??
                      undefined,
                    state: (cnpjData as any).uf ?? undefined,
                    postal_code:
                      ((cnpjData as any).cep ?? "").replace(/\\D/g, "") ||
                      undefined,
                    created_by: user?.id,
                  });
                  await addCompanyMember({
                    company_id: newCompany.id,
                    user_id: user?.id,
                    cpf: userCpf,
                    role: "admin",
                    invited_by: user?.id,
                    tenant_id: tenantId,
                  });
                  setShowCnpjConsulta(false);
                  await loadData();
                  Alert.alert(
                    "Sucesso",
                    "Empresa adicionada! Você é o administrador.",
                  );
                } catch (e: unknown) {
                  const msg =
                    e instanceof Error
                      ? e.message
                      : "Erro ao adicionar empresa";
                  Alert.alert("Erro", msg);
                }
              }}
            />
          </ScrollView>
        </View>
      </Modal>
    </ThemedView>
  );
}
