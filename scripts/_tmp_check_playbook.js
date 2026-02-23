const axios = require("axios");

const KEY = process.env.SOS_API_KEY;
if (!KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const API =
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const AGENT_ID = "978f9ea5-bf46-4e42-a195-4703ecf3e344";
const TENANT_ID = "0999d528-0114-4399-a582-41d4ea96801f";
const headers = { "X-Api-Key": KEY };

async function schema(table) {
  const r = await axios.post(
    `${API}/tables_info`,
    { table_name: table },
    { headers },
  );
  const cols = Array.isArray(r.data) ? r.data : [];
  return cols.map(
    (c) =>
      `${c.column_name} (${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}${c.referenced_table_name ? " FK→" + c.referenced_table_name : ""})`,
  );
}

async function list(table, field, value) {
  const r = await axios.post(
    `${API}/api_crud`,
    {
      action: "list",
      table,
      search_field1: field,
      search_value1: value,
      search_operator1: "equal",
    },
    { headers },
  );
  const d = r.data;
  return Array.isArray(d) ? d : d === "" ? [] : [d];
}

async function main() {
  // Schemas
  for (const t of [
    "agent_playbooks",
    "agent_playbook_rules",
    "agent_playbook_tables",
    "agent_state_steps",
  ]) {
    console.log(`\n=== SCHEMA: ${t} ===`);
    const cols = await schema(t);
    cols.forEach((c) => console.log("  " + c));
  }

  // Existing data
  console.log("\n=== EXISTING PLAYBOOKS ===");
  const playbooks = await list("agent_playbooks", "agent_id", AGENT_ID);
  console.log(`  Count: ${playbooks.length}`);
  playbooks.forEach((p) =>
    console.log(
      `  [${p.id}] ${p.name} — ${p.description || "(no desc)"} deleted_at=${p.deleted_at || "null"}`,
    ),
  );

  if (playbooks.length > 0) {
    for (const pb of playbooks) {
      console.log(`\n=== RULES for playbook ${pb.id} ===`);
      const rules = await list("agent_playbook_rules", "playbook_id", pb.id);
      console.log(`  Count: ${rules.length}`);
      rules.forEach((r) =>
        console.log(
          `  [${r.id}] order=${r.rule_order} ${r.rule_text?.substring(0, 80)}... deleted_at=${r.deleted_at || "null"}`,
        ),
      );

      console.log(`\n=== TABLES for playbook ${pb.id} ===`);
      const tables = await list("agent_playbook_tables", "playbook_id", pb.id);
      console.log(`  Count: ${tables.length}`);
      tables.forEach((t) =>
        console.log(
          `  [${t.id}] ${t.table_name} — ${t.description?.substring(0, 60) || "(no desc)"} deleted_at=${t.deleted_at || "null"}`,
        ),
      );
    }
  }

  // State steps — search by tenant
  console.log("\n=== EXISTING STATE STEPS (by tenant) ===");
  const steps = await list("agent_state_steps", "tenant_id", TENANT_ID);
  console.log(`  Count: ${steps.length}`);
  steps.forEach((s) =>
    console.log(
      `  [${s.id}] state=${s.state_id} step_order=${s.step_order} action=${s.action_type} → next=${s.next_state_id || "null"} deleted_at=${s.deleted_at || "null"}`,
    ),
  );

  // Also get the new state IDs for reference
  console.log("\n=== NEW STATE IDs ===");
  const states = await list("agent_states", "agent_id", AGENT_ID);
  states.sort((a, b) => (a.state_order || 0) - (b.state_order || 0));
  states.forEach((s) => console.log(`  ${s.state_key} → ${s.id}`));
}

main().catch((e) => console.error(e.response?.data || e.message));
