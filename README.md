# xpct

Sistema interno para gestionar inventario de equipos, actividades de servicio, pruebas e inspecciones de PCT.

## Estado actual

- **Autenticación**:
  - Login con Firebase Auth.
  - Roles básicos: admin, inspector; los no autorizados son redirigidos.

- **Inventario (`invre.html`)**:
  - Carga `docs/invre.csv` y muestra todos los equipos.
  - Columna `EDO` editable (ON / OFF / WIP); los cambios se guardan en `localStorage` como overrides y se usan en otras vistas.

- **Inspecciones (`inspeccion.html`, `inspectlist.html`)**:
  - Selección de equipos solo si el estado efectivo está en `ON`.
  - Las inspecciones se guardan en `localStorage` y en Firestore (`inspecciones`).
  - Se ligan opcionalmente a actividades (campo `actividadId`).

- **Pruebas (`pruebas.html`, `pruebaslist.html`)**:
  - Autocompletado de datos desde `invre2.csv` / `invre.csv`.
  - Generación automática de número de reporte por equipo.
  - Guardado local y en Firestore (`pruebas`).

- **Actividad (`actividad.html`, `actividadlist.html`, `actividadmin.html`)**:
  - `actividad.html`: registro de nuevas actividades por equipo/cliente.
  - `actividadlist.html`: vista de operación (solo lectura con edición puntual).
  - `actividadmin.html`: vista de administración (rentas, importes, períodos de facturación).
  - Actividades se guardan exclusivamente en Firestore (`actividades`).
  - El dashboard y otras pantallas leen siempre desde Firestore para conteos y listados.

- **Dashboard (`index.html`)**:
  - Resumen de: número de pruebas, inspecciones, equipos en inventario, actividades (totales / concluidas / pendientes).
  - Cuenta equipos "fuera de servicio" cruzando inventario con inspecciones con hallazgos MALO.

## Situación actual

- El repositorio está en un **estado estable** conocido (commit reciente después de revertir cambios de `script.js`).
- `script.js` contiene la lógica central del frontend (inventario, actividad, pruebas, dashboard) y ya pasa una validación básica de sintaxis (`node --check script.js`).
- La regla de negocio principal vigente es:
  - Un equipo con actividad abierta (sin fecha de terminación) se considera **en servicio**.
  - La intención es que dicho equipo no se pueda reutilizar en un nuevo registro de actividad hasta que tenga terminación, aunque el detalle visual en la UI todavía se debe pulir.

## Próximos cambios sugeridos

- **Actividad**
  - Mostrar en la lista inferior de `actividad.html` los equipos que están en servicio con una leyenda clara en la columna de estado (por ejemplo: `EN SERVICIO (no disponible)`), en lugar de solo mostrar alertas.
  - Asegurar que la selección múltiple (pegar varios equipos) respete la lógica anterior y sea consistente entre equipos nuevos vs. ocupados.

- **Consistencia de estados**
  - Revisar que todas las vistas que usan inventario (`inspeccion`, `pruebas`, `actividad`) lean de forma consistente el override de `EDO` almacenado en `localStorage`.
  - Documentar mejor la diferencia entre estado de inventario (ON/OFF/WIP) y estado operativo (actividad abierta/cerrada).

- **UI/UX**
  - Reemplazar `alert(...)` por mensajes visibles en la propia página (banners o mensajes cerca de la tabla) para errores y avisos.
  - Mejorar textos y ayudas visuales para operaciones frecuentes: registrar actividad, cerrar servicio, generar períodos de facturación.

- **Código**
  - Separar `script.js` en módulos por vista (inspección, actividad, pruebas, dashboard) para facilitar mantenimiento.
  - Añadir comentarios breves en las funciones clave de negocio (sin duplicar documentación) y tests básicos donde sea posible.

## Notas para próximos colaboradores

- Antes de tocar `script.js`, es recomendable:
  - Hacer un `node --check script.js` para validar sintaxis.
  - Probar pantallas clave en el navegador: `index.html`, `invre.html`, `actividad.html`, `pruebas.html`, `inspeccion.html`.
- Los cambios que afecten reglas de negocio (por ejemplo, cuándo un equipo está disponible) deben probarse al menos en:
  - Registro de actividad.
  - Listado y administración de actividad.
  - Inspecciones vinculadas a esa actividad.