/**
 * Soft Delete Utilities
 * Funções auxiliares para gerenciar soft deletes no sistema
 */

export interface SoftDeletable {
  deleted_at?: string | null;
}

/**
 * Verifica se um registro foi deletado (soft deleted)
 */
export function isDeleted(item: SoftDeletable): boolean {
  return item.deleted_at != null;
}

/**
 * Verifica se um registro está ativo (não foi deletado)
 */
export function isActive(item: SoftDeletable): boolean {
  return !isDeleted(item);
}

/**
 * Filtra array para retornar apenas registros ativos
 */
export function filterActive<T extends SoftDeletable>(items: T[]): T[] {
  return items.filter(isActive);
}

/**
 * Filtra array para retornar apenas registros deletados
 */
export function filterDeleted<T extends SoftDeletable>(items: T[]): T[] {
  return items.filter(isDeleted);
}

/**
 * Obtém timestamp atual no formato ISO (para deletar)
 */
export function getNowTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Cria objeto de soft delete
 */
export function softDeletePayload(): Record<string, string> {
  return {
    deleted_at: getNowTimestamp(),
  };
}

/**
 * Cria objeto de restore (desfazer soft delete)
 */
export function softRestorePayload(): Record<string, null> {
  return {
    deleted_at: null,
  };
}

/**
 * Formata string SQL WHERE para filtrar registros não-deletados
 * Uso: SELECT * FROM users WHERE ${getSoftDeleteFilter()}
 */
export function getSoftDeleteFilter(tableAlias?: string): string {
  const col = tableAlias ? `${tableAlias}.deleted_at` : "deleted_at";
  return `${col} IS NULL`;
}

/**
 * Formata string SQL WHERE para incluir apenas registros deletados
 * Uso: SELECT * FROM users WHERE ${getDeletedFilter()}
 */
export function getDeletedFilter(tableAlias?: string): string {
  const col = tableAlias ? `${tableAlias}.deleted_at` : "deleted_at";
  return `${col} IS NOT NULL`;
}

/**
 * Exemplo de uso em API:
 *
 * // Listar ativos
 * const users = await api.post(ENDPOINT, {
 *   action: "list",
 *   table: "users",
 *   query: { "deleted_at": null }  // PostgreSQL null filter
 * });
 *
 * // Soft delete
 * const deleted = await api.post(ENDPOINT, {
 *   action: "update",
 *   table: "users",
 *   payload: { id: userId, ...softDeletePayload() }
 * });
 *
 * // Restore
 * const restored = await api.post(ENDPOINT, {
 *   action: "update",
 *   table: "users",
 *   payload: { id: userId, ...softRestorePayload() }
 * });
 *
 * // Ver deletados
 * const deleted = await api.post(ENDPOINT, {
 *   action: "list",
 *   table: "users",
 *   query: { "deleted_at": "NOT NULL" }
 * });
 */
