import { API_URL } from './config.js';
import { crearClienteApi } from './clienteApi.js';
import { crearPartidasApi } from './partidasApi.js';

export { ErrorApi } from './clienteApi.js';
export const partidasApi = crearPartidasApi(crearClienteApi({ baseUrl: API_URL }));
