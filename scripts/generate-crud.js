const fs = require("fs");
const path = require("path");

function getArg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function parseJsonArg(name, fallback) {
  const raw = getArg(name, null);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (_err) {
    console.error(`Invalid JSON for --${name}`);
    process.exit(1);
  }
}

const name = getArg("name");
if (!name) {
  console.error("Missing --name");
  process.exit(1);
}

const title = getArg("title", name);
const description = getArg("description", "Gerenciamento");
const icon = getArg("icon", "layers-outline");
const listEndpoint = getArg("list");
const createEndpoint = getArg("create");
const updateEndpoint = getArg("update");
const route = getArg("route", `/Administrador/${name}`);
const fields = parseJsonArg("fields", []);

if (!listEndpoint || !createEndpoint || !updateEndpoint) {
  console.error("Missing --list, --create or --update endpoint");
  process.exit(1);
}

const workspace = path.resolve(process.cwd(), "..");
const servicesDir = path.join(workspace, "services");
const appAdminDir = path.join(workspace, "app", "(app)", "Administrador");
const adminPagesPath = path.join(workspace, "core", "admin", "admin-pages.ts");
const breadcrumbsPath = path.join(
  workspace,
  "core",
  "navigation",
  "breadcrumbs.ts",
);

const pascalName = name
  .replace(/(^\w|[-_]\w)/g, (m) => m.replace(/[-_]/, "").toUpperCase())
  .replace(/\s+/g, "");

const typeFields = fields
  .map((field) => {
    const fieldType =
      field.type === "json"
        ? "Record<string, unknown> | null"
        : "string | null";
    return `  ${field.key}?: ${fieldType};`;
  })
  .join("\n");

const servicePath = path.join(servicesDir, `${name}.ts`);
const screenPath = path.join(appAdminDir, `${name}.tsx`);

if (fs.existsSync(servicePath) || fs.existsSync(screenPath)) {
  console.error("Service or screen already exists.");
  process.exit(1);
}

const serviceContent = `import { createCrudService } from "./crud";

export type ${pascalName} = {
  id: string;
${typeFields}
};

const ENDPOINTS = {
  list: "${listEndpoint}",
  create: "${createEndpoint}",
  update: "${updateEndpoint}",
};

const service = createCrudService<${pascalName}>(ENDPOINTS);

export async function list${pascalName}(): Promise<${pascalName}[]> {
  return service.list();
}

export async function create${pascalName}(
  payload: Partial<${pascalName}>,
): Promise<${pascalName}> {
  return service.create(payload);
}

export async function update${pascalName}(
  payload: Partial<${pascalName}> & { id?: string | null },
): Promise<${pascalName}> {
  return service.update(payload);
}
`;

const fieldsLiteral = JSON.stringify(fields, null, 2)
  .replace(/"(key|label|placeholder|type|required|visibleInList)":/g, "$1:")
  .replace(/"/g, "'");

const screenContent = `import { CrudScreen, type CrudFieldConfig } from "@/components/ui/CrudScreen";
import {
  create${pascalName},
  list${pascalName},
  update${pascalName},
  type ${pascalName},
} from "@/services/${name}";

export default function ${pascalName}Screen() {
  const fields: CrudFieldConfig<${pascalName}>[] = ${fieldsLiteral};

  return (
    <CrudScreen<${pascalName}>
      title="${title}"
      subtitle="${description}"
      fields={fields}
      loadItems={list${pascalName}}
      createItem={create${pascalName}}
      updateItem={update${pascalName}}
      getId={(item) => item.id}
      getTitle={(item) => (item as any).company_name || (item as any).name || '${title}'}
    />
  );
}
`;

fs.writeFileSync(servicePath, serviceContent, "utf8");
fs.writeFileSync(screenPath, screenContent, "utf8");

if (fs.existsSync(adminPagesPath)) {
  const adminPages = fs.readFileSync(adminPagesPath, "utf8");
  const entry = `  {\n    id: "${name}",\n    title: "${title}",\n    description: "${description}",\n    icon: "${icon}",\n    route: "${route}",\n  },\n`;
  const updated = adminPages.replace(
    /export const ADMIN_PAGES: AdminPage\[] = \[/,
    (match) => `${match}\n${entry}`,
  );
  fs.writeFileSync(adminPagesPath, updated, "utf8");
}

if (fs.existsSync(breadcrumbsPath)) {
  const breadcrumbs = fs.readFileSync(breadcrumbsPath, "utf8");
  if (!breadcrumbs.includes(`${name}:`)) {
    const updated = breadcrumbs.replace(
      /};\s*$/,
      `  ${name}: "${title}",\n};\n`,
    );
    fs.writeFileSync(breadcrumbsPath, updated, "utf8");
  }
}

console.log("CRUD generated:");
console.log(`- Service: services/${name}.ts`);
console.log(`- Screen: app/(app)/Administrador/${name}.tsx`);
console.log("Admin hub and breadcrumbs updated.");
