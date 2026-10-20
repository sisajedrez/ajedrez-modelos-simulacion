import { useEffect, useRef } from 'react';

const particulas = Array.from({ length: 48 }, (_, indice) => ({
  izquierda: `${(indice * 37) % 100}%`,
  demora: `${-((indice * 11) % 32)}s`,
  duracion: `${18 + ((indice * 7) % 17)}s`,
}));

const Modal = ({ titulo, variante, onCerrar, children }) => {
  const dialogo = useRef(null);
  const alCerrar = useRef(onCerrar);

  // Evita que el efecto se repita en cada render.
  useEffect(() => {
    alCerrar.current = onCerrar;
  });

  useEffect(() => {
    const focoAnterior = document.activeElement;
    dialogo.current?.querySelector('button:not(:disabled)')?.focus();

    const manejarTecla = (evento) => {
      if (evento.key === 'Escape') {
        alCerrar.current?.();
      }
    };

    document.addEventListener('keydown', manejarTecla);
    return () => {
      document.removeEventListener('keydown', manejarTecla);
      if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
    };
  }, []);

  return (
    <div className={`capa-modal capa-modal--${variante}`}>
      <div className="modal-velo" />
      {variante === 'victoria' && (
        <div className="confeti" aria-hidden="true">
          {particulas.map(({ izquierda, demora, duracion }, indice) => (
            <span
              key={indice}
              style={{
                left: izquierda,
                animationDelay: demora,
                animationDuration: duracion,
              }}
            />
          ))}
        </div>
      )}
      <section
        aria-labelledby="titulo-dialogo"
        aria-modal="true"
        className="dialogo-marco"
        ref={dialogo}
        role="dialog"
      >
        <div className="dialogo-contenido">
          <h2 className="texto dialogo-titulo" id="titulo-dialogo">
            {titulo}
          </h2>
          {children}
        </div>
      </section>
    </div>
  );
};

export default Modal;
