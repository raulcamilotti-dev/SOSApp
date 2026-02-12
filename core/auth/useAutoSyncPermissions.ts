import { useEffect } from "react";
import { syncPermissions } from "./permissions.sync";

/**
 * Hook que sincroniza permissões automaticamente ao iniciar o app.
 * Use no layout principal ou em AuthProvider.
 */
export function useAutoSyncPermissions(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function sync() {
      try {
        console.log("[AutoSync] Sincronizando permissões...");
        const result = await syncPermissions();
        if (cancelled) return;

        if (result.created > 0) {
          console.log(
            `[AutoSync] ✅ ${result.created} permissões criadas automaticamente`,
          );
        }

        if (result.errors.length > 0) {
          console.warn(
            `[AutoSync] ⚠️ ${result.errors.length} erros ao sincronizar:`,
            result.errors,
          );
        }

        console.log(
          `[AutoSync] Total: ${result.created + result.existing} permissões`,
        );
      } catch (err) {
        if (cancelled) return;
        console.error("[AutoSync] Falha ao sincronizar permissões:", err);
      }
    }

    // Aguarda 2 segundos após montar para não bloquear UI inicial
    const timer = setTimeout(sync, 2000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled]);
}
