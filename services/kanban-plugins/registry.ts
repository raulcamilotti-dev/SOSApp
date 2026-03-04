/**
 * Kanban Plugin Registry — Maps workflow scope to plugin components.
 *
 * Each plugin is a React component that uses forwardRef + useImperativeHandle
 * to expose KanbanPluginRef methods. The unified kanban instantiates the
 * appropriate plugin based on the selected template's scope.
 *
 * Usage in kanban-universal.tsx:
 *   const PluginComponent = getPluginForScope(template.scope);
 *   <PluginComponent ref={pluginRef} {...pluginProps} />
 */

import type React from "react";
import type {
    KanbanPluginProps,
    KanbanPluginRef,
    WorkflowScope,
} from "./types";

/** Component type that every plugin must satisfy */
export type KanbanPluginComponent = React.ForwardRefExoticComponent<
  KanbanPluginProps & React.RefAttributes<KanbanPluginRef>
>;

/**
 * Returns the plugin component for the given workflow scope.
 * Falls back to OperationalPlugin for unknown scopes.
 *
 * Direct requires (not lazy) because:
 * 1. Plugin files are small (~200-500 lines each)
 * 2. React.lazy + forwardRef has type ergonomics issues
 * 3. Only one plugin is rendered at a time anyway
 */
export function getPluginForScope(
  scope: WorkflowScope | string,
): KanbanPluginComponent {
  switch (scope) {
    case "crm": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./crm");
      return mod.default ?? mod.CrmPlugin;
    }
    case "stock": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./stock");
      return mod.default ?? mod.StockPlugin;
    }
    case "operational":
    case "administrative":
    default: {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require("./operational");
      return mod.default ?? mod.OperationalPlugin;
    }
  }
}
