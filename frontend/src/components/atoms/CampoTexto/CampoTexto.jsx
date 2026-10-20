const CampoTexto = ({ className = '', ...props }) => (
  <input className={`campo-texto ${className}`.trim()} {...props} />
);

export default CampoTexto;
