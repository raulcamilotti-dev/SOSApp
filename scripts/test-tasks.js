const axios = require("axios");

const ENDPOINT = "https://n8n.sosescritura.com.br/webhook/api_crud";

async function test() {
  try {
    const res = await axios.post(ENDPOINT, {
      action: "list",
      table: "tasks",
    });
    const data = Array.isArray(res.data) ? res.data : res.data?.data || [];
    console.log(`✓ Tasks encontradas: ${data.length}`);

    if (data.length > 0) {
      console.log("Primeiras 3:");
      data.slice(0, 3).forEach((t) => {
        console.log(
          `  - ${t.title} | Property: ${t.property_id ? "Tem!" : "NULL"}`,
        );
      });

      const withProperty = data.filter((t) => t.property_id);
      console.log(`\n📍 Tasks COM property_id: ${withProperty.length}`);
    } else {
      console.log("❌ Nenhuma task encontrada!");
    }
  } catch (err) {
    console.error("Erro:", err.message);
  }
}
test();
