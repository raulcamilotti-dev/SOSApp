/**
 * KANBAN DE PROCESSOS — Thin wrapper
 *
 * Routes to the unified kanban with scope="operational".
 * All kanban logic is in kanban-universal.tsx.
 */

import UnifiedKanbanScreen from "./kanban-universal";

export default function ProcessKanbanScreen() {
  return <UnifiedKanbanScreen scope="operational" />;
}
