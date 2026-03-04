/**
 * CRM KANBAN — Thin wrapper
 *
 * Routes to the unified kanban with scope="crm".
 * All kanban logic is in kanban-universal.tsx.
 */

import UnifiedKanbanScreen from "./kanban-universal";

export default function CrmKanbanScreen() {
  return <UnifiedKanbanScreen scope="crm" />;
}
