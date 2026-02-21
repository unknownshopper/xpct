# INVIVAPP — Guía para preparar extractos de código (INDAUTOR)

## Objetivo

Preparar extractos representativos del código fuente (inicio/fin y secciones clave) para anexarlos al expediente, sin exponer secretos.

## Reglas

- Excluir credenciales, llaves y secretos (ver `../CHECKLIST_EXCLUSIONES.md`).
- Es válido anexar extractos en **TXT** o **PDF**.
- Para cada archivo recomendado:
  - Inicio (primeras 30–60 líneas)
  - Parte representativa (30–120 líneas donde esté la lógica principal)
  - Fin (últimas 30–60 líneas)

## Archivos sugeridos (alta representatividad)

### Frontend (cliente web)
- `index.html`
- `nav.js`
- `script.js`
- `inspeccion.js`
- `pruebas.js`
- `dashboard.js`
- `style.css`

### Páginas con lógica importante
- `pruebaslist.html`
- `inspectlist.html`
- `actividadmin.html`

### Backend/servicios (si se registra como obra integral)
- `server/index.js`

## Entrega sugerida

Crear dentro de esta carpeta:

- `extracto_index_html.txt`
- `extracto_script_js.txt`
- `extracto_pruebas_js.txt`
- `extracto_inspeccion_js.txt`
- `extracto_server_index_js.txt`

Si prefieres incluir más código (más allá del mínimo), mantén la sanitización estricta.
