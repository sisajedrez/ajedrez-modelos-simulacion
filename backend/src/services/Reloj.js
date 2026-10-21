'use strict';
const COLORES = Object.freeze(['WHITE', 'BLACK']);

class Reloj {
  #now;
  #tiempos;
  #colorActivo;
  #iniciado = false;
  #corriendo = false;
  #expirado = false;
  #ganador = null;
  #inicioTurno = null;

  constructor({ minutos, colorInicial = 'WHITE', now = Date.now } = {}) {
    if (!Number.isInteger(minutos) || minutos <= 0) {
      throw new TypeError('minutos debe ser un entero positivo');
    }
    this.#validarColor(colorInicial);
    if (typeof now !== 'function') throw new TypeError('now debe ser una funcion');

    const inicialMs = minutos * 60_000;
    this.#tiempos = { WHITE: inicialMs, BLACK: inicialMs };
    this.#colorActivo = colorInicial;
    this.#now = now;
  }

  iniciar() {
    if (this.#iniciado) throw new Error('El reloj ya fue iniciado');
    this.#iniciado = true;
    this.#corriendo = true;
    this.#inicioTurno = this.#now();
    return this.obtenerEstado();
  }

  cambiarTurno(colorSiguiente) {
    this.#validarColor(colorSiguiente);
    if (!this.#corriendo) throw new Error('El reloj no esta corriendo');
    if (colorSiguiente === this.#colorActivo) {
      throw new Error('El siguiente turno debe ser del color opuesto');
    }

    this.#actualizar();
    if (!this.#expirado) {
      this.#colorActivo = colorSiguiente;
      this.#inicioTurno = this.#now();
    }
    return this.obtenerEstado();
  }

  pausar() {
    if (!this.#corriendo) return this.obtenerEstado();
    this.#actualizar();
    if (!this.#expirado) {
      this.#corriendo = false;
      this.#inicioTurno = null;
    }
    return this.obtenerEstado();
  }

  reanudar() {
    if (!this.#iniciado) throw new Error('El reloj todavia no fue iniciado');
    if (this.#expirado) throw new Error('El reloj ya expiro');
    if (!this.#corriendo) {
      this.#corriendo = true;
      this.#inicioTurno = this.#now();
    }
    return this.obtenerEstado();
  }

  finalizar() {
    if (this.#corriendo) this.#actualizar();
    if (!this.#expirado) {
      this.#corriendo = false;
      this.#inicioTurno = null;
    }
    return this.obtenerEstado();
  }

  obtenerEstado() {
    this.#actualizar();
    return {
      remainingMs: { ...this.#tiempos },
      activeColor: this.#colorActivo,
      running: this.#corriendo,
      expired: this.#expirado,
      winner: this.#ganador,
      turnStartedAt: this.#inicioTurno,
    };
  }

  #actualizar() {
    if (!this.#corriendo) return;

    const ahora = this.#now();
    const transcurrido = Math.max(0, ahora - this.#inicioTurno);
    this.#inicioTurno = ahora;
    this.#tiempos[this.#colorActivo] = Math.max(
      0,
      this.#tiempos[this.#colorActivo] - transcurrido,
    );

    if (this.#tiempos[this.#colorActivo] === 0) {
      this.#expirado = true;
      this.#corriendo = false;
      this.#ganador = this.#colorActivo === 'WHITE' ? 'BLACK' : 'WHITE';
      this.#inicioTurno = null;
    }
  }

  #validarColor(color) {
    if (!COLORES.includes(color)) {
      throw new TypeError('El color debe ser WHITE o BLACK');
    }
  }
}
module.exports = Reloj;


/**
 * Reloj de ajedrez sin incremento: descuenta tiempo solo al color activo.
 *
 * Guia de integracion backend (pendiente; esta clase no define rutas HTTP):
 * 1. Al crear la partida, validar `clockMinutes` en ValidadorDeJugada y pasar ese valor
 *    al GestorDePartida. El gestor crea un Reloj por gameId, con el color del primer turno,
 *    y llama iniciar(). El controlador incluye `reloj.obtenerEstado()` en la respuesta.
 * 2. En POST /games/:id/moves y POST /games/:id/engine-move, el gestor consulta el reloj
 *    antes de aceptar/aplicar la jugada. Si esta expirado, finaliza la partida por tiempo
 *    y rechaza la jugada; si es valida, guarda la jugada y llama cambiarTurno(colorSiguiente).
 *    El estado actualizado del reloj se devuelve junto con el resultado de la jugada.
 * 3. GET /games/:id/clock puede exponer el estado actual para sincronizar clientes. Se agrega
 *    en routes/index.js y gamesController.js, delegando en GestorDePartida; la ruta/controlador
 *    no deben descontar tiempo ni manipular la instancia directamente.
 * 4. Los endpoints existentes POST /games/:id/pause y /games/:id/resume deben delegar en el
 *    gestor, que llama pausar() y reanudar() respectivamente y persiste el estado resultante.
 * 5. El gestor necesita recuperar la instancia por gameId. El store y la migracion deben
 *    guardar/restaurar los milisegundos restantes, el color activo, si esta corriendo y la
 *    marca de tiempo del ultimo inicio. Sin ello, el reloj se pierde al reiniciar el servidor.
 * 6. El frontend solo envia `clockMinutes` al crear y consulta/visualiza el estado devuelto;
 *    no es autoridad para decidir expiraciones.
 */