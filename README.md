# xpct

Sistema interno para gestionar inventario de equipos, actividades de servicio, pruebas e inspecciones de PCT.

## Estado actual

- **Autenticación**:
  - Login con Firebase Auth.
  - Roles básicos: admin, inspector; los no autorizados son redirigidos.

- **Inventario (`invre.html`)**:
  - Carga `docs/invre.csv` y muestra todos los equipos.
  - Columna `EDO` editable (ON / OFF / WIP); los cambios se guardan en Firestore (`inventarioEstados`) por equipo y se cachean en `localStorage` como overrides para usarse en otras vistas.

- **Inspecciones (`inspeccion.html`, `inspectlist.html`)**:
  - Selección de equipos solo si el estado efectivo está en `ON`.
  - Las inspecciones se guardan en `localStorage` y en Firestore (`inspecciones`).
  - Se ligan opcionalmente a actividades (campo `actividadId`).

- **Pruebas (`pruebas.html`, `pruebaslist.html`)**:
  - Autocompletado de datos desde `invre2.csv` / `invre.csv`.
  - Generación automática de número de reporte por equipo.
  - Guardado local y en Firestore (`pruebas`).
  - Listado prioriza próximas a vencer, soporta filtros por rango (chips 60–30, 30–15, 15–0) y detalle expandible bajo la fila.

- **Actividad (`actividad.html`, `actividadlist.html`, `actividadmin.html`)**:
  - `actividad.html`: registro de nuevas actividades por equipo/cliente.
  - `actividadlist.html`: vista de operación (solo lectura con edición puntual).
  - `actividadmin.html`: vista de administración (rentas, importes, períodos de facturación).
  - Actividades se guardan exclusivamente en Firestore (`actividades`).
  - El dashboard y otras pantallas leen siempre desde Firestore para conteos y listados.

### Reglas de OC / OS (Actividad)

- **OC (orden de compra / suministro)**
  - Formato estándar: `4301YYNNNN`.
    - `4301`: prefijo fijo.
    - `YY`: últimos 2 dígitos del año (tomado de `inicioServicio`, formato `dd/mm/aa`).
    - `NNNN`: consecutivo de 4 dígitos dentro de ese año.
  - Alcance del consecutivo: se calcula por combinación **cliente + equipo + año**.
  - En `actividad.html` (alta de actividad):
    - Si el usuario captura una OC en el formulario, ese valor se respeta y se asigna tal cual a todos los equipos seleccionados en esa alta.
    - Si deja el campo OC vacío, el sistema puede generar automáticamente una nueva OC siguiendo el esquema anterior.

- **OS (orden de servicio)**
  - Formato estándar actual: `PCT-YY-XXX`.
    - `PCT`: prefijo fijo.
    - `YY`: últimos 2 dígitos del año (tomado de `inicioServicio`).
    - `XXX`: consecutivo de 3 dígitos dentro de ese año.
  - Alcance del consecutivo: se calcula por combinación **cliente + año**.
  - En `actividad.html` (alta de actividad):
    - Si el usuario deja el campo OS vacío, el sistema genera la OS automáticamente con el siguiente consecutivo disponible.
    - La OS se almacena por equipo/actividad y puede ser ajustada posteriormente solo desde vistas de administración.

- **Dashboard (`index.html`)**:
  - Resumen de: número de pruebas, inspecciones, equipos en inventario, actividades (totales / concluidas / pendientes).
  - Cuenta equipos "fuera de servicio" cruzando inventario con inspecciones con hallazgos MALO.

## Situación actual

- El repositorio está en un **estado estable** conocido (commit reciente después de revertir cambios de `script.js`).
- `script.js` contiene la lógica central del frontend (inventario, actividad, pruebas, dashboard) y ya pasa una validación básica de sintaxis (`node --check script.js`).
- La regla de negocio principal vigente es:
  - Un equipo con actividad abierta (sin fecha de terminación) se considera **en servicio**.
  - La intención es que dicho equipo no se pueda reutilizar en un nuevo registro de actividad hasta que tenga terminación, aunque el detalle visual en la UI todavía se debe pulir.

## Cambios recientes (diciembre 2025)

- UI/Estilos
  - Se aplicó la fuente `Myriad Pro` globalmente (con fallbacks) y se homogenizaron estilos de inputs/selects en listados para igualarlos a los de formularios (`.campo`).
  - Se añadió realce sutil por hover y marca de fila activa en listados de pruebas.
- Pruebas (negocio y UX)
  - Diferenciación de periodos: ANUAL vs checkpoints (POST-TRABAJO, REPARACION).
    - ANUAL: requiere fecha de realización, calcula y guarda `proxima = fechaRealizacion + 12 meses`, reinicia el contador anual.
    - POST-TRABAJO / REPARACION: no calculan ni guardan `proxima`; no reinician contador anual. Sirven como evidencia/histórico del año.
    - Compatibilidad: registros sin `periodo` se consideran ANUAL.
  - Listado de pruebas (`pruebaslist.html`):
    - Ordena priorizando próximas a vencer (ANUAL vigente con menor número de días), luego vencidas, luego sin ANUAL; empates por fecha de realización desc.
    - Filtros por chips 60–30, 30–15, 15–0 (cuentan por equipo único, basados en la última ANUAL del equipo).
    - El estado/contador/chips y el resumen por equipo se calculan solo con la última ANUAL por equipo (los checkpoints no afectan la vigencia).
    - El detalle de una prueba se expande inline justo debajo de la fila y puede colapsarse con un segundo clic. Los controles dentro de la fila no disparan el toggle.

## Guía de uso (pruebas)

- En `pruebas.html`:
  - Selecciona el periodo.
    - ANUAL: captura fecha de realización para calcular `Próxima prueba`. El campo `Contador` se llena automáticamente (y se refresca cada hora mientras la página esté abierta).
    - POST-TRABAJO / REPARACION: `Próxima` y `Contador` no aplican; no reinician el ciclo anual.
  - Al guardar, `periodo` se persiste y `proxima` solo se guarda para ANUAL.

- En `pruebaslist.html`:
  - Usa el buscador para filtrar por equipo/producto/técnico/reporte.
  - Chips (60–30, 30–15, 15–0) limitan la vista a ANUALES próximas dentro de ese rango.
  - Clic en una fila para ver el detalle inline y clic de nuevo para colapsar.
  - El resumen por equipo muestra la última ANUAL y su vigencia.

## Verificación recomendada tras cambios

- Crear una prueba ANUAL con fecha reciente y comprobar:
  - Cálculo de `Próxima` = +12 meses y `Contador` correcto.
  - Aparición en “próximas a vencer” y chips según días restantes.
- Crear checkpoints (POST-TRABAJO/REPARACION) en el mismo equipo dentro del año:
  - Deben aparecer en el listado histórico sin alterar estado/contador/chips del equipo.
- Confirmar que en `inspectlist.html` y `actividadlist.html` los inputs/selects se vean homogéneos a `pruebas.html`.

## Notas de implementación

- El cálculo de vigencia en el listado se basa en un mapa de “última ANUAL por equipo”. Si no existe ANUAL, el equipo queda “SIN PRUEBA”.
- Los chips muestran conteo por equipo (no por filas) dentro del rango.
- Se eliminó el panel inferior de detalle en `pruebaslist.html` para evitar desplazamientos; ahora el detalle es inline.

## Alertas por correo (IONOS SMTP) – Backend Node

Se añadió un pequeño servidor Node (Express) en `server/` para enviar un correo diario con el resumen de pruebas ANUAL por vencer. Usa IONOS SMTP como transporte y Firestore como fuente de datos.

### Variables de entorno (crear `server/.env` – no se sube a Git)

Ejemplo de contenido mínimo:

```
TZ=America/Mexico_City
PORT=8080

MAIL_FROM="XPCT Alertas <logistica@pc-t.com.mx>"
MAIL_TO=the@unknownshoppers.com

SMTP_HOST=smtp.ionos.com
# 465 = SSL (recomendado) | 587 = STARTTLS
SMTP_PORT=465
SMTP_USER=logistica@pc-t.com.mx
SMTP_PASS=********

# Opción A (recomendada): JSON de Service Account en una sola línea
# FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"...","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"...","client_id":"..."}'

# Opción B (alternativa local): ruta absoluta al JSON
# GOOGLE_APPLICATION_CREDENTIALS=/Users/<usuario>/ruta/al/archivo.json
```

Notas:
- Usa UNA de las dos opciones para credenciales de Firebase Admin (A o B).
- `server/.env` está ignorado por Git (`.gitignore`). No lo subas.
- Para múltiples destinatarios en `MAIL_TO`, separa por comas: `uno@dom.com,dos@dom.com` o usa el formato `Nombre <mail>`.

### Obtener y pegar el Service Account JSON

1. Firebase Console → Configuración del proyecto → Cuentas de servicio → Firebase Admin SDK → “Generar nueva clave privada”.
2. Con Homebrew jq instalado, minifica a una sola línea y copia:
   - `jq -c . /ruta/al/archivo.json | pbcopy`
3. Pega en `.env` como valor de `FIREBASE_SERVICE_ACCOUNT_JSON` entre comillas simples.

### Arranque local y CORS

- Instalar dependencias y arrancar:
  - `cd server && npm install && npm start`
- El frontend de desarrollo corre típicamente en `http://localhost:2200` y el backend en `http://localhost:8080`.
- CORS está habilitado en el backend para `localhost:2200`.
- En `index.html`, el botón de prueba usa `http://localhost:8080` automáticamente en desarrollo y same-origin en producción.

### Endpoints

- `POST /api/test-smtp`
  - Envío de prueba SMTP sin tocar Firestore. Útil para validar credenciales del buzón.

- `POST /api/send-alerts?test=true`
  - Calcula desde Firestore las últimas ANUAL por equipo, clasifica por días restantes y envía un correo con 3 secciones:
    - 60–30 días (una sola vez por equipo)
    - 30–15 días (una sola vez por equipo)
    - 15–0 días (envío diario)
  - En modo `test=true`, si no hay elementos, envía un "Correo de prueba OK".

### Despliegue y DNS (resumen)

- SMTP: usar IONOS con remitente `logistica@pc-t.com.mx`.
- Recomendado configurar SPF, DKIM y DMARC en `pc-t.com.mx` para mejor entregabilidad.

### Problemas comunes

- "Unable to detect a Project Id": falta credencial de Firebase Admin. Usa Opción A o B en `.env` y reinicia.
- 404 al llamar `/api/send-alerts` desde el navegador en 2200: asegúrate que el backend corra en 8080; el botón ya reenvía a 8080 en desarrollo.
- Errores CORS: reinicia backend tras `npm install` (se añadió `cors`).

---

## Próximos cambios sugeridos

- **Actividad**
  - Mostrar en la lista inferior de `actividad.html` los equipos que están en servicio con una leyenda clara en la columna de estado (por ejemplo: `EN SERVICIO (no disponible)`), en lugar de solo mostrar alertas.
  - Asegurar que la selección múltiple (pegar varios equipos) respete la lógica anterior y sea consistente entre equipos nuevos vs. ocupados.

- **Consistencia de estados**
  - Revisar que todas las vistas que usan inventario (`inspeccion`, `pruebas`, `actividad`) lean de forma consistente el override de `EDO` persistido en Firestore (`inventarioEstados`) y cacheado en `localStorage`.
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