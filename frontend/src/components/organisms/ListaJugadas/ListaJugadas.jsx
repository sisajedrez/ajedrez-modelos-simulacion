import Boton from '../../atoms/Boton/index.js';
import Texto from '../../atoms/Texto/index.js';

const agruparJugadas = (jugadas) => {
  const pares = [];
  for (let i = 0; i < jugadas.length; i += 2) {
    pares.push({ numero: i / 2 + 1, blancas: jugadas[i].san, negras: jugadas[i + 1]?.san });
  }
  return pares;
};

const ListaJugadas = ({ jugador, rival, jugadas = [], onGuardarSalir, deshabilitado = false }) => (
  <aside className="lista-jugadas">
    <div className="lista-jugadas__interior">
      <Texto as="h2">Partida {jugador} vs. {rival}</Texto>
      <Texto as="h3">Movimientos</Texto>
      <ol className="lista-jugadas__pares" aria-label="Jugadas de la partida">
        {agruparJugadas(jugadas).map(({ numero, blancas, negras }) => (
          <li key={numero}>
            <span className="lista-jugadas__numero">{numero}.</span>
            <span>{blancas}</span>
            <span>{negras ?? ''}</span>
          </li>
        ))}
      </ol>
      {onGuardarSalir && (
        <Boton className="boton-pequeno lista-jugadas__guardar" disabled={deshabilitado} onClick={onGuardarSalir}>
          Guardar y salir
        </Boton>
      )}
    </div>
  </aside>
);

export default ListaJugadas;
