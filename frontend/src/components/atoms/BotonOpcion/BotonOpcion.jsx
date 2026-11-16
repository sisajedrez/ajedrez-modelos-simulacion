const BotonOpcion = ({
  children,
  className = '',
  seleccionada = false,
  atenuada = false,
  type = 'button',
  ...props
}) => (
  <button
    aria-pressed={seleccionada}
    type={type}
    className={`boton-opcion${seleccionada ? ' is-selected' : ''}${atenuada ? ' is-dimmed' : ''} ${className}`.trim()}
    {...props}
  >
    {children}
  </button>
);

export default BotonOpcion;
