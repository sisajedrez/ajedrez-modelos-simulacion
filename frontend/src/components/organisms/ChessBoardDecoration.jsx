import React from 'react';
import { Chessboard } from 'react-chessboard';

const ChessBoardDecoration = () => {
  return (
    <div className="chess-board-wrapper">
      <Chessboard 
        position="start" 
        arePiecesDraggable={false}
        boardWidth={440}
        customDarkSquareStyle={{ backgroundColor: '#b88b4a' }}
        customLightSquareStyle={{ backgroundColor: '#e3c193' }}
      />
    </div>
  );
};

export default ChessBoardDecoration;
