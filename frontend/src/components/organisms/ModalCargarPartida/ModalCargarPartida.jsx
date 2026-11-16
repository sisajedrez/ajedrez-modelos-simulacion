import { useEffect, useState } from 'react';
import Boton from '../../atoms/Boton/index.js';
import CampoTexto from '../../atoms/CampoTexto/index.js';
import Modal from '../../atoms/Modal/index.js';

const ModalCargarPartida = ({ onCargar, onVolver, cargando, listarRecientes }) => {
  const [id, setId] = useState('');
  const [error, setError] = useState('');
  const [recientes, setRecientes] = useState([]);

  useEffect(() => {
    if (listarRecientes) {
      listarRecientes({ limit: 5 })
        .then((res) => {
          if (res?.items) setRecientes(res.items);
        })
        .catch(() => {});
    }
  }, [listarRecientes]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const idLimpio = id.trim();
    if (!idLimpio) {
      setError('Por favor ingresa un ID.');
      return;
    }
    setError('');
    try {
      await onCargar(idLimpio);
    } catch {
      setError('Partida no encontrada. Ingresa otro ID.');
    }
  };

  return (
    <Modal onCerrar={onVolver} titulo="Ingresa el ID de una partida" variante="rendicion">
      <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
        <CampoTexto
          autoFocus
          disabled={cargando}
          maxLength={36}
          onChange={(e) => {
            setId(e.target.value);
            if (error) setError('');
          }}
          placeholder="ID de la partida (ej: a1b2c3d4-...)"
          style={{ width: '100%', maxWidth: '320px', textAlign: 'center', padding: '8px 12px' }}
          value={id}
        />

        {error && (
          <p className="error-id" style={{ color: '#ff6b6b', fontSize: '18px', margin: '0' }}>
            {error}
          </p>
        )}

        {recientes.length > 0 && (
          <div style={{ width: '100%', maxWidth: '320px', marginTop: '4px' }}>
            <p style={{ margin: '0 0 6px 0', fontSize: '14px', opacity: 0.8 }}>Partidas recientes:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {recientes.slice(0, 3).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setId(item.id);
                    setError('');
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '4px 8px',
                    fontSize: '13px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>
                    {item.mode} ({item.status})
                  </span>
                  <span style={{ fontSize: '11px', opacity: 0.6 }}>{item.id.slice(0, 8)}...</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="dialogo-acciones" style={{ marginTop: '10px' }}>
          <Boton className="dialogo-boton" disabled={cargando || !id.trim()} type="submit">
            {cargando ? 'Cargando…' : 'Cargar partida'}
          </Boton>
          <Boton className="dialogo-boton" onClick={onVolver} type="button">
            Volver al menu
          </Boton>
        </div>
      </form>
    </Modal>
  );
};

export default ModalCargarPartida;
