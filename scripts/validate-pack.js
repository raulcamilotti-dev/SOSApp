#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════
 * PACK VALIDATOR CLI — Radul Platform
 * ══════════════════════════════════════════════════════════
 *
 * Validates Template Pack and Agent Pack files for structural
 * consistency, unique ref_keys, valid cross-references,
 * required fields, and best practices.
 *
 * Runs 100% OFFLINE — no API calls, no database access.
 *
 * Supports:
 *   - JSON files (.json)
 *   - TypeScript pack files (.ts) — requires `tsx` globally installed
 *   - All registered packs via --all flag
 *
 * Usage:
 *   node scripts/validate-pack.js <path-to-pack>
 *   node scripts/validate-pack.js data/template-packs/pet-shop.ts
 *   node scripts/validate-pack.js ./exported-pack.json
 *   node scripts/validate-pack.js --all
 *   node scripts/validate-pack.js --verbose <path>
 *   node scripts/validate-pack.js --help
 *
 * Exit codes:
 *   0 = valid (with or without warnings)
 *   1 = validation errors found
 *   2 = file not found or load error
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/* ══════════════════════════════════════════════════════════
 * CONFIG & CONSTANTS
 * ══════════════════════════════════════════════════════════ */

const VALID_MODULE_KEYS = new Set([
  "core",
  "documents",
  "onr_cartorio",
  "partners",
  "ai_automation",
  "bi_analytics",
  "crm",
  "financial",
  "time_tracking",
  "client_portal",
  "pdv",
  "products",
  "stock",
  "purchases",
  "delivery",
]);

const VALID_PRIORITIES = new Set([
  "low",
  "medium",
  "high",
  "urgent",
  "critical",
]);

const VALID_FIELD_TYPES = new Set([
  "text",
  "multiline",
  "number",
  "currency",
  "boolean",
  "date",
  "datetime",
  "select",
  "reference",
  "json",
  "email",
  "phone",
  "url",
  "masked",
]);

const VALID_MASK_TYPES = new Set(["cpf", "cnpj", "cep", "phone", "cpf_cnpj"]);

/** Ionicons icon names are validated loosely — just check format */
const ICON_REGEX = /^[a-z][a-z0-9-]*$/;

/** Hex color regex */
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

/** ref_key format: snake_case, alphanumeric + underscores */
const REF_KEY_REGEX = /^[a-z][a-z0-9_]*$/;

/** Semver regex (simplified) */
const SEMVER_REGEX = /^\d+\.\d+\.\d+$/;

/* ══════════════════════════════════════════════════════════
 * TERMINAL STYLING
 * ══════════════════════════════════════════════════════════ */

const isCI = process.env.CI || process.env.NO_COLOR;
const colorize = (text, code) => (isCI ? text : `\x1b[${code}m${text}\x1b[0m`);
const red = (t) => colorize(t, 31);
const green = (t) => colorize(t, 32);
const yellow = (t) => colorize(t, 33);
const cyan = (t) => colorize(t, 36);
const bold = (t) => colorize(t, 1);
const dim = (t) => colorize(t, 2);

/* ══════════════════════════════════════════════════════════
 * PACK LOADER
 * ══════════════════════════════════════════════════════════ */

/**
 * Load a pack from file path.
 * Supports .json (direct) and .ts (via tsx).
 */
function loadPack(filePath) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`Arquivo não encontrado: ${absPath}`);
  }

  const ext = path.extname(absPath).toLowerCase();

  if (ext === ".json") {
    const raw = fs.readFileSync(absPath, "utf-8");
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error(`JSON inválido em ${absPath}: ${e.message}`);
    }
  }

  if (ext === ".ts" || ext === ".tsx") {
    return loadTypeScriptPack(absPath);
  }

  throw new Error(`Formato não suportado: ${ext}. Use .json ou .ts`);
}

/**
 * Load a TypeScript pack file by:
 * 1. Trying `tsx` (fast, no config needed)
 * 2. Trying `ts-node` (common)
 * 3. Fallback: evaluate as module
 */
function loadTypeScriptPack(absPath) {
  // Strategy 1: Use tsx to evaluate and print the default export as JSON
  const extractScript = `
    const m = require(${JSON.stringify(absPath)});
    const pack = m.default || m;
    process.stdout.write(JSON.stringify(pack));
  `;

  // Try tsx first
  for (const runner of ["tsx", "ts-node"]) {
    try {
      const result = execSync(
        `npx --yes ${runner} -e ${JSON.stringify(extractScript)}`,
        {
          encoding: "utf-8",
          timeout: 30000,
          cwd: path.dirname(absPath),
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            // Ensure TypeScript path aliases work
            NODE_OPTIONS: "",
          },
        },
      );
      const trimmed = result.trim();
      if (trimmed) {
        return JSON.parse(trimmed);
      }
    } catch {
      // Try next runner
    }
  }

  // Strategy 2: Try to read as JS-like content (strip type annotations)
  try {
    const content = fs.readFileSync(absPath, "utf-8");
    // Very basic: try to extract the JSON-like object from the file
    // This handles simple packs where the const = { ... } is clean
    const match = content.match(
      /(?:const\s+\w+\s*(?::\s*\w+)?\s*=\s*)([\s\S]*?);\s*(?:export\s+default|$)/,
    );
    if (match && match[1]) {
      // Try to evaluate the object literal (risky but works for simple cases)
      const obj = new Function(`return (${match[1].trim()})`)();
      if (obj && typeof obj === "object" && obj.metadata) {
        return obj;
      }
    }
  } catch {
    // Fall through
  }

  throw new Error(
    `Não foi possível carregar ${absPath}.\n` +
      `  Instale tsx globalmente: npm install -g tsx\n` +
      `  Ou exporte como JSON: use o recurso "Exportar Pack" no admin.`,
  );
}

/* ══════════════════════════════════════════════════════════
 * VALIDATION ENGINE
 * ══════════════════════════════════════════════════════════ */

class PackValidator {
  constructor(pack, fileName, verbose = false) {
    this.pack = pack;
    this.fileName = fileName;
    this.verbose = verbose;
    this.errors = [];
    this.warnings = [];
    this.info = [];

    // Ref key registries
    this.allRefKeys = new Set();
    this.categoryRefs = new Set();
    this.serviceTypeRefs = new Set();
    this.workflowRefs = new Set();
    this.stepRefs = new Set();
    this.stepRefToTemplate = new Map(); // step_ref → workflow ref_key
    this.roleRefs = new Set();
    this.docTemplateRefs = new Set();
    this.customFieldRefs = new Set();
    this.serviceRefs = new Set();
  }

  error(msg) {
    this.errors.push(msg);
  }

  warn(msg) {
    this.warnings.push(msg);
  }

  log(msg) {
    if (this.verbose) {
      this.info.push(msg);
    }
  }

  /**
   * Returns true if this pack is the base/default pack ("padrao").
   * Base packs are expected to have empty categories, types, and services
   * because they serve as a minimal shell for onboarding.
   */
  isBasePack() {
    return this.pack?.metadata?.key === "padrao";
  }

  /* ── Main entry point ── */
  validate() {
    this.log("Iniciando validação...");

    // Phase 1: Structure
    this.validateTopLevelStructure();
    if (this.errors.length > 0) {
      // If basic structure is broken, skip detailed checks
      return this.result();
    }

    // Phase 2: Metadata
    this.validateMetadata();

    // Phase 3: Tenant config
    this.validateTenantConfig();

    // Phase 4: Modules
    this.validateModules();

    // Phase 5: Collect all ref_keys (before cross-reference checks)
    this.collectRefKeys();

    // Phase 6: Check uniqueness
    this.validateRefKeyUniqueness();

    // Phase 7: Service categories
    this.validateServiceCategories();

    // Phase 8: Service types
    this.validateServiceTypes();

    // Phase 9: Workflow templates
    this.validateWorkflowTemplates();

    // Phase 10: Deadline rules
    this.validateDeadlineRules();

    // Phase 11: Step task templates
    this.validateStepTaskTemplates();

    // Phase 12: Step forms
    this.validateStepForms();

    // Phase 13: Document templates
    this.validateDocumentTemplates();

    // Phase 14: Roles
    this.validateRoles();

    // Phase 15: Services
    this.validateServices();

    // Phase 16: OCR configs (optional)
    this.validateOcrConfigs();

    // Phase 17: Custom fields (optional)
    this.validateCustomFields();

    // Phase 18: Best practices
    this.validateBestPractices();

    return this.result();
  }

  result() {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      info: this.info,
    };
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 1: Top-level structure                          */
  /* ────────────────────────────────────────────────────── */

  validateTopLevelStructure() {
    const p = this.pack;

    if (!p || typeof p !== "object") {
      this.error("Pack não é um objeto válido");
      return;
    }

    const requiredArrays = [
      "service_categories",
      "service_types",
      "workflow_templates",
      "deadline_rules",
      "step_task_templates",
      "step_forms",
      "document_templates",
      "roles",
      "services",
    ];

    if (!p.metadata || typeof p.metadata !== "object") {
      this.error("Campo obrigatório ausente: metadata");
    }

    if (!p.tenant_config || typeof p.tenant_config !== "object") {
      this.error("Campo obrigatório ausente: tenant_config");
    }

    if (!Array.isArray(p.modules)) {
      this.error("Campo obrigatório ausente: modules (deve ser array)");
    }

    for (const key of requiredArrays) {
      if (!Array.isArray(p[key])) {
        this.error(
          `Campo obrigatório ausente: ${key} (deve ser array, recebeu ${typeof p[key]})`,
        );
      }
    }

    // Optional arrays
    if (p.ocr_configs !== undefined && !Array.isArray(p.ocr_configs)) {
      this.error("ocr_configs deve ser array ou undefined");
    }
    if (p.custom_fields !== undefined && !Array.isArray(p.custom_fields)) {
      this.error("custom_fields deve ser array ou undefined");
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 2: Metadata                                     */
  /* ────────────────────────────────────────────────────── */

  validateMetadata() {
    const m = this.pack.metadata;
    if (!m) return;

    this.requireString(m, "key", "metadata");
    this.requireString(m, "name", "metadata");
    this.requireString(m, "description", "metadata");
    this.requireString(m, "icon", "metadata");
    this.requireString(m, "color", "metadata");
    this.requireString(m, "version", "metadata");

    if (m.key && !REF_KEY_REGEX.test(m.key)) {
      this.error(
        `metadata.key "${m.key}" inválido — use snake_case (ex: "pet_shop")`,
      );
    }

    if (m.color && !HEX_COLOR_REGEX.test(m.color)) {
      this.error(
        `metadata.color "${m.color}" inválido — use formato hex #RRGGBB`,
      );
    }

    if (m.icon && !ICON_REGEX.test(m.icon)) {
      this.warn(
        `metadata.icon "${m.icon}" — formato inesperado. Use nomes do Ionicons (ex: "briefcase-outline")`,
      );
    }

    if (m.version && !SEMVER_REGEX.test(m.version)) {
      this.warn(`metadata.version "${m.version}" — use semver (ex: "1.0.0")`);
    }

    if (m.description && m.description.length < 10) {
      this.warn(
        `metadata.description muito curta (${m.description.length} chars). Mínimo recomendado: 10.`,
      );
    }

    this.log(`Metadata OK: ${m.name} v${m.version}`);
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 3: Tenant config                                */
  /* ────────────────────────────────────────────────────── */

  validateTenantConfig() {
    const tc = this.pack.tenant_config;
    if (!tc) return;

    this.requireString(tc, "specialty", "tenant_config");
    this.requireString(tc, "agent_type", "tenant_config");
    this.requireString(tc, "agent_name", "tenant_config");

    if (typeof tc.show_price !== "boolean") {
      this.error("tenant_config.show_price deve ser boolean");
    }
    if (typeof tc.allow_payment !== "boolean") {
      this.error("tenant_config.allow_payment deve ser boolean");
    }

    this.log("Tenant config OK");
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 4: Modules                                      */
  /* ────────────────────────────────────────────────────── */

  validateModules() {
    const modules = this.pack.modules;
    if (!Array.isArray(modules)) return;

    if (modules.length === 0) {
      this.warn("modules está vazio — considere incluir ao menos 'core'");
    }

    if (!modules.includes("core")) {
      this.warn(
        "modules não inclui 'core' — o módulo core é ativado automaticamente, mas é recomendado incluí-lo explicitamente",
      );
    }

    const seen = new Set();
    for (const mod of modules) {
      if (typeof mod !== "string") {
        this.error(`modules contém valor não-string: ${JSON.stringify(mod)}`);
        continue;
      }
      if (!VALID_MODULE_KEYS.has(mod)) {
        this.error(
          `Módulo desconhecido: "${mod}". Módulos válidos: ${[...VALID_MODULE_KEYS].join(", ")}`,
        );
      }
      if (seen.has(mod)) {
        this.warn(`Módulo duplicado: "${mod}"`);
      }
      seen.add(mod);
    }

    // Dependency checks
    const ms = new Set(modules);
    if (ms.has("onr_cartorio") && !ms.has("documents")) {
      this.warn(
        "Módulo 'onr_cartorio' depende de 'documents'. Considere incluir 'documents'.",
      );
    }
    if (ms.has("pdv") && !ms.has("products")) {
      this.warn(
        "Módulo 'pdv' depende de 'products'. Considere incluir 'products'.",
      );
    }
    if (ms.has("stock") && !ms.has("products")) {
      this.warn(
        "Módulo 'stock' depende de 'products'. Considere incluir 'products'.",
      );
    }
    if (ms.has("purchases") && !ms.has("products")) {
      this.warn(
        "Módulo 'purchases' depende de 'products'. Considere incluir 'products'.",
      );
    }
    if (ms.has("delivery") && !ms.has("stock")) {
      this.warn(
        "Módulo 'delivery' depende de 'stock'. Considere incluir 'stock'.",
      );
    }

    this.log(`Modules OK: ${modules.join(", ")}`);
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 5: Collect ref_keys                             */
  /* ────────────────────────────────────────────────────── */

  collectRefKeys() {
    const p = this.pack;

    for (const c of p.service_categories || []) {
      if (c.ref_key) this.categoryRefs.add(c.ref_key);
    }

    for (const s of p.service_types || []) {
      if (s.ref_key) this.serviceTypeRefs.add(s.ref_key);
    }

    for (const w of p.workflow_templates || []) {
      if (w.ref_key) this.workflowRefs.add(w.ref_key);
      for (const step of w.steps || []) {
        if (step.ref_key) {
          this.stepRefs.add(step.ref_key);
          this.stepRefToTemplate.set(step.ref_key, w.ref_key);
        }
      }
    }

    for (const r of p.roles || []) {
      if (r.ref_key) this.roleRefs.add(r.ref_key);
    }

    for (const d of p.document_templates || []) {
      if (d.ref_key) this.docTemplateRefs.add(d.ref_key);
    }

    if (p.custom_fields) {
      for (const cf of p.custom_fields) {
        if (cf.ref_key) this.customFieldRefs.add(cf.ref_key);
      }
    }

    this.log(
      `Ref keys coletados: ${this.categoryRefs.size} categorias, ` +
        `${this.serviceTypeRefs.size} tipos, ${this.workflowRefs.size} workflows, ` +
        `${this.stepRefs.size} steps, ${this.roleRefs.size} roles, ` +
        `${this.docTemplateRefs.size} doc templates`,
    );
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 6: Ref key uniqueness                           */
  /* ────────────────────────────────────────────────────── */

  validateRefKeyUniqueness() {
    const all = [];
    const p = this.pack;

    const addAll = (items, source) => {
      for (const item of items || []) {
        if (item.ref_key) {
          all.push({ ref_key: item.ref_key, source });
        }
      }
    };

    addAll(p.service_categories, "service_categories");
    addAll(p.service_types, "service_types");
    addAll(p.workflow_templates, "workflow_templates");
    addAll(p.document_templates, "document_templates");
    addAll(p.roles, "roles");
    addAll(p.custom_fields, "custom_fields");

    // Steps are nested inside workflows
    for (const w of p.workflow_templates || []) {
      for (const s of w.steps || []) {
        if (s.ref_key) {
          all.push({
            ref_key: s.ref_key,
            source: `workflow_templates[${w.ref_key}].steps`,
          });
        }
      }
    }

    const seen = new Map(); // ref_key → source
    for (const { ref_key, source } of all) {
      if (seen.has(ref_key)) {
        this.error(
          `ref_key duplicado: "${ref_key}" — encontrado em ${seen.get(ref_key)} E ${source}`,
        );
      }
      seen.set(ref_key, source);
    }

    // Validate ref_key format
    for (const { ref_key, source } of all) {
      if (!REF_KEY_REGEX.test(ref_key)) {
        this.error(
          `ref_key inválido: "${ref_key}" em ${source} — use snake_case (a-z, 0-9, _)`,
        );
      }
    }

    this.log(`Unicidade de ref_keys: ${seen.size} chaves verificadas`);
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 7: Service categories                           */
  /* ────────────────────────────────────────────────────── */

  validateServiceCategories() {
    for (const cat of this.pack.service_categories || []) {
      const ctx = `service_category[${cat.ref_key || "?"}]`;

      this.requireString(cat, "ref_key", ctx);
      this.requireString(cat, "name", ctx);
      this.requireString(cat, "color", ctx);
      this.requireString(cat, "icon", ctx);

      if (cat.color && !HEX_COLOR_REGEX.test(cat.color)) {
        this.error(
          `${ctx}.color "${cat.color}" — formato inválido, use #RRGGBB`,
        );
      }

      if (typeof cat.sort_order !== "number") {
        this.warn(`${ctx}.sort_order não é número`);
      }

      if (typeof cat.is_active !== "boolean") {
        this.warn(`${ctx}.is_active não é boolean`);
      }
    }

    if ((this.pack.service_categories || []).length === 0) {
      if (this.isBasePack()) {
        this.log(
          "service_categories está vazio — OK para pack base (será preenchido por packs de marketplace)",
        );
      } else {
        this.error(
          "service_categories está vazio — é necessária ao menos 1 categoria",
        );
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 8: Service types                                */
  /* ────────────────────────────────────────────────────── */

  validateServiceTypes() {
    for (const st of this.pack.service_types || []) {
      const ctx = `service_type[${st.ref_key || "?"}]`;

      this.requireString(st, "ref_key", ctx);
      this.requireString(st, "name", ctx);
      this.requireString(st, "icon", ctx);
      this.requireString(st, "color", ctx);
      this.requireString(st, "category_ref", ctx);

      if (st.color && !HEX_COLOR_REGEX.test(st.color)) {
        this.error(
          `${ctx}.color "${st.color}" — formato inválido, use #RRGGBB`,
        );
      }

      // Cross-reference: category
      if (st.category_ref && !this.categoryRefs.has(st.category_ref)) {
        this.error(
          `${ctx}.category_ref "${st.category_ref}" não encontrado em service_categories`,
        );
      }

      // Cross-reference: workflow
      if (st.workflow_ref && !this.workflowRefs.has(st.workflow_ref)) {
        this.error(
          `${ctx}.workflow_ref "${st.workflow_ref}" não encontrado em workflow_templates`,
        );
      }
    }

    if ((this.pack.service_types || []).length === 0) {
      if (this.isBasePack()) {
        this.log(
          "service_types está vazio — OK para pack base (será preenchido por packs de marketplace)",
        );
      } else {
        this.error(
          "service_types está vazio — é necessário ao menos 1 tipo de serviço",
        );
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 9: Workflow templates                           */
  /* ────────────────────────────────────────────────────── */

  validateWorkflowTemplates() {
    for (const wf of this.pack.workflow_templates || []) {
      const ctx = `workflow[${wf.ref_key || "?"}]`;

      this.requireString(wf, "ref_key", ctx);
      this.requireString(wf, "name", ctx);

      if (!Array.isArray(wf.steps)) {
        this.error(`${ctx}.steps deve ser array`);
        continue;
      }

      if (wf.steps.length === 0) {
        this.error(`${ctx}.steps está vazio — necessário ao menos 1 step`);
        continue;
      }

      // Cross-reference: service_type_ref
      if (
        wf.service_type_ref &&
        !this.serviceTypeRefs.has(wf.service_type_ref)
      ) {
        this.error(
          `${ctx}.service_type_ref "${wf.service_type_ref}" não encontrado em service_types`,
        );
      }

      // Validate steps
      const stepRefsInThisWf = new Set();
      let hasTerminal = false;
      const stepOrders = new Set();

      for (const step of wf.steps) {
        const sCtx = `${ctx}.step[${step.ref_key || "?"}]`;

        this.requireString(step, "ref_key", sCtx);
        this.requireString(step, "name", sCtx);

        if (typeof step.step_order !== "number") {
          this.error(`${sCtx}.step_order deve ser número`);
        } else {
          if (stepOrders.has(step.step_order)) {
            this.warn(
              `${sCtx}.step_order ${step.step_order} duplicado dentro do mesmo workflow`,
            );
          }
          stepOrders.add(step.step_order);
        }

        if (typeof step.is_terminal !== "boolean") {
          this.error(`${sCtx}.is_terminal deve ser boolean`);
        }

        if (step.is_terminal) hasTerminal = true;
        if (step.ref_key) stepRefsInThisWf.add(step.ref_key);
      }

      if (!hasTerminal) {
        this.error(
          `${ctx} não tem nenhum step terminal (is_terminal: true). ` +
            `Todo workflow precisa de ao menos um step final.`,
        );
      }

      // Validate transitions
      if (!Array.isArray(wf.transitions)) {
        this.error(`${ctx}.transitions deve ser array`);
      } else {
        for (const tr of wf.transitions) {
          const tCtx = `${ctx}.transition`;

          this.requireString(tr, "from_step_ref", tCtx);
          this.requireString(tr, "to_step_ref", tCtx);
          this.requireString(tr, "name", tCtx);

          // Cross-reference: steps within THIS workflow
          if (tr.from_step_ref && !stepRefsInThisWf.has(tr.from_step_ref)) {
            // Check if it exists in another workflow
            if (this.stepRefs.has(tr.from_step_ref)) {
              this.error(
                `${tCtx}.from_step_ref "${tr.from_step_ref}" pertence a OUTRO workflow, não a "${wf.ref_key}". ` +
                  `Transições devem referenciar steps do mesmo workflow.`,
              );
            } else {
              this.error(
                `${tCtx}.from_step_ref "${tr.from_step_ref}" não encontrado`,
              );
            }
          }

          if (tr.to_step_ref && !stepRefsInThisWf.has(tr.to_step_ref)) {
            if (this.stepRefs.has(tr.to_step_ref)) {
              this.error(
                `${tCtx}.to_step_ref "${tr.to_step_ref}" pertence a OUTRO workflow, não a "${wf.ref_key}". ` +
                  `Transições devem referenciar steps do mesmo workflow.`,
              );
            } else {
              this.error(
                `${tCtx}.to_step_ref "${tr.to_step_ref}" não encontrado`,
              );
            }
          }

          // Self-transition warning
          if (
            tr.from_step_ref &&
            tr.to_step_ref &&
            tr.from_step_ref === tr.to_step_ref
          ) {
            this.warn(
              `${tCtx}: transição de "${tr.from_step_ref}" para si mesmo. Intencional?`,
            );
          }
        }

        // Check for unreachable steps (no incoming transitions except first step)
        if (wf.steps.length > 1) {
          const firstStep = wf.steps.reduce((a, b) =>
            a.step_order < b.step_order ? a : b,
          );
          const reachable = new Set([firstStep.ref_key]);
          for (const tr of wf.transitions) {
            if (tr.to_step_ref) reachable.add(tr.to_step_ref);
          }
          for (const step of wf.steps) {
            if (!reachable.has(step.ref_key)) {
              this.warn(
                `${ctx}.step[${step.ref_key}] não tem transições de entrada — pode ser inalcançável`,
              );
            }
          }
        }
      }
    }

    if ((this.pack.workflow_templates || []).length === 0) {
      this.warn(
        "workflow_templates está vazio — considere incluir ao menos 1 workflow",
      );
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 10: Deadline rules                              */
  /* ────────────────────────────────────────────────────── */

  validateDeadlineRules() {
    for (const dr of this.pack.deadline_rules || []) {
      const ctx = `deadline_rule[step_ref=${dr.step_ref || "?"}]`;

      this.requireString(dr, "step_ref", ctx);

      if (dr.step_ref && !this.stepRefs.has(dr.step_ref)) {
        this.error(
          `${ctx}.step_ref "${dr.step_ref}" não encontrado em workflow steps`,
        );
      }

      if (typeof dr.days_to_complete !== "number" || dr.days_to_complete < 0) {
        this.error(`${ctx}.days_to_complete deve ser número >= 0`);
      }

      if (
        typeof dr.notify_before_days !== "number" ||
        dr.notify_before_days < 0
      ) {
        this.error(`${ctx}.notify_before_days deve ser número >= 0`);
      }

      if (dr.priority && !VALID_PRIORITIES.has(dr.priority)) {
        this.error(
          `${ctx}.priority "${dr.priority}" inválida. Válidas: ${[...VALID_PRIORITIES].join(", ")}`,
        );
      }

      // Logical check
      if (
        typeof dr.notify_before_days === "number" &&
        typeof dr.days_to_complete === "number" &&
        dr.notify_before_days >= dr.days_to_complete
      ) {
        this.warn(
          `${ctx}: notify_before_days (${dr.notify_before_days}) >= days_to_complete (${dr.days_to_complete}). ` +
            `A notificação será enviada imediatamente.`,
        );
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 11: Step task templates                         */
  /* ────────────────────────────────────────────────────── */

  validateStepTaskTemplates() {
    for (const task of this.pack.step_task_templates || []) {
      const ctx = `step_task_template[${task.title || "?"}]`;

      this.requireString(task, "step_ref", ctx);
      this.requireString(task, "title", ctx);

      if (task.step_ref && !this.stepRefs.has(task.step_ref)) {
        this.error(
          `${ctx}.step_ref "${task.step_ref}" não encontrado em workflow steps`,
        );
      }

      if (
        task.assigned_role_ref &&
        !this.roleRefs.has(task.assigned_role_ref)
      ) {
        this.error(
          `${ctx}.assigned_role_ref "${task.assigned_role_ref}" não encontrado em roles`,
        );
      }

      if (typeof task.is_required !== "boolean") {
        this.warn(`${ctx}.is_required não é boolean`);
      }

      if (task.priority && !VALID_PRIORITIES.has(task.priority)) {
        this.error(
          `${ctx}.priority "${task.priority}" inválida. Válidas: ${[...VALID_PRIORITIES].join(", ")}`,
        );
      }

      if (typeof task.template_order !== "number") {
        this.warn(`${ctx}.template_order não é número`);
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 12: Step forms                                  */
  /* ────────────────────────────────────────────────────── */

  validateStepForms() {
    for (const form of this.pack.step_forms || []) {
      const ctx = `step_form[${form.name || "?"}]`;

      this.requireString(form, "step_ref", ctx);
      this.requireString(form, "name", ctx);

      if (form.step_ref && !this.stepRefs.has(form.step_ref)) {
        this.error(
          `${ctx}.step_ref "${form.step_ref}" não encontrado em workflow steps`,
        );
      }

      if (!form.form_schema_json || typeof form.form_schema_json !== "object") {
        this.error(`${ctx}.form_schema_json deve ser um objeto`);
      }

      if (typeof form.is_required !== "boolean") {
        this.warn(`${ctx}.is_required não é boolean`);
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 13: Document templates                          */
  /* ────────────────────────────────────────────────────── */

  validateDocumentTemplates() {
    for (const doc of this.pack.document_templates || []) {
      const ctx = `document_template[${doc.ref_key || "?"}]`;

      this.requireString(doc, "ref_key", ctx);
      this.requireString(doc, "name", ctx);
      this.requireString(doc, "category", ctx);
      this.requireString(doc, "content_html", ctx);

      if (typeof doc.is_active !== "boolean") {
        this.warn(`${ctx}.is_active não é boolean`);
      }

      if (!doc.variables || typeof doc.variables !== "object") {
        this.warn(`${ctx}.variables deve ser um objeto`);
      }

      // Check HTML content has some substance
      if (doc.content_html && doc.content_html.length < 20) {
        this.warn(
          `${ctx}.content_html muito curto (${doc.content_html.length} chars)`,
        );
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 14: Roles                                       */
  /* ────────────────────────────────────────────────────── */

  validateRoles() {
    for (const role of this.pack.roles || []) {
      const ctx = `role[${role.ref_key || "?"}]`;

      this.requireString(role, "ref_key", ctx);
      this.requireString(role, "name", ctx);

      if (!Array.isArray(role.permissions)) {
        this.error(`${ctx}.permissions deve ser array de strings`);
      } else {
        for (const perm of role.permissions) {
          if (typeof perm !== "string") {
            this.error(
              `${ctx}.permissions contém valor não-string: ${JSON.stringify(perm)}`,
            );
          }
        }
        if (role.permissions.length === 0) {
          this.warn(`${ctx}.permissions está vazio`);
        }
      }
    }

    if ((this.pack.roles || []).length === 0) {
      this.warn("roles está vazio — considere definir ao menos 1 role");
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 15: Services                                    */
  /* ────────────────────────────────────────────────────── */

  validateServices() {
    for (const svc of this.pack.services || []) {
      const ctx = `service[${svc.name || "?"}]`;

      this.requireString(svc, "name", ctx);
      this.requireString(svc, "type_ref", ctx);

      if (svc.type_ref && !this.serviceTypeRefs.has(svc.type_ref)) {
        this.error(
          `${ctx}.type_ref "${svc.type_ref}" não encontrado em service_types`,
        );
      }

      if (typeof svc.is_active !== "boolean") {
        this.warn(`${ctx}.is_active não é boolean`);
      }

      if (svc.item_kind && !["product", "service"].includes(svc.item_kind)) {
        this.error(
          `${ctx}.item_kind "${svc.item_kind}" inválido — use "product" ou "service"`,
        );
      }

      if (svc.sell_price !== undefined && typeof svc.sell_price !== "number") {
        this.error(`${ctx}.sell_price deve ser número`);
      }

      if (svc.cost_price !== undefined && typeof svc.cost_price !== "number") {
        this.error(`${ctx}.cost_price deve ser número`);
      }

      // Composition references
      if (svc.compositions && Array.isArray(svc.compositions)) {
        for (const comp of svc.compositions) {
          if (typeof comp.quantity !== "number" || comp.quantity <= 0) {
            this.error(`${ctx}.compositions: quantity deve ser número > 0`);
          }
          // child_ref should be another service name (validated loosely)
          if (!comp.child_ref) {
            this.error(`${ctx}.compositions: child_ref é obrigatório`);
          }
        }
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 16: OCR configs (optional)                      */
  /* ────────────────────────────────────────────────────── */

  validateOcrConfigs() {
    if (!this.pack.ocr_configs) return;

    for (const ocr of this.pack.ocr_configs) {
      const ctx = `ocr_config[${ocr.name || "?"}]`;

      this.requireString(ocr, "name", ctx);

      if (ocr.step_ref && !this.stepRefs.has(ocr.step_ref)) {
        this.error(
          `${ctx}.step_ref "${ocr.step_ref}" não encontrado em workflow steps`,
        );
      }

      if (!Array.isArray(ocr.document_types)) {
        this.error(`${ctx}.document_types deve ser array`);
      }

      if (!Array.isArray(ocr.extract_features)) {
        this.error(`${ctx}.extract_features deve ser array`);
      }

      if (typeof ocr.is_active !== "boolean") {
        this.warn(`${ctx}.is_active não é boolean`);
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 17: Custom fields (optional)                    */
  /* ────────────────────────────────────────────────────── */

  validateCustomFields() {
    if (!this.pack.custom_fields) return;

    const fieldKeysByTable = new Map();

    for (const cf of this.pack.custom_fields) {
      const ctx = `custom_field[${cf.ref_key || "?"}]`;

      this.requireString(cf, "ref_key", ctx);
      this.requireString(cf, "target_table", ctx);
      this.requireString(cf, "field_key", ctx);
      this.requireString(cf, "label", ctx);
      this.requireString(cf, "field_type", ctx);

      // Validate field_type
      if (cf.field_type && !VALID_FIELD_TYPES.has(cf.field_type)) {
        this.error(
          `${ctx}.field_type "${cf.field_type}" inválido. Válidos: ${[...VALID_FIELD_TYPES].join(", ")}`,
        );
      }

      // Validate mask_type
      if (cf.mask_type && !VALID_MASK_TYPES.has(cf.mask_type)) {
        this.error(
          `${ctx}.mask_type "${cf.mask_type}" inválido. Válidos: ${[...VALID_MASK_TYPES].join(", ")}`,
        );
      }

      // Validate field_key format
      if (cf.field_key && !REF_KEY_REGEX.test(cf.field_key)) {
        this.error(
          `${ctx}.field_key "${cf.field_key}" inválido — use snake_case`,
        );
      }

      // field_key uniqueness per table
      if (cf.target_table && cf.field_key) {
        if (!fieldKeysByTable.has(cf.target_table)) {
          fieldKeysByTable.set(cf.target_table, new Set());
        }
        const tableKeys = fieldKeysByTable.get(cf.target_table);
        if (tableKeys.has(cf.field_key)) {
          this.error(
            `${ctx}: field_key "${cf.field_key}" duplicado para tabela "${cf.target_table}"`,
          );
        }
        tableKeys.add(cf.field_key);
      }

      // select type needs options
      if (cf.field_type === "select" && !cf.options) {
        this.warn(`${ctx}: campo tipo "select" sem options definido`);
      }

      // reference type needs reference_config
      if (cf.field_type === "reference" && !cf.reference_config) {
        this.warn(
          `${ctx}: campo tipo "reference" sem reference_config definido`,
        );
      }

      // masked type needs mask_type
      if (cf.field_type === "masked" && !cf.mask_type) {
        this.warn(`${ctx}: campo tipo "masked" sem mask_type definido`);
      }
    }
  }

  /* ────────────────────────────────────────────────────── */
  /*  Phase 18: Best practices                              */
  /* ────────────────────────────────────────────────────── */

  validateBestPractices() {
    const p = this.pack;

    // Every service_type should have a workflow
    for (const st of p.service_types || []) {
      if (!st.workflow_ref) {
        this.warn(
          `service_type[${st.ref_key}] sem workflow_ref — processos deste tipo não terão fluxo automático`,
        );
      }
    }

    // Every workflow should be referenced by at least one service_type
    const usedWorkflows = new Set(
      (p.service_types || [])
        .filter((st) => st.workflow_ref)
        .map((st) => st.workflow_ref),
    );
    for (const wf of p.workflow_templates || []) {
      if (!usedWorkflows.has(wf.ref_key) && !wf.service_type_ref) {
        if (this.isBasePack()) {
          this.log(
            `workflow[${wf.ref_key}] sem referência — OK para pack base (workflows genéricos disponíveis via admin)`,
          );
        } else {
          this.warn(
            `workflow[${wf.ref_key}] não é referenciado por nenhum service_type — pode ser órfão`,
          );
        }
      }
    }

    // Size limits (recommended)
    const limits = {
      service_categories: {
        count: (p.service_categories || []).length,
        max: 20,
      },
      service_types: { count: (p.service_types || []).length, max: 30 },
      workflow_templates: {
        count: (p.workflow_templates || []).length,
        max: 15,
      },
      roles: { count: (p.roles || []).length, max: 10 },
      services: { count: (p.services || []).length, max: 50 },
      document_templates: {
        count: (p.document_templates || []).length,
        max: 20,
      },
    };

    for (const [key, { count, max }] of Object.entries(limits)) {
      if (count > max) {
        this.warn(
          `${key} tem ${count} itens (recomendado máx: ${max}). ` +
            `Packs muito grandes dificultam a manutenção.`,
        );
      }
    }

    // Check total step count across all workflows
    let totalSteps = 0;
    for (const wf of p.workflow_templates || []) {
      totalSteps += (wf.steps || []).length;
    }
    if (totalSteps > 100) {
      this.warn(
        `Total de ${totalSteps} steps em todos os workflows (recomendado máx: 100). ` +
          `Considere simplificar os fluxos.`,
      );
    }

    this.log("Best practices verificadas");
  }

  /* ────────────────────────────────────────────────────── */
  /*  Helpers                                               */
  /* ────────────────────────────────────────────────────── */

  requireString(obj, key, context) {
    const value = obj[key];
    if (!value || typeof value !== "string" || !value.trim()) {
      this.error(`${context}.${key} é obrigatório (string não-vazia)`);
      return false;
    }
    return true;
  }
}

/* ══════════════════════════════════════════════════════════
 * REPORT FORMATTER
 * ══════════════════════════════════════════════════════════ */

function printReport(fileName, result) {
  const divider = "─".repeat(60);

  console.log();
  console.log(bold(divider));
  console.log(bold(`  PACK VALIDATOR — ${fileName}`));
  console.log(bold(divider));

  if (result.info.length > 0) {
    console.log();
    for (const msg of result.info) {
      console.log(`  ${dim("ℹ")} ${dim(msg)}`);
    }
  }

  if (result.errors.length > 0) {
    console.log();
    console.log(red(`  ✗ ${result.errors.length} ERRO(S):`));
    console.log();
    for (const err of result.errors) {
      console.log(`    ${red("✗")} ${err}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log();
    console.log(yellow(`  ⚠ ${result.warnings.length} AVISO(S):`));
    console.log();
    for (const warn of result.warnings) {
      console.log(`    ${yellow("⚠")} ${warn}`);
    }
  }

  console.log();
  console.log(divider);

  if (result.valid) {
    if (result.warnings.length > 0) {
      console.log(
        green(`  ✓ VÁLIDO`) +
          yellow(` (com ${result.warnings.length} aviso(s))`),
      );
    } else {
      console.log(green(`  ✓ VÁLIDO — nenhum erro ou aviso encontrado`));
    }
  } else {
    console.log(
      red(`  ✗ INVÁLIDO — ${result.errors.length} erro(s) encontrado(s)`),
    );
  }

  console.log(divider);
  console.log();
}

/* ══════════════════════════════════════════════════════════
 * VALIDATE ALL REGISTERED PACKS
 * ══════════════════════════════════════════════════════════ */

function validateAllPacks(verbose) {
  const packsDir = path.resolve(__dirname, "../data/template-packs");
  const indexPath = path.join(packsDir, "index.ts");

  if (!fs.existsSync(indexPath)) {
    console.error(red("Erro: index.ts não encontrado em data/template-packs/"));
    process.exit(2);
  }

  // Read index.ts and find all imported pack files
  const indexContent = fs.readFileSync(indexPath, "utf-8");
  const importMatches = [
    ...indexContent.matchAll(/import\s+\w+\s+from\s+["']\.\/([^"']+)["']/g),
  ];

  const packFiles = importMatches
    .map((m) => m[1])
    .filter((f) => f !== "types" && !f.startsWith("index"));

  if (packFiles.length === 0) {
    console.error(red("Nenhum pack encontrado no index.ts"));
    process.exit(2);
  }

  console.log(bold(`\n  Validando ${packFiles.length} packs registrados...\n`));

  let allValid = true;
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const packFile of packFiles) {
    const fullPath = path.join(packsDir, `${packFile}.ts`);
    const displayName = `${packFile}.ts`;

    if (!fs.existsSync(fullPath)) {
      console.log(red(`  ✗ ${displayName} — arquivo não encontrado`));
      allValid = false;
      totalErrors++;
      continue;
    }

    try {
      const pack = loadPack(fullPath);
      const validator = new PackValidator(pack, displayName, verbose);
      const result = validator.validate();

      totalErrors += result.errors.length;
      totalWarnings += result.warnings.length;

      if (!result.valid) {
        allValid = false;
        printReport(displayName, result);
      } else if (result.warnings.length > 0) {
        if (verbose) {
          printReport(displayName, result);
        } else {
          console.log(
            `  ${green("✓")} ${displayName} — ${yellow(`${result.warnings.length} aviso(s)`)}`,
          );
        }
      } else {
        console.log(`  ${green("✓")} ${displayName}`);
      }
    } catch (err) {
      console.log(red(`  ✗ ${displayName} — ${err.message}`));
      allValid = false;
      totalErrors++;
    }
  }

  console.log();
  console.log(
    bold(
      `  Resultado: ${totalErrors} erro(s), ${totalWarnings} aviso(s) em ${packFiles.length} pack(s)`,
    ),
  );
  console.log();

  return allValid;
}

/* ══════════════════════════════════════════════════════════
 * CLI ENTRY POINT
 * ══════════════════════════════════════════════════════════ */

function showHelp() {
  console.log(`
${bold("Pack Validator — Radul Platform")}

${bold("Uso:")}
  node scripts/validate-pack.js <arquivo>        Valida um pack (.json ou .ts)
  node scripts/validate-pack.js --all             Valida todos os packs registrados
  node scripts/validate-pack.js --verbose <arq>   Saída detalhada
  node scripts/validate-pack.js --help            Mostra esta ajuda

${bold("Exemplos:")}
  node scripts/validate-pack.js data/template-packs/pet-shop.ts
  node scripts/validate-pack.js ./exported-pack.json
  node scripts/validate-pack.js --all
  node scripts/validate-pack.js --all --verbose

${bold("Para arquivos .ts:")}
  Requer ${cyan("tsx")} instalado globalmente: ${dim("npm install -g tsx")}
  Ou use o recurso "Exportar Pack" no admin para gerar um .json.

${bold("Exit codes:")}
  0 = pack válido (com ou sem avisos)
  1 = erros de validação encontrados
  2 = erro de arquivo ou carregamento
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  const verbose = args.includes("--verbose") || args.includes("-v");

  if (args.includes("--all")) {
    const valid = validateAllPacks(verbose);
    process.exit(valid ? 0 : 1);
  }

  // Find the file argument (first non-flag arg)
  const filePath = args.find((a) => !a.startsWith("--") && !a.startsWith("-"));

  if (!filePath) {
    console.error(red("Erro: especifique um arquivo para validar."));
    console.log(dim("  Use --help para ver as opções."));
    process.exit(2);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(red(`Erro: arquivo não encontrado: ${absPath}`));
    process.exit(2);
  }

  try {
    const pack = loadPack(absPath);
    const fileName = path.basename(absPath);
    const validator = new PackValidator(pack, fileName, verbose);
    const result = validator.validate();

    printReport(fileName, result);
    process.exit(result.valid ? 0 : 1);
  } catch (err) {
    console.error(red(`Erro ao carregar pack: ${err.message}`));
    if (verbose) {
      console.error(err);
    }
    process.exit(2);
  }
}

main();
