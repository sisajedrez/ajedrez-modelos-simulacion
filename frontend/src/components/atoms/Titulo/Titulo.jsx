const Titulo = ({ children = 'Ajedrez UNViMe', className = '' }) => (
  <h1 className={`titulo ${className}`.trim()}>{children}</h1>
);

export default Titulo;
