import axios from 'axios';

export const api = axios.create({
  baseURL: 'https://api.sosescrituras.com.br', // ex: https://api.sosescrituras.com
});
