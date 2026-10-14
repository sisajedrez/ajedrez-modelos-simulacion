import React from 'react';

const GlassButton = ({ children, onClick, className = '', style = {} }) => {
  return (
    <button
      onClick={onClick}
      className={`glass-button ${className}`}
      style={style}
    >
      {children}
    </button>
  );
};

export default GlassButton;
