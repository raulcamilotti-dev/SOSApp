/**
 * Injeta os nodes do endpoint calendar-feed no workflow N8N
 *
 * Uso:
 *   node scripts/inject-calendar-feed.js
 *
 * Depois execute:
 *   npm run sync:n8n:upload
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const WORKFLOW_FILE = path.join(
  __dirname,
  "..",
  "n8n",
  "workflows",
  "Ar17RgJt19MHQwbJqD8ZK.json",
);

if (!fs.existsSync(WORKFLOW_FILE)) {
  console.error("Workflow file not found:", WORKFLOW_FILE);
  process.exit(1);
}

const workflow = JSON.parse(fs.readFileSync(WORKFLOW_FILE, "utf-8"));

// Verifica se já existe
const alreadyExists = workflow.nodes.some(
  (n) =>
    n.name === "Calendar Feed" ||
    (n.parameters?.path === "/calendar-feed" &&
      n.type === "n8n-nodes-base.webhook"),
);

if (alreadyExists) {
  console.log("✅ Endpoint calendar-feed já existe no workflow. Nada a fazer.");
  process.exit(0);
}

const uuid = () => crypto.randomUUID();
const Y = 8200; // Posição vertical bem abaixo dos nodes existentes

// ─── SQL para buscar eventos (appointments + tasks) ─────────
const SQL_QUERY = `
WITH user_info AS (
  SELECT u.id, u.email, u.fullname, u.tenant_id, u.calendar_token,
         COALESCE(cs.sync_appointments, true) AS sync_appointments,
         COALESCE(cs.sync_tasks, true) AS sync_tasks,
         COALESCE(cs.sync_deadlines, true) AS sync_deadlines,
         COALESCE(cs.default_reminder_minutes, 30) AS reminder_min
  FROM users u
  LEFT JOIN calendar_sync_settings cs ON cs.user_id = u.id AND cs.deleted_at IS NULL
  WHERE u.calendar_token = '{{ $json.query.token }}'
    AND u.deleted_at IS NULL
  LIMIT 1
),
appointments AS (
  SELECT
    sa.id,
    sa.scheduled_start,
    sa.scheduled_end,
    sa.status,
    sa.notes,
    'APPOINTMENT' as event_type,
    COALESCE(sa.notes, 'Agendamento') as summary
  FROM service_appointments sa
  INNER JOIN user_info ui ON sa.tenant_id = ui.tenant_id
  WHERE (
      sa.created_by = ui.id
      OR sa.customer_id IN (SELECT c.id FROM customers c WHERE c.user_id = ui.id AND c.deleted_at IS NULL)
      OR sa.partner_id IN (SELECT p.id FROM partners p WHERE p.user_id = ui.id AND p.deleted_at IS NULL)
    )
    AND sa.deleted_at IS NULL
    AND sa.status NOT IN ('cancelled')
    AND ui.sync_appointments = true
),
user_tasks AS (
  SELECT
    t.id,
    COALESCE(t.start_date::timestamptz, t.due_date::timestamptz, t.created_at) as scheduled_start,
    COALESCE(t.due_date::timestamptz, t.start_date::timestamptz + interval '1 hour', t.created_at + interval '1 hour') as scheduled_end,
    t.status,
    t.description as notes,
    'TASK' as event_type,
    t.title as summary
  FROM tasks t
  INNER JOIN user_info ui ON true
  WHERE (t.assigned_to = ui.id)
    AND t.deleted_at IS NULL
    AND t.status NOT IN ('done', 'completed', 'cancelled')
    AND ui.sync_tasks = true
)
SELECT * FROM appointments
UNION ALL
SELECT * FROM user_tasks
ORDER BY scheduled_start NULLS LAST
`.trim();

// ─── JS Code para montar o .ics ────────────────────────────
const ICS_CODE = `
const events = items.map(item => item.json);
const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

let ics = 'BEGIN:VCALENDAR\\r\\n';
ics += 'VERSION:2.0\\r\\n';
ics += 'PRODID:-//SOS Escritura//Calendar//PT-BR\\r\\n';
ics += 'X-WR-CALNAME:SOS Escritura\\r\\n';
ics += 'X-WR-TIMEZONE:America/Sao_Paulo\\r\\n';
ics += 'CALSCALE:GREGORIAN\\r\\n';
ics += 'METHOD:PUBLISH\\r\\n';

// Timezone
ics += 'BEGIN:VTIMEZONE\\r\\n';
ics += 'TZID:America/Sao_Paulo\\r\\n';
ics += 'BEGIN:STANDARD\\r\\n';
ics += 'DTSTART:19700101T000000\\r\\n';
ics += 'TZOFFSETFROM:-0300\\r\\n';
ics += 'TZOFFSETTO:-0300\\r\\n';
ics += 'TZNAME:BRT\\r\\n';
ics += 'END:STANDARD\\r\\n';
ics += 'END:VTIMEZONE\\r\\n';

function toIcal(iso) {
  if (!iso) return now;
  return new Date(iso).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escIcal(s) {
  return (s || '').replace(/\\\\/g, '\\\\\\\\').replace(/;/g, '\\\\;').replace(/,/g, '\\\\,').replace(/\\n/g, '\\\\n');
}

const typeMap = { APPOINTMENT: 'Agendamento', TASK: 'Tarefa', DEADLINE: 'Prazo' };
const statusMap = {
  scheduled: 'CONFIRMED', confirmed: 'CONFIRMED', in_progress: 'CONFIRMED',
  completed: 'CANCELLED', cancelled: 'CANCELLED', todo: 'TENTATIVE',
  pending: 'TENTATIVE', done: 'CANCELLED'
};

for (const e of events) {
  ics += 'BEGIN:VEVENT\\r\\n';
  ics += 'UID:' + e.id + '@sosescritura.com.br\\r\\n';
  ics += 'DTSTAMP:' + now + '\\r\\n';
  ics += 'DTSTART:' + toIcal(e.scheduled_start) + '\\r\\n';
  ics += 'DTEND:' + toIcal(e.scheduled_end) + '\\r\\n';
  ics += 'SUMMARY:' + escIcal(e.summary) + '\\r\\n';
  if (e.notes) ics += 'DESCRIPTION:' + escIcal(e.notes) + '\\r\\n';
  ics += 'CATEGORIES:' + (typeMap[e.event_type] || 'Geral') + '\\r\\n';
  if (e.status) ics += 'STATUS:' + (statusMap[e.status] || 'CONFIRMED') + '\\r\\n';
  ics += 'BEGIN:VALARM\\r\\n';
  ics += 'TRIGGER:-PT30M\\r\\n';
  ics += 'ACTION:DISPLAY\\r\\n';
  ics += 'DESCRIPTION:' + escIcal(e.summary) + '\\r\\n';
  ics += 'END:VALARM\\r\\n';
  ics += 'END:VEVENT\\r\\n';
}

ics += 'END:VCALENDAR';

return [{ json: { ics } }];
`.trim();

// ─── Nodes ──────────────────────────────────────────────────
const nodes = [
  {
    parameters: {
      httpMethod: "GET",
      path: "/calendar-feed",
      responseMode: "responseNode",
      options: {},
    },
    type: "n8n-nodes-base.webhook",
    typeVersion: 2.1,
    position: [-416, Y],
    id: uuid(),
    name: "Calendar Feed",
    webhookId: "b41ca3e0-b6fe-41a6-8314-54c9e783ddd5",
  },
  {
    parameters: {
      operation: "executeQuery",
      query: SQL_QUERY,
      options: {},
    },
    type: "n8n-nodes-base.postgres",
    typeVersion: 2.6,
    position: [-192, Y],
    id: uuid(),
    name: "Calendar Feed SQL",
    credentials: {
      postgres: {
        id: "CY0Opezdi7jFknJ0",
        name: "SOS escrituras",
      },
    },
  },
  {
    parameters: {
      jsCode: ICS_CODE,
    },
    type: "n8n-nodes-base.code",
    typeVersion: 2,
    position: [32, Y],
    id: uuid(),
    name: "Build ICS Calendar",
  },
  {
    parameters: {
      respondWith: "text",
      responseBody: "={{ $json.ics }}",
      options: {
        responseCode: 200,
        responseHeaders: {
          entries: [
            {
              name: "Content-Type",
              value: "text/calendar; charset=utf-8",
            },
            {
              name: "Content-Disposition",
              value: 'inline; filename="sos-escritura.ics"',
            },
            {
              name: "Access-Control-Allow-Origin",
              value: "*",
            },
          ],
        },
      },
    },
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1.5,
    position: [256, Y],
    id: uuid(),
    name: "Respond Calendar Feed",
  },
];

// ─── Connections ────────────────────────────────────────────
const connections = {
  "Calendar Feed": {
    main: [
      [
        {
          node: "Calendar Feed SQL",
          type: "main",
          index: 0,
        },
      ],
    ],
  },
  "Calendar Feed SQL": {
    main: [
      [
        {
          node: "Build ICS Calendar",
          type: "main",
          index: 0,
        },
      ],
    ],
  },
  "Build ICS Calendar": {
    main: [
      [
        {
          node: "Respond Calendar Feed",
          type: "main",
          index: 0,
        },
      ],
    ],
  },
};

// ─── Inject ─────────────────────────────────────────────────
workflow.nodes.push(...nodes);
Object.assign(workflow.connections, connections);

fs.writeFileSync(WORKFLOW_FILE, JSON.stringify(workflow, null, 2));

console.log("✅ Endpoint calendar-feed injetado com sucesso!");
console.log("   Nodes adicionados:", nodes.map((n) => n.name).join(", "));
console.log("");
console.log("Próximo passo: npm run sync:n8n:upload");
