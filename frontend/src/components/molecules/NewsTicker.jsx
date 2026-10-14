import React from 'react';

const NewsTicker = ({ participants = [] }) => {
  const textString = participants.length > 0 
    ? participants.join("   •   ") 
    : "Rol, nombre, nombre, nombre   •   Rol, nombre, nombre, nombre   •   Ajedrez UNViMe";

  return (
    <div className="news-ticker-container">
      <div className="animate-ticker font-jersey-15 news-ticker-text">
        <span>{textString}</span>
      </div>
    </div>
  );
};

export default NewsTicker;
