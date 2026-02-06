import { StyleSheet, FlatList, ActivityIndicator, RefreshControl } from 'react-native';
import { useEffect, useState } from 'react';

import * as SecureStore from 'expo-secure-store';

import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { api } from '@/services/api';
import { useThemeColor } from '@/hooks/use-theme-color';

interface Lawyer {
    id: string;
    name: string;
    specialty: string;
    phone: string;
    email: string;
}

export default function LawyersScreen() {

    const [lawyers, setLawyers] = useState<Lawyer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const tintColor = useThemeColor({ light: '#0a7ea4', dark: '#fff' }, 'tint');

    const fetchLawyers = async () => {
        try {
            setError(null);
            const token = await SecureStore.getItemAsync('token');
            const response = await api.get('/advogados', {
                headers: { Authorization: `Bearer ${token}` },
            });
            setLawyers(response.data);
        } catch (err) {
            setError('Falha ao carregar advogados. Tente novamente.');
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchLawyers();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        fetchLawyers();
    };

    if (loading) {
        return (
            <ThemedView style={styles.container}>
                <ActivityIndicator size="large" color={tintColor} />
            </ThemedView>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <ThemedText type="title" style={styles.title}>
                Advogados Parceiros
            </ThemedText>

            {error && (
                <ThemedView style={styles.errorBox}>
                    <ThemedText style={styles.errorText}>{error}</ThemedText>
                </ThemedView>
            )}

            <FlatList
                data={lawyers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                    <ThemedView style={styles.lawyerCard}>
                        <ThemedText type="subtitle">{item.name}</ThemedText>
                        <ThemedText style={styles.specialty}>{item.specialty}</ThemedText>
                        <ThemedText style={styles.contact}>📞 {item.phone}</ThemedText>
                        <ThemedText style={styles.contact}>✉️ {item.email}</ThemedText>
                    </ThemedView>
                )}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                ListEmptyComponent={
                    <ThemedText style={styles.empty}>Nenhum advogado encontrado</ThemedText>
                }
                scrollEnabled={false}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    title: {
        marginBottom: 16,
    },
    lawyerCard: {
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    specialty: {
        fontSize: 12,
        marginVertical: 4,
        opacity: 0.7,
    },
    contact: {
        fontSize: 12,
        marginTop: 4,
    },
    errorBox: {
        padding: 12,
        marginBottom: 12,
        borderRadius: 8,
        backgroundColor: '#fee',
    },
    errorText: {
        color: '#c00',
    },
    empty: {
        textAlign: 'center',
        marginTop: 24,
        opacity: 0.6,
    },
});