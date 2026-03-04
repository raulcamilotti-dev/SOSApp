/**
 * KANBAN ADMINISTRATIVO — Thin wrapper
 *
 * Routes to the unified kanban with scope="administrative".
 * All kanban logic is in kanban-universal.tsx.
 */

import UnifiedKanbanScreen from "./kanban-universal";

export default function KanbanAdministrativoScreen() {
  return <UnifiedKanbanScreen scope="administrative" />;
}
