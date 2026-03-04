/**
 * SEPARAÇÃO DE PEDIDOS — Thin wrapper
 *
 * Routes to the unified kanban with scope="stock".
 * All kanban logic is in kanban-universal.tsx.
 */

import UnifiedKanbanScreen from "./kanban-universal";

export default function SeparacaoScreen() {
  return <UnifiedKanbanScreen scope="stock" />;
}
