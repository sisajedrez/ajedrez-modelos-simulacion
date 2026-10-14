import React from 'react';
import GlassButton from '../components/atoms/GlassButton.jsx';
import { Chessboard } from 'react-chessboard';

const PreGameScreen = ({ modeTitle, difficultyLabel, onStartGame, onBack }) => {
  return (
    <div className="screen-container fade-transition pre-game-screen-container">
      
      <div className="pre-game-sidebar">
        <div className="sidebar-title-container">
          <h1 className="font-jersey-20 sidebar-title">
            Ajedrez<br/>UNViMe
          </h1>
        </div>

        <div className="sidebar-info-container">
          <p className="font-jersey-15 sidebar-mode-title">
            {modeTitle}
          </p>
          {difficultyLabel && (
            <>
              <p className="font-jersey-15 sidebar-diff-name">
                {difficultyLabel.name}
              </p>
              <span className="sidebar-elo-text">
                ({difficultyLabel.elo})
              </span>
            </>
          )}
        </div>

        <div>
          <GlassButton onClick={onStartGame} style={{ width: '100%', padding: '12px 0', fontSize: '1.5rem' }}>
            COMENZAR PARTIDA
          </GlassButton>
        </div>
      </div>

      <div className="pre-game-back-container">
        <button 
          onClick={onBack}
          className="glass-button font-jersey-15 back-btn-custom"
        >
          VOLVER
        </button>
      </div>

      <div className="pre-game-board-container">
        <div className="clock-row">
          <span className="font-jersey-15 clock-text">
            {modeTitle.includes('Stockfish') ? 'Stockfish' : modeTitle.includes('IA') ? 'IA UNViMe' : 'Jugador 2'}
          </span>
          <span className="font-jersey-15 clock-text">15:00</span>
        </div>

        <div className="chess-board-wrapper pre-game-board-wrapper">
          <Chessboard 
            position="start" 
            arePiecesDraggable={false}
            boardWidth={460}
            customDarkSquareStyle={{ backgroundColor: '#b88b4a' }}
            customLightSquareStyle={{ backgroundColor: '#e3c193' }}
          />
        </div>

        <div className="clock-row">
          <span className="font-jersey-15 clock-text">Jugador</span>
          <span className="font-jersey-15 clock-text">15:00</span>
        </div>
      </div>
    </div>
  );
};

export default PreGameScreen;
