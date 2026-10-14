## 📌 Descripción del Cambio
<!-- Explicar de forma clara y concisa el propósito del Pull Request y qué problema resuelve. -->

## 🏷️ Tipo de Cambio
<!-- Marcar con una [x] la opción que corresponda: -->
- [ ] `feat`: Funcionalidad nueva
- [ ] `fix`: Corrección de un fallo / bug
- [ ] `docs`: Documentación
- [ ] `test`: Adición o modificación de pruebas
- [ ] `refactor`: Cambio interno de código sin alteración de comportamiento

## 🎯 Alcance Afectado
<!-- Marcar los alcances involucrados en el cambio: -->
- [ ] `frontend`
- [ ] `backend`
- [ ] `ai`
- [ ] `db`
- [ ] `docs`
- [ ] `ci`

## 🔗 Trazabilidad (Casos de Uso / Reglas de Negocio)
<!-- Indicar qué requisitos, casos de uso o reglas de negocio impacta este cambio. -->
- **Caso(s) de Uso:** <!-- ej. CU-01, CU-02, CU-03, CU-04, CU-05, CU-06 -->
- **Regla(s) de Negocio:** <!-- ej. RN-01, RN-02, RN-03, RN-04 -->
- **Issue / Ticket relacionado:** <!-- ej. #12 o N/A -->

## ✅ Checklist de Verificación
<!-- Asegurarse de cumplir con los siguientes puntos antes de solicitar revisión: -->
- [ ] La rama de trabajo fue creada desde `develop` y el PR apunta hacia `develop`.
- [ ] El título del PR sigue el estándar semántico: `tipo(alcance): descripción en presente`.
- [ ] Las pruebas locales se ejecutaron y pasaron exitosamente (`pnpm --dir backend test`, etc.).
- [ ] El pipeline de CI finalizó en verde (`backend-tests`).
- [ ] No se comitearon archivos `.env`, contraseñas en texto plano ni binarios no versionados.
- [ ] Si se modificaron variables de entorno, se actualizaron los `.env.example` y `docs/documento-GC.md`.
- [ ] Si se cambiaron interfaces fijadas (Diseño Técnico), se etiquetó `cambio-de-interfaz` y se actualizó la documentación.
