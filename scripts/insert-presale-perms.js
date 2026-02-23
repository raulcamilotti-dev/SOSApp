const axios = require("axios");

const API_KEY = process.env.SOS_API_KEY;
if (!API_KEY) {
  console.error("Missing SOS_API_KEY env var");
  process.exit(1);
}
const API = process.env.EXPO_PUBLIC_API_BASE_URL
  ? `${process.env.EXPO_PUBLIC_API_BASE_URL}/api_dinamico`
  : "https://n8n.sosescritura.com.br/webhook/api_dinamico";
const H = {
  headers: {
    "X-Api-Key": API_KEY,
  },
};

async function run() {
  // Try with dots first (standard format)
  const perms = [
    {
      code: "presale.read",
      name: "Ver Pré-Vendas",
      desc: "Pode visualizar comandas abertas",
      cat: "PDV",
    },
    {
      code: "presale.write",
      name: "Criar Pré-Vendas",
      desc: "Pode abrir comandas e adicionar itens",
      cat: "PDV",
    },
    {
      code: "presale.close",
      name: "Fechar Pré-Vendas",
      desc: "Pode fechar comanda e gerar venda",
      cat: "PDV",
    },
  ];

  for (const p of perms) {
    try {
      const res = await axios.post(
        "https://n8n.sosescritura.com.br/webhook/api_crud",
        {
          action: "create",
          table: "permissions",
          payload: {
            code: p.code,
            display_name: p.name,
            description: p.desc,
          },
        },
        H,
      );
      console.log("OK:", p.code, JSON.stringify(res.data).substring(0, 100));
    } catch (e) {
      console.log(
        "ERR:",
        p.code,
        JSON.stringify(e.response?.data || e.message).substring(0, 200),
      );
    }
  }
  console.log("DONE");
}

run();
