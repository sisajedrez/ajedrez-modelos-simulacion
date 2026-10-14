Estructura propuesta para `src/` (diseño atómico)

components/
  atoms/        Elementos indivisibles. Sin lógica de negocio.
  molecules/    Grupos pequeños de átomos con una sola función.
  organisms/    Secciones completas de la interfaz.
  templates/    Layouts con huecos; sin datos.

pages/          Una por ruta. Piden datos, manejan estado y rellenan plantillas.
hooks/          Hooks reutilizables.
services/       Llamadas HTTP al backend.
utils/          Funciones puras y helpers.
styles/         Estilos globales y tokens.
assets/         Fuentes e imágenes.
tests/          Pruebas unitarias (mirando la estructura de src/).

Notas:
- `src/styles/App.css` contiene los estilos anteriormente en `src/App.css`.
- Actualiza imports si agregas más archivos o mueves ficheros.
