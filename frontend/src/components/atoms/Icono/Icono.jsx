const Icono = ({ children, className = '', ...props }) => (
  <span aria-hidden="true" className={`icono ${className}`.trim()} {...props}>
    {children}
  </span>
);

export default Icono;
