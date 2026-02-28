/**
 * KANBAN ADMINISTRATIVO
 *
 * Thin wrapper that renders the shared ProcessKanbanScreen
 * with scope="administrative". This makes the customer picker
 * optional and filters workflow templates by administrative scope.
 *
 * Lives under the "Administrativo" menu group in admin navigation.
 */

import ProcessKanbanScreen from "./kanban-processos";

export default function KanbanAdministrativoScreen() {
  return <ProcessKanbanScreen scope="administrative" />;
}
