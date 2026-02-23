const axios = require("axios");
const API = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

const perms = [
  ["pdv.access", "Acessar PDV", "Pode abrir e operar o Ponto de Venda", "PDV"],
  ["sale.read", "Ver Vendas", "Pode visualizar vendas realizadas", "PDV"],
  [
    "sale.write",
    "Criar/Editar Vendas",
    "Pode realizar vendas e editar vendas abertas",
    "PDV",
  ],
  ["sale.cancel", "Cancelar Vendas", "Pode cancelar ou estornar vendas", "PDV"],
  [
    "sale.refund",
    "Estornar Vendas",
    "Pode fazer estorno total ou parcial",
    "PDV",
  ],
  [
    "stock.read",
    "Ver Estoque",
    "Pode visualizar posicao de estoque",
    "Estoque",
  ],
  [
    "stock.write",
    "Ajustar Estoque",
    "Pode fazer ajustes manuais de estoque",
    "Estoque",
  ],
  [
    "purchase.read",
    "Ver Compras",
    "Pode visualizar ordens de compra",
    "Compras",
  ],
  [
    "purchase.write",
    "Criar/Editar Compras",
    "Pode criar e gerenciar ordens de compra",
    "Compras",
  ],
  [
    "purchase.receive",
    "Receber Mercadoria",
    "Pode confirmar recebimento de compras",
    "Compras",
  ],
  [
    "discount.approve",
    "Aprovar Descontos",
    "Pode aprovar descontos acima do limite",
    "PDV",
  ],
];

(async () => {
  let ok = 0,
    fail = 0;
  for (const [code, dn, desc, cat] of perms) {
    const sql = `INSERT INTO permissions(code, display_name, description) VALUES('${code}', '${dn}', '${desc}') ON CONFLICT(code) DO NOTHING`;
    try {
      await axios.post(API, { sql }, { timeout: 15000 });
      ok++;
      console.log("OK: " + code);
    } catch (e) {
      const m = JSON.stringify(e.response?.data || e.message).substring(0, 300);
      if (m.includes("already exists") || m.includes("duplicate")) {
        ok++;
        console.log("SKIP: " + code);
      } else {
        fail++;
        console.log("FAIL: " + code + " -> " + m);
      }
    }
  }
  console.log("\nDone: " + ok + " ok, " + fail + " fail");
})();
