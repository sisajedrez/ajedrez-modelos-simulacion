const particles = Array.from({ length: 50 }, (_, index) => ({
  size: 2 + ((index * 37) % 30) / 10,
  left: (index * 61) % 100,
  duration: 16 + ((index * 7) % 18),
  delay: -((index * 13) % 30),
}));

const FondoParticulas = () => (
  <div className="fondo-particulas" aria-hidden="true">
    {particles.map(({ size, left, duration, delay }, index) => (
      <span
        className="particula"
        key={index}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          left: `${left}%`,
          animationDuration: `${duration}s`,
          animationDelay: `${delay}s`,
        }}
      />
    ))}
  </div>
);

export default FondoParticulas;
