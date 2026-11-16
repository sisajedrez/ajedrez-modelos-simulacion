// Dirección del backend (VITE_API_URL). El `?.` permite importarlo desde node:test.
const URL_POR_DEFECTO = 'http://127.0.0.1:3001';

export const API_URL = (import.meta.env?.VITE_API_URL || URL_POR_DEFECTO).replace(/\/+$/, '');
