import { createContext, useContext, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type ToastType = 'success' | 'error';

type UIContextType = {
  showToast: (msg: string, type?: ToastType) => void;
  showLoading: () => void;
  hideLoading: () => void;
};

const UIContext = createContext({} as UIContextType);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; type: ToastType } | null>(null);
  const [loading, setLoading] = useState(false);

  function showToast(msg: string, type: ToastType = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  }

  function showLoading() {
    setLoading(true);
  }

  function hideLoading() {
    setLoading(false);
  }

  return (
    <UIContext.Provider value={{ showToast, showLoading, hideLoading }}>
      {children}

      {loading && (
        <View style={styles.loading}>
          <Text style={styles.loadingText}>Carregando...</Text>
        </View>
      )}

      {toast && (
        <View
          style={[
            styles.toast,
            toast.type === 'error' ? styles.toastError : styles.toastSuccess,
          ]}
        >
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}

const styles = StyleSheet.create({
  loading: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(2,6,23,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: { color: '#fff', fontSize: 16 },
  toast: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    padding: 14,
    borderRadius: 12,
  },
  toastSuccess: { backgroundColor: '#16a34a' },
  toastError: { backgroundColor: '#dc2626' },
  toastText: { color: '#fff', textAlign: 'center', fontWeight: '600' },
});
