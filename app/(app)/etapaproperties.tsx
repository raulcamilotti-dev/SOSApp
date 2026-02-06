import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { useAuth } from "@/core/auth/AuthContext";
import { useThemeColor } from "@/hooks/use-theme-color";
import { api } from "@/services/api";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
	ActivityIndicator,
	ScrollView,
	TouchableOpacity,
	View,
} from "react-native";
import { styles } from "../theme/styles";

interface Property {
	id: string;
	address?: string | null;
	number?: string | null;
	city?: string | null;
	state?: string | null;
	[key: string]: any;
}

interface Stage {
	id: string;
	title: string;
	description: string;
}

export default function EtapaPropertiesScreen() {
	const { user } = useAuth();
	const router = useRouter();
	const { propertyId } = useLocalSearchParams<{ propertyId?: string }>();
	const [property, setProperty] = useState<Property | null>(null);
	const [loading, setLoading] = useState(true);

	const tintColor = useThemeColor({ light: "#0a7ea4", dark: "#fff" }, "tint");
	const mutedTextColor = useThemeColor(
		{ light: "#475569", dark: "#cbd5e1" },
		"text",
	);
	const cardBorderColor = useThemeColor(
		{ light: "#e5e7eb", dark: "#1f2937" },
		"text",
	);
	const cardBackground = useThemeColor(
		{ light: "#f8fafc", dark: "#0f172a" },
		"background",
	);

	const stages = useMemo<Stage[]>(
		() => [
			{
				id: "analise-documental",
				title: "Análise documental",
				description: "Avaliação da documentação do imóvel.",
			},
			{
				id: "levantamento-tecnico",
				title: "Levantamento técnico",
				description: "Planta, topografia e demais levantamentos.",
			},
			{
				id: "elaboracao-documentos",
				title: "Elaboração de documentos",
				description: "Produção dos documentos jurídicos e técnicos.",
			},
			{
				id: "tramitacao",
				title: "Trâmites em cartório",
				description: "Protocolos e acompanhamento em órgãos competentes.",
			},
			{
				id: "finalizacao",
				title: "Finalização",
				description: "Entrega da documentação regularizada.",
			},
		],
		[],
	);

	const resolveStageIndex = (data: Record<string, any> | null) => {
		const stageValue =
			data?.regularization_stage ??
			data?.current_stage ??
			data?.stage ??
			data?.etapa;
		if (typeof stageValue === "number") {
			return Math.max(0, Math.min(stages.length - 1, stageValue));
		}
		if (typeof stageValue === "string") {
			const normalized = stageValue.toLowerCase();
			const idx = stages.findIndex(
				(stage) =>
					stage.id === normalized || stage.title.toLowerCase() === normalized,
			);
			return idx >= 0 ? idx : 0;
		}
		return 0;
	};

	const currentStageIndex = resolveStageIndex(property);
	const currentStage = stages[currentStageIndex];

	const fetchProperty = async () => {
		if (!user?.id || !propertyId) return;
		try {
			setLoading(true);
			const response = await api.post("/property_list", { userId: user.id });
			const list = Array.isArray(response.data) ? response.data : [];
			const found = list.find((item: Property) => item.id === propertyId);
			setProperty(found ?? null);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchProperty();
	}, [user?.id, propertyId]);

	if (loading) {
		return (
			<ThemedView
				style={[
					styles.container,
					{ justifyContent: "center", alignItems: "center" },
				]}
			>
				<ActivityIndicator size="large" />
				<ThemedText style={{ marginTop: 12 }}>
					Carregando etapas...
				</ThemedText>
			</ThemedView>
		);
	}

	if (!property) {
		return (
			<ThemedView style={[styles.container, { justifyContent: "center" }]}>
				<ThemedText>Imóvel não encontrado</ThemedText>
				<TouchableOpacity
					onPress={() => router.back()}
					style={{ marginTop: 12 }}
				>
					<ThemedText style={{ color: tintColor, fontWeight: "600" }}>
						Voltar
					</ThemedText>
				</TouchableOpacity>
			</ThemedView>
		);
	}

	return (
		<ScrollView contentContainerStyle={{ padding: 16 }}>
			<ThemedView style={styles.processCard}>
				<ThemedText style={styles.processTitle}>
					{property.address || "Imóvel"}
				</ThemedText>
				<ThemedText style={styles.processSubtitle}>
					{property.city || ""} {property.state || ""}
				</ThemedText>

				<View style={styles.statusBadge}>
					<ThemedText style={styles.statusText}>
						Etapa atual: {currentStage?.title ?? "Não informado"}
					</ThemedText>
				</View>

				<View style={{ gap: 12 }}>
					{stages.map((stage, index) => {
						const status =
							index < currentStageIndex
								? "done"
								: index === currentStageIndex
									? "current"
									: "pending";

						const badgeColor =
							status === "done"
								? "#22c55e"
								: status === "current"
									? tintColor
									: "#cbd5e1";

						return (
							<View
								key={stage.id}
								style={{
									flexDirection: "row",
									alignItems: "flex-start",
									gap: 12,
									padding: 12,
									borderWidth: 1,
									borderColor: cardBorderColor,
									borderRadius: 8,
									backgroundColor: cardBackground,
								}}
							>
								<View
									style={{
										width: 12,
										height: 12,
										borderRadius: 6,
										backgroundColor: badgeColor,
										marginTop: 4,
									}}
								/>
								<View style={{ flex: 1 }}>
									<ThemedText style={{ fontWeight: "700", fontSize: 13 }}>
										{stage.title}
									</ThemedText>
									<ThemedText style={{ fontSize: 12, color: mutedTextColor }}>
										{stage.description}
									</ThemedText>
								</View>
							</View>
						);
					})}
				</View>
			</ThemedView>
		</ScrollView>
	);
}
