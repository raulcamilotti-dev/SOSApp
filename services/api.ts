import axios from "axios";

const api = axios.create({
  baseURL: "https://n8n.sosescritura.com.br/webhook/",
});

export { api };

