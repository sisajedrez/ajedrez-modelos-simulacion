import React, { useState } from 'react';
import './styles/App.css';

import BackgroundParticles from './components/atoms/BackgroundParticles.jsx';
import WelcomeScreen from './pages/WelcomeScreen.jsx';
import GameModeScreen from './pages/GameModeScreen.jsx';
import DifficultyScreen from './pages/DifficultyScreen.jsx';
import ColorSelectionScreen from './pages/ColorSelectionScreen.jsx';
import PreGameScreen from './pages/PreGameScreen.jsx';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('welcome');
  const [selectedGameMode, setSelectedGameMode] = useState('');
  const [selectedDifficulty, setSelectedDifficulty] = useState('');
  const [selectedColor, setSelectedColor] = useState('');

  const projectParticipants = [
    "Rol, nombre, nombre, nombre",
    "Universidad Nacional de Villa Mercedes (UNViMe)"
  ];

  const handleSelectMode = (mode) => {
    setSelectedGameMode(mode);
    if (mode === 'pvp') {
      setCurrentScreen('colorSelection');
    } else {
      setCurrentScreen('difficulty');
    }
  };

  const handleSelectDifficulty = (level) => {
    setSelectedDifficulty(level);
    setCurrentScreen('colorSelection');
  };

  const handleSelectColor = (color) => {
    setSelectedColor(color);
    setCurrentScreen('preGame');
  };

  const getModeTitle = () => {
    if (selectedGameMode === 'stockfish') return 'Partida vs Stockfish';
    if (selectedGameMode === 'ai') return 'Partida vs IA UNViMe';
    return 'Partida vs Jugador';
  };

  const getDifficultyDetails = () => {
    if (selectedDifficulty === 'easy') return { name: 'FACIL', elo: '800-1200 ELO' };
    if (selectedDifficulty === 'medium') return { name: 'MEDIO', elo: '1200-1700 ELO' };
    if (selectedDifficulty === 'hard') return { name: 'DIFICIL', elo: '1800+ ELO' };
    return null;
  };

  return (
    <main className="app-main">
      <BackgroundParticles />

      {currentScreen === 'welcome' && (
        <WelcomeScreen 
          onStartClick={() => setCurrentScreen('modes')} 
          participants={projectParticipants}
        />
      )}

      {currentScreen === 'modes' && (
        <GameModeScreen 
          onSelectMode={handleSelectMode}
          onBack={() => setCurrentScreen('welcome')}
        />
      )}

      {currentScreen === 'difficulty' && (
        <DifficultyScreen 
          modeTitle={getModeTitle()}
          onSelectDifficulty={handleSelectDifficulty}
          onBack={() => setCurrentScreen('modes')}
        />
      )}

      {currentScreen === 'colorSelection' && (
        <ColorSelectionScreen 
          modeTitle={getModeTitle()}
          onSelectColor={handleSelectColor}
          onBack={() => {
            if (selectedGameMode === 'pvp') {
              setCurrentScreen('modes');
            } else {
              setCurrentScreen('difficulty');
            }
          }}
        />
      )}

      {currentScreen === 'preGame' && (
        <PreGameScreen 
          modeTitle={getModeTitle()}
          difficultyLabel={selectedGameMode === 'pvp' ? null : getDifficultyDetails()}
          onStartGame={() => console.log('¡Partida iniciada!')}
          onBack={() => setCurrentScreen('colorSelection')}
        />
      )}
    </main>
  );
}