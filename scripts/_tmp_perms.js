const axios = require("axios");
const endpoint = "https://n8n.sosescritura.com.br/webhook/api_dinamico";

(async () => {
  try {
    await axios.post(endpoint, {
      sql: "INSERT INTO permissions (code, display_name, description) VALUES (CONCAT('supplier', CHR(46), 'read'), 'Ver Fornecedores', 'Pode visualizar cadastro de fornecedores') ON CONFLICT (code) DO NOTHING;",
    });
    console.log("OK: supplier.read");
  } catch (e) {
    console.log(
      "FAIL 1:",
      JSON.stringify(e.response?.data || e.message).substring(0, 300),
    );
  }

  try {
    await axios.post(endpoint, {
      sql: "INSERT INTO permissions (code, display_name, description) VALUES (CONCAT('supplier', CHR(46), 'write'), 'Gerenciar Fornecedores', 'Pode criar e editar cadastro de fornecedores') ON CONFLICT (code) DO NOTHING;",
    });
    console.log("OK: supplier.write");
  } catch (e) {
    console.log(
      "FAIL 2:",
      JSON.stringify(e.response?.data || e.message).substring(0, 300),
    );
  }
})();
