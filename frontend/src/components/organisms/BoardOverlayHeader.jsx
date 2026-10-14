import React from 'react';
import ChessBoardDecoration from './ChessBoardDecoration.jsx';

const BoardOverlayHeader = ({ subtitle, children }) => {
  return (
    <div className="board-overlay-container">
      <ChessBoardDecoration />

      <div className="board-overlay-content">
        <div key={`sub-${subtitle}`} className="fade-transition subtitle-container">
          <h2 className="font-jersey-15 subtitle-text">
            {subtitle}
          </h2>
        </div>

        <h1 className="font-jersey-20 main-title-text">
          Ajedrez UNViMe
        </h1>

        <div key={`opts-${subtitle}`} className="fade-transition options-container">
          {children}
        </div>
      </div>
    </div>
  );
};

export default BoardOverlayHeader;
