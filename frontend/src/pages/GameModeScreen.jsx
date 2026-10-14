import React from 'react';
import BoardOverlayHeader from '../components/organisms/BoardOverlayHeader.jsx';
import GlassButton from '../components/atoms/GlassButton.jsx';

const GameModeScreen = ({ onSelectMode, onBack }) => {
  return (
    <div className="screen-container">
      <BoardOverlayHeader subtitle="NUEVA PARTIDA">
        <div className="game-mode-options">
          <GlassButton onClick={() => onSelectMode('stockfish')} className="mode-btn">
            vs. Stockfish
          </GlassButton>

          <GlassButton onClick={() => onSelectMode('ai')} className="mode-btn">
            vs. IA UNViMe
          </GlassButton>

          <GlassButton onClick={() => onSelectMode('pvp')} className="mode-btn">
            vs jugador
          </GlassButton>
        </div>
      </BoardOverlayHeader>

      <div className="back-button-absolute">
        <button 
          onClick={onBack}
          className="glass-button font-jersey-15 back-btn-custom"
        >
          VOLVER
        </button>
      </div>
    </div>
  );
};

export default GameModeScreen;
