// Los errores del backend llegan como { error: { code, message, retryable } }.

export class ErrorApi extends Error {
  constructor({ codigo, mensaje, detalles, estado, reintentable = false }) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.detalles = detalles;
    this.estado = estado;
    this.reintentable = reintentable;
  }
}

const MENSAJE_SIN_CONEXION = 'No se pudo conectar con el servidor. Revisá que el backend esté encendido.';

export const crearClienteApi = ({ baseUrl, fetchFn = (...args) => globalThis.fetch(...args) }) => {
  const solicitar = async (metodo, ruta, { cuerpo, consulta } = {}) => {
    const parametros = consulta
      ? new URLSearchParams(
        Object.entries(consulta).filter(([, valor]) => valor !== undefined && valor !== ''),
      ).toString()
      : '';
    const url = `${baseUrl}${ruta}${parametros ? `?${parametros}` : ''}`;

    let respuesta;
    try {
      respuesta = await fetchFn(url, {
        method: metodo,
        headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      });
    } catch {
      throw new ErrorApi({ codigo: 'SIN_CONEXION', mensaje: MENSAJE_SIN_CONEXION, estado: 0, reintentable: true });
    }

    const texto = await respuesta.text();
    let datos = null;
    if (texto) {
      try {
        datos = JSON.parse(texto);
      } catch {
        datos = texto;
      }
    }

    if (!respuesta.ok) {
      const error = datos?.error ?? {};
      throw new ErrorApi({
        codigo: error.code ?? 'ERROR_DESCONOCIDO',
        mensaje: error.message ?? `El servidor respondió con el error ${respuesta.status}.`,
        detalles: error.details,
        estado: respuesta.status,
        reintentable: error.retryable === true,
      });
    }

    return datos;
  };

  return {
    get: (ruta, consulta) => solicitar('GET', ruta, { consulta }),
    post: (ruta, cuerpo = {}) => solicitar('POST', ruta, { cuerpo }),
  };
};
