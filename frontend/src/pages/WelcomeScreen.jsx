import React from 'react';
import BoardOverlayHeader from '../components/organisms/BoardOverlayHeader.jsx';
import GlassButton from '../components/atoms/GlassButton.jsx';
import NewsTicker from '../components/molecules/NewsTicker.jsx';

const WelcomeScreen = ({ onStartClick, participants }) => {
  return (
    <div className="screen-container">
      <BoardOverlayHeader subtitle="¡Bienvenido!">
        <GlassButton onClick={onStartClick}>
          Nueva Partida
        </GlassButton>
      </BoardOverlayHeader>

      <NewsTicker participants={participants} />
    </div>
  );
};

export default WelcomeScreen;
