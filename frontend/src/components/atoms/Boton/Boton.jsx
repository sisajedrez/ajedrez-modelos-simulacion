const Boton = ({
  children,
  className = '',
  variante = 'secundaria',
  type = 'button',
  ...props
}) => (
  <button
    className={`boton boton--${variante} ${className}`.trim()}
    type={type}
    {...props}
  >
    {children}
  </button>
);

export default Boton;
