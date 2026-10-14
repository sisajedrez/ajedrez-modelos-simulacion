import React from 'react';
import BoardOverlayHeader from '../components/organisms/BoardOverlayHeader.jsx';
import GlassButton from '../components/atoms/GlassButton.jsx';

const ColorSelectionScreen = ({ modeTitle, onSelectColor, onBack }) => {
  return (
    <div className="screen-container">
      <BoardOverlayHeader subtitle={modeTitle}>
        <div className="color-selection-options">
          <GlassButton 
            onClick={() => onSelectColor('blancas')} 
            className="color-btn-white"
          >
            BLANCAS
          </GlassButton>

          <GlassButton 
            onClick={() => onSelectColor('negras')} 
            className="color-btn-black"
          >
            NEGRAS
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

export default ColorSelectionScreen;
