const axios = require("axios");

const API_BASE =
  process.env.API_BASE_URL ||
  "https://sos-api-crud.raulcamilotti-c44.workers.dev";
const API_KEY = process.env.N8N_API_KEY || process.env.API_KEY || "";
const CRUD_ENDPOINT = `${API_BASE}/api_crud`;

const PLAN_PRICES = {
  free: 0,
  starter: 99,
  growth: 249,
  scale: 499,
  enterprise: 0,
};

if (!API_KEY) {
  console.error("Missing API key. Set N8N_API_KEY or API_KEY.");
  process.exit(1);
}

const headers = { "X-Api-Key": API_KEY };

const buildSearchParams = (filters = [], options = {}) => {
  const payload = {};
  const limited = filters.slice(0, 8);
  limited.forEach((filter, index) => {
    const pos = index + 1;
    payload[`search_field${pos}`] = filter.field;
    payload[`search_value${pos}`] = filter.value;
    payload[`search_operator${pos}`] = filter.operator || "equal";
  });

  if (options.combineType) payload.combine_type = options.combineType;
  if (options.sortColumn) payload.sort_column = options.sortColumn;
  return payload;
};

const listTable = async (table, filters, options) => {
  const res = await axios.post(
    CRUD_ENDPOINT,
    {
      action: "list",
      table,
      ...buildSearchParams(filters, options),
    },
    { headers },
  );
  return Array.isArray(res.data) ? res.data : [];
};

const createRow = async (table, payload) => {
  const res = await axios.post(
    CRUD_ENDPOINT,
    {
      action: "create",
      table,
      payload,
    },
    { headers },
  );
  return Array.isArray(res.data) ? res.data[0] : res.data;
};

const updateRow = async (table, payload) => {
  const res = await axios.post(
    CRUD_ENDPOINT,
    {
      action: "update",
      table,
      payload,
    },
    { headers },
  );
  return Array.isArray(res.data) ? res.data[0] : res.data;
};

(async () => {
  const month =
    process.env.MONTH_REFERENCE || new Date().toISOString().slice(0, 7);
  const referrals = await listTable("channel_partner_referrals", [
    { field: "status", value: "active" },
  ]);

  let created = 0;
  let totalAmount = 0;

  for (const referral of referrals) {
    try {
      const tenants = await listTable("tenants", [
        { field: "id", value: referral.tenant_id },
      ]);
      const tenant = tenants[0];
      if (!tenant) continue;

      const currentPlan = tenant?.config?.billing?.current_plan || "free";
      const planAmount = PLAN_PRICES[currentPlan] || 0;
      if (planAmount === 0) continue;

      const existing = await listTable(
        "channel_partner_commissions",
        [
          { field: "referral_id", value: referral.id },
          { field: "month_reference", value: month },
        ],
        { combineType: "AND" },
      );
      if (existing.length > 0) continue;

      const commissionAmount = planAmount * (referral.commission_rate / 100);

      await createRow("channel_partner_commissions", {
        channel_partner_id: referral.channel_partner_id,
        referral_id: referral.id,
        tenant_id: referral.tenant_id,
        month_reference: month,
        tenant_plan: currentPlan,
        plan_amount: planAmount,
        commission_rate: referral.commission_rate,
        commission_amount: commissionAmount,
        status: "pending",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      await updateRow("channel_partner_referrals", {
        id: referral.id,
        total_months_paid: (referral.total_months_paid || 0) + 1,
        total_paid: (referral.total_paid || 0) + planAmount,
        total_commission_earned:
          (referral.total_commission_earned || 0) + commissionAmount,
        last_payment_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      created += 1;
      totalAmount += commissionAmount;
    } catch (err) {
      console.error(
        "Failed commission for referral",
        referral.id,
        err?.message || err,
      );
    }
  }

  console.log("Commissions created:", created);
  console.log("Total amount:", totalAmount.toFixed(2));
})().catch((err) => {
  console.error("Commission run failed:", err?.message || err);
  process.exit(1);
});
