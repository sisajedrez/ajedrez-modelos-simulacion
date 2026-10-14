import React from 'react';
import BoardOverlayHeader from '../components/organisms/BoardOverlayHeader.jsx';
import GlassButton from '../components/atoms/GlassButton.jsx';

const DifficultyScreen = ({ modeTitle, onSelectDifficulty, onBack }) => {
  return (
    <div className="screen-container">
      <BoardOverlayHeader subtitle={modeTitle}>
        <div className="difficulty-options">
          <GlassButton 
            onClick={() => onSelectDifficulty('easy')} 
            className="diff-btn-easy"
          >
            <span>FACIL</span>
            <span className="elo-subtext">800-1200 ELO</span>
          </GlassButton>

          <GlassButton 
            onClick={() => onSelectDifficulty('medium')} 
            className="diff-btn-medium"
          >
            <span>MEDIO</span>
            <span className="elo-subtext">800-1700 ELO</span>
          </GlassButton>

          <GlassButton 
            onClick={() => onSelectDifficulty('hard')} 
            className="diff-btn-hard"
          >
            <span>DIFICIL</span>
            <span className="elo-subtext">1800+ ELO</span>
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

export default DifficultyScreen;
