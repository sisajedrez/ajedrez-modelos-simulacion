const Texto = ({ as: Elemento = 'span', children, className = '', ...props }) => (
  <Elemento className={`texto ${className}`.trim()} {...props}>
    {children}
  </Elemento>
);

export default Texto;
