const axios = require("axios");

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function test() {
  try {
    console.log("Testando COM action='list'...");
    const res = await axios.post(ENDPOINT, {
      action: "list",
      table: "properties",
    });
    const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
    console.log(`✓ Properties encontradas: ${data.length}`);

    if (data.length > 0) {
      console.log("Primeiras 3:");
      data.slice(0, 3).forEach((p) => {
        console.log(
          `  - ${p.address || p.postal_code || "No address"} | Process: ${p.process_status} | Step: ${p.current_step_id ? "Tem!" : "NULL"}`,
        );
      });

      const withStep = data.filter((p) => p.current_step_id);
      console.log(`\n📍 Properties COM step_id: ${withStep.length}`);
      const withoutStep = data.filter((p) => !p.current_step_id);
      console.log(`📍 Properties SEM step_id: ${withoutStep.length}`);
    }
  } catch (err) {
    console.error("Erro:", err.message);
  }
}
test();
