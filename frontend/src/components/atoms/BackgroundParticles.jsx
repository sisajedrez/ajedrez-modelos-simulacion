import React from 'react';

const BackgroundParticles = () => {
  const particles = Array.from({ length: 25 });

  return (
    <div className="bg-particles">
      {particles.map((_, i) => {
        const size = Math.random() * 6 + 3;
        const left = Math.random() * 100;
        const duration = Math.random() * 7 + 5;
        const delay = Math.random() * 5;

        return (
          <span
            key={i}
            className="particle"
            style={{
              width: `${size}px`,
              height: `${size}px`,
              left: `${left}%`,
              animationDuration: `${duration}s`,
              animationDelay: `${delay}s`
            }}
          />
        );
      })}
    </div>
  );
};

export default BackgroundParticles;
