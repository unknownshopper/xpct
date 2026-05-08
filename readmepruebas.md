# Pruebas de presión (Barómetro digital)

Este documento aterriza la implementación para integrar a XPCT las **pruebas de presión** realizadas con el **barómetro digital** (Data Logger) cuya app exporta:

- `PNG` con la gráfica
- `CSV` con las mediciones
- `ZIP` (paquete con evidencias; normalmente contiene PNG+CSV y/o metadata)

La meta es que cada prueba quede **ligada a un equipo** (y opcionalmente a una **actividad**) y que pueda consultarse/descargarse desde la app con permisos por rol.

---

## Objetivo

- Registrar y consultar **pruebas de presión** como evidencia técnica.
- Subir/almacenar los archivos exportados por el barómetro.
- Parsear el CSV para:
  - mostrar resumen (min/max/promedio, duración, fecha/hora)
  - permitir vista de la serie (tabla simple) y, opcionalmente, re-render de gráfica
- Mantener el patrón del sistema (similar a `pruebas` e `inspecciones`):
  - alta de registro
  - listado con filtros
  - detalle expandible

---

## Alcance (MVP)

- **Alta**: cargar archivos (PNG y CSV; ZIP opcional) + capturar metadatos mínimos.
- **Almacenamiento**:
  - Archivos en **Firebase Storage**.
  - Metadatos en **Firestore**.
- **Listado**:
  - listado por equipo
  - búsqueda por equipo/serial/cliente/actividad
  - abrir detalle (ver miniatura PNG, descargar CSV/ZIP)
- **Link directo**:
  - generar una URL con parámetros (equipo/serial/actividadId) para abrir el alta ya pre-llenada.

---

## Fuentes de datos existentes en XPCT

- Inventario (CSV local):
  - `docs/INVENTARIOTOTAL04-202602.csv`
  - `docs/invre.csv` / `docs/invre2.csv`
- Firestore:
  - `pruebas` (PND/calibraciones)
  - `inspecciones`
  - `actividades`

La prueba de presión es un **tipo diferente** a PND (VT/PT/MT/UTT/LT), así que se modela como entidad separada (para no romper reglas existentes).

---

## Propuesta de modelo (Firestore)

### Colección: `pruebasPresion`

Un documento por evento de prueba.

Campos sugeridos (MVP):

- Identificación:
  - `equipo` (string) — ej. `PCT-...`
  - `serial` (string)
  - `cliente` (string, opcional)
  - `actividadId` (string, opcional)
  - `oc`, `os` (opcionales; si se liga a actividad)
- Captura:
  - `fechaPrueba` (string `dd/mm/aa` o `dd/mm/aaaa`)
  - `horaPrueba` (string, opcional)
  - `tecnico` (string)
  - `ubicacion` (string, opcional)
  - `observaciones` (string)
- Evidencias (Storage):
  - `pngPath` (string) — ruta en Storage
  - `csvPath` (string) — ruta en Storage
  - `zipPath` (string, opcional) — ruta en Storage
  - `pngUrl` / `csvUrl` / `zipUrl` (opcionales; normalmente se obtienen con `getDownloadURL` en runtime)
- Resumen calculado desde CSV (para evitar re-parsear siempre):
  - `resumen` (map)
    - `min` (number)
    - `max` (number)
    - `avg` (number)
    - `duracionSeg` (number)
    - `unidad` (string, ej. `bar` / `psi`)
    - `muestras` (number)
    - `inicioTs` (timestamp, opcional)
    - `finTs` (timestamp, opcional)
- Auditoría:
  - `creadoEn` (serverTimestamp)
  - `creadoPor` (email)

Notas:
- `resumen` se calcula al momento del alta (cliente) o en un paso posterior (Cloud Function) si queremos mover carga del frontend.

---

## Firebase Storage (estructura sugerida)

Bucket:
- el mismo del proyecto

Paths:
- `pruebasPresion/<equipoNorm>/<yyyy>/<docId>/grafica.png`
- `pruebasPresion/<equipoNorm>/<yyyy>/<docId>/data.csv`
- `pruebasPresion/<equipoNorm>/<yyyy>/<docId>/evidencia.zip` (opcional)

`equipoNorm` = equipo en mayúsculas, sin espacios.

---

## UI / URLs

### Nuevas páginas (propuesta)

- `presion.html` — alta de prueba de presión
- `presionlist.html` — listado/visor

### Navegación

- En dropdown **Pruebas** agregar:
  - `Prueba de presión` → `presion.html`
  - `Listado presión` → `presionlist.html`

### URL params para pre-llenado

Casos de uso:

1) Desde un equipo seleccionado:

- `presion.html?equipo=PCT-...&serial=...`

2) Desde actividad:

- `presion.html?actividadId=<id>`

Comportamiento:
- Si viene `actividadId`, cargar la actividad y pre-llenar `equipo/serial/cliente/ubicacion/oc/os`.
- Si viene `equipo/serial`, pre-llenar desde inventario.

---

## CSV del barómetro: estrategia de parsing

### Necesitamos confirmar el formato

Para implementar el parser necesitamos definir:

- Separador: `,` o `;`
- Encabezados: nombres exactos de columnas
- Columna de tiempo: timestamp, `hh:mm:ss`, o índice de muestra
- Columna de presión: valor numérico + unidad

### Plan de parsing (robusto)

- Detectar separador por conteo de `,` vs `;` en la primera línea.
- Leer encabezados y mapear:
  - tiempo (`time`, `timestamp`, `fecha`, `DateTime`, etc.)
  - presión (`pressure`, `presion`, `P`, etc.)
- Convertir valores a `number`.
- Calcular resumen:
  - `min/max/avg`
  - `muestras`
  - `duracion` (si hay columna tiempo)

---

## Permisos / roles

Sugerencia alineada al sistema actual:

- **admin/director/supervisor**:
  - crear
  - editar metadatos (observaciones, fecha, técnico)
  - eliminar (solo admin/director, si se mantiene el patrón de `pruebas`)
- **capturista/inspector/visor**:
  - solo lectura (listado + ver evidencias)

---

## Reglas de integridad

- Requeridos para guardar:
  - `equipo`
  - `serial`
  - `fechaPrueba`
  - `tecnico`
  - `csv` (mínimo 1 evidencia: CSV o PNG; recomendado ambos)
- Validación de tamaño:
  - limitar CSV y ZIP (ej. 10–30 MB) para evitar problemas en móvil/tablet.

---

## Pendientes para la siguiente sesión (para cerrar el diseño)

- Confirmar:
  - **formato real del CSV** (subir 1 ejemplo)
  - si el CSV trae **unidad** (bar/psi)
  - si el PNG se guarda con nombre fijo o variable
- Decidir:
  - si se permite guardar solo con PNG (sin CSV)
  - si el ZIP será obligatorio o solo opcional
- Definir:
  - campos exactos de UI (cliente/actividad obligatorio o no)
  - si se requiere firma/folio/reporte para presión (similar a `noReporte` en `pruebas`)

---

## Entregables (cuando pasemos a implementación)

- Páginas:
  - `presion.html`
  - `presionlist.html`
- Script:
  - `presion.js` (alta + upload + parsing)
  - `presionlist.js` (listado + filtros)
- Actualización de `nav.js` para enlaces
- Reglas/índices Firestore si aplican

