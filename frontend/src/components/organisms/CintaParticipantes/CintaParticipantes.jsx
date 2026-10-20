const CintaParticipantes = ({ participantes = [] }) => {
  const nombres = participantes.length > 0
    ? participantes
    : ['Rol: nombre, nombre, nombre.'];

  return (
    <div className="cinta-participantes" aria-label="Participantes del proyecto">
      <div className="cinta-participantes__recorrido">
        {[0, 1].map((copia) => (
          <div
            aria-hidden={copia === 1}
            className="cinta-participantes__grupo"
            key={copia}
          >
            {nombres.map((nombre, indice) => (
              <span key={`${copia}-${indice}`}>{nombre}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CintaParticipantes;
