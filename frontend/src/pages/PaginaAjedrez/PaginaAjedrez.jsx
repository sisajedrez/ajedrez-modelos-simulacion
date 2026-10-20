import { useState } from 'react';
import FondoParticulas from '../../components/atoms/FondoParticulas/index.js';
import BotonRendirse from '../../components/molecules/BotonRendirse/index.js';
import PlacaJugador from '../../components/molecules/PlacaJugador/index.js';
import CintaParticipantes from '../../components/organisms/CintaParticipantes/index.js';
import ModalAviso from '../../components/organisms/ModalAviso/index.js';
import ModalPromocion from '../../components/organisms/ModalPromocion/index.js';
import ModalRendicion from '../../components/organisms/ModalRendicion/index.js';
import ModalResultado from '../../components/organisms/ModalResultado/index.js';
import ListaJugadas from '../../components/organisms/ListaJugadas/index.js';
import MenuPrincipal from '../../components/organisms/MenuPrincipal/index.js';
import PanelConfiguracion from '../../components/organisms/PanelConfiguracion/index.js';
import Tablero from '../../components/organisms/Tablero/index.js';
import PlantillaConfiguracion from '../../components/templates/PlantillaConfiguracion/index.js';
import PlantillaMenu from '../../components/templates/PlantillaMenu/index.js';
import PlantillaPartida from '../../components/templates/PlantillaPartida/index.js';
import { usePartida } from '../../hooks/usePartida.js';
import { partidasApi } from '../../services/index.js';
import { mensajeDeError } from '../../utils/mensajesError.js';
import { nivelesDesdePerfiles } from '../../utils/niveles.js';
import { construirResultado } from '../../utils/resultadoPartida.js';
import { obtenerOpcionesFaltantes } from '../../utils/validarConfiguracion.js';

const participantes = [
  'Rol: nombre, nombre, nombre.',
  'Universidad Nacional de Villa Mercedes (UNViMe)',
];

const nombresRival = {
  stockfish: 'Stockfish',
  unvime: 'IA UNViMe',
};

const PaginaAjedrez = () => {
  const juego = usePartida(partidasApi);
  const { partida } = juego;

  const [pantalla, setPantalla] = useState('menu');
  const [configuracion, setConfiguracion] = useState({
    modo: '',
    dificultad: '',
    color: '',
    tiempo: '',
  });
  const [nombres, setNombres] = useState({
    jugadorUno: 'Jugador 1',
    jugadorDos: 'Jugador 2',
  });
  const [perfiles, setPerfiles] = useState([]);
  const [errorNiveles, setErrorNiveles] = useState('');
  const [jugadorRendido, setJugadorRendido] = useState(null);
  const [cierreOculto, setCierreOculto] = useState(false);
  const [partidaGuardada, setPartidaGuardada] = useState(null);

  const cargarNiveles = async () => {
    setErrorNiveles('');
    try {
      setPerfiles(await partidasApi.obtenerPerfiles());
    } catch (fallo) {
      setPerfiles([]);
      setErrorNiveles(`No se pudieron cargar los niveles: ${mensajeDeError(fallo)}`);
    }
  };

  const abrirConfiguracion = () => {
    setPantalla('configuracion');
    cargarNiveles();
  };

  const actualizarConfiguracion = (clave, valor) => {
    setConfiguracion((actual) => ({
      ...actual,
      [clave]: valor,
      ...(clave === 'modo' ? { dificultad: '' } : {}),
    }));
  };

  const cambiarNombre = (jugador, nombre) => {
    setNombres((actuales) => ({ ...actuales, [jugador]: nombre }));
  };

  const terminarNombre = (jugador, porDefecto) => {
    setNombres((actuales) => ({ ...actuales, [jugador]: actuales[jugador].trim() || porDefecto }));
  };

  const comenzarPartida = async () => {
    const colorElegido = configuracion.color === 'r'
      ? (Math.random() < 0.5 ? 'w' : 'b')
      : configuracion.color;

    setCierreOculto(false);
    const creada = await juego.iniciar({
      modo: configuracion.modo,
      alias: nombres.jugadorUno.trim() || 'Jugador 1',
      dificultad: configuracion.modo === 'jugador' ? '' : configuracion.dificultad,
      color: colorElegido,
    });
    if (creada) setPantalla('partida');
  };

  const nombreUno = nombres.jugadorUno.trim() || 'Jugador 1';
  const rival = partida.modo === 'jugador'
    ? nombres.jugadorDos.trim() || 'Jugador 2'
    : nombresRival[partida.modo] || 'Jugador 2';
  const opcionesFaltantes = obtenerOpcionesFaltantes(configuracion);
  const minutos = Number(configuracion.tiempo) || 0;
  const niveles = configuracion.modo && configuracion.modo !== 'jugador'
    ? nivelesDesdePerfiles(perfiles)
    : [];

  const resultado = partida.cierre
    ? construirResultado({
      ...partida.cierre,
      idPartida: partida.id,
      nombres: {
        [partida.colorHumano]: nombreUno,
        [juego.colorRival]: rival,
      },
    })
    : null;

  const solicitarRendicion = (clave, nombre) => {
    setJugadorRendido({ clave, nombre });
  };

  const confirmarRendicion = async () => {
    const color = jugadorRendido.clave === 'jugadorUno' ? partida.colorHumano : juego.colorRival;
    setJugadorRendido(null);
    setCierreOculto(false);
    await juego.rendirse(color);
  };

  const volverAlMenu = () => {
    setJugadorRendido(null);
    setPartidaGuardada(null);
    juego.descartar();
    setPantalla('menu');
  };

  const guardarYSalir = async () => {
    const id = await juego.guardarYSalir();
    if (id) setPartidaGuardada(id);
  };

  const estadoTablero = (() => {
    if (juego.cargando) return 'Conectando con el servidor…';
    if (juego.pensando) return `${rival} está pensando…`;
    return '';
  })();

  return (
    <main className="aplicacion">
      <FondoParticulas />

      {pantalla === 'menu' && (
        <PlantillaMenu>
          <MenuPrincipal onNuevaPartida={abrirConfiguracion} />
        </PlantillaMenu>
      )}

      {pantalla === 'configuracion' && (
        <PlantillaConfiguracion>
          <PanelConfiguracion
            configuracion={configuracion}
            elementosFaltantes={opcionesFaltantes}
            errorNiveles={errorNiveles}
            niveles={niveles}
            ocupado={juego.cargando}
            onComenzar={comenzarPartida}
            onSeleccionar={actualizarConfiguracion}
            onVolver={() => setPantalla('menu')}
          />
          <div className="zona-tablero">
            <PlacaJugador
              etiqueta="Nombre del segundo jugador"
              editable={configuracion.modo === 'jugador'}
              minutos={minutos}
              nombre={
                configuracion.modo === 'jugador'
                  ? nombres.jugadorDos
                  : nombresRival[configuracion.modo] || 'Jugador 2'
              }
              onCambiarNombre={(nombre) => cambiarNombre('jugadorDos', nombre)}
              onTerminarNombre={() => terminarNombre('jugadorDos', 'Jugador 2')}
            />
            <Tablero color={configuracion.color === 'b' ? 'b' : 'w'} />
            <PlacaJugador
              etiqueta="Nombre del primer jugador"
              editable
              minutos={minutos}
              nombre={nombres.jugadorUno}
              onCambiarNombre={(nombre) => cambiarNombre('jugadorUno', nombre)}
              onTerminarNombre={() => terminarNombre('jugadorUno', 'Jugador 1')}
            />
          </div>
        </PlantillaConfiguracion>
      )}

      {pantalla === 'partida' && (
        <PlantillaPartida>
          <div className="zona-tablero">
            <div className="fila-jugador">
              <PlacaJugador minutos={minutos} nombre={rival} />
              {partida.modo === 'jugador' && !juego.finalizada && (
                <BotonRendirse
                  nombreJugador={rival}
                  onRendirse={() => solicitarRendicion('jugadorDos', rival)}
                />
              )}
            </div>
            <Tablero
              color={partida.colorHumano}
              destinos={juego.destinos}
              onCasilla={juego.alTocarCasilla}
              posicion={partida.fen}
              seleccionada={juego.seleccionada}
            />
            <div className="fila-jugador">
              <PlacaJugador minutos={minutos} nombre={nombreUno} />
              {!juego.finalizada && (
                <BotonRendirse
                  nombreJugador={nombreUno}
                  onRendirse={() => solicitarRendicion('jugadorUno', nombreUno)}
                />
              )}
            </div>
            <p aria-live="polite" className="aviso-estado">{estadoTablero}</p>
          </div>
          <ListaJugadas
            deshabilitado={juego.cargando || juego.pensando || juego.finalizada}
            jugadas={partida.jugadas}
            jugador={nombreUno}
            onGuardarSalir={guardarYSalir}
            rival={rival}
          />
        </PlantillaPartida>
      )}

      {pantalla === 'partida' && jugadorRendido && (
        <ModalRendicion
          jugador={jugadorRendido.nombre}
          onConfirmar={confirmarRendicion}
          onVolver={() => setJugadorRendido(null)}
        />
      )}

      {pantalla === 'partida' && juego.coronacion && (
        <ModalPromocion
          color={partida.fen.split(' ')[1] === 'b' ? 'b' : 'w'}
          onCancelar={juego.cancelarCoronacion}
          onElegir={juego.elegirCoronacion}
        />
      )}

      {pantalla === 'partida' && resultado && !cierreOculto && (
        <ModalResultado
          onMenu={volverAlMenu}
          onRevisar={() => setCierreOculto(true)}
          resultado={resultado}
        />
      )}

      {partidaGuardada && (
        <ModalAviso
          acciones={[{ etiqueta: 'Menú principal', onClick: volverAlMenu }]}
          mensaje={`ID de partida: ${partidaGuardada}`}
          onCerrar={volverAlMenu}
          titulo="Partida guardada"
        />
      )}

      {juego.error?.tipo === 'motor' && (
        <ModalAviso
          acciones={[
            { etiqueta: 'Reintentar', onClick: juego.reintentarMaquina },
            { etiqueta: 'Guardar y salir', onClick: async () => { juego.limpiarError(); await guardarYSalir(); } },
          ]}
          mensaje={juego.error.mensaje}
          onCerrar={juego.reintentarMaquina}
          titulo={`${rival} no pudo jugar`}
        />
      )}

      {juego.error?.tipo === 'general' && (
        <ModalAviso
          acciones={[{ etiqueta: 'Aceptar', onClick: juego.limpiarError }]}
          mensaje={juego.error.mensaje}
          onCerrar={juego.limpiarError}
          titulo="Algo salió mal"
        />
      )}

      <CintaParticipantes participantes={participantes} />
    </main>
  );
};

export default PaginaAjedrez;
