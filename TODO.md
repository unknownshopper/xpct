# TODO — Deuda técnica y pendientes del sistema

Lo que hay que corregir en el futuro para pasar de "muy bien hecho" a "difícil de tumbar".

## Datos / infraestructura

- [ ] **Migrar CSVs de runtime a Firestore** — `INVENTARIOTOTAL04-202602.csv`, `invre.csv`, `invre2.csv`, `certif.csv`, `noutt.csv`, `malescritos.csv`, `forxmat.csv` y el resto de `docs/` se leen en vivo por 11+ páginas. Ya existe la colección `equipos` (1,620 docs). Requiere loader compartido en `utils.js` con caché (localStorage/TTL) para no leer 1,620 docs por page-load.
- [ ] **Saneamiento del repo público** — los CSVs de negocio están en el repo público Y en su historial Git. Borrarlos no basta: purga real requiere reescritura de historial (destructivo) o repo privado (GitHub Pro). Decisión pendiente.
- [ ] **Dejar de traer colecciones completas para filtrar en JS** — hay consultas que hacen `getDocs` de todo y filtran en cliente (ej. `ordenes_salida` completo para matchear equipos, `inspecciones` completo para un equipo). Conforme crece la base, esto cobra cuota y lentitud. Consolidar en queries con `where` o resúmenes.
- [ ] **Consolidar consultas de inspecciones/pruebas por equipo** — para el dossier y contadores conviene un índice o `resumenes_equipos` más completo en vez de escanear.

## Código

- [ ] **Romper los monolitos HTML** — `inspectlist.html` (~4,500 líneas) y `pruebaslist.html` mezclan markup + JS + estilos inline. Cada cambio es cirugía. Candidato: extraer el JS a módulos (`inspectlist.js`, `ordenes.js`, etc.).
- [ ] **Tests** — cero cobertura automática. Mínimo: tests de las reglas de Firestore (emulator suite) y de la lógica de contadores (rechazados, no-atendidas, pendientes UTT).
- [ ] **Emails hardcodeados → claims** — `cops@pc-t.com.mx`, `sgi@pc-t.com.mx`, `auxndt@pct.com` aparecen como excepciones literales en UI y reglas. Cuando asignen el claim real a esas cuentas, quitar las excepciones por email.
- [ ] **Duplicación de lógica de contadores** — render, bootstrap y modal de `pruebaslist` repiten el cálculo de "última prueba rechazada por equipo". Extraer a función compartida.
- [ ] **`_control` doc en `ordenes_salida`** — el contador transaccional convive con documentos reales en la misma colección; funciona, pero una colección `config/contadores` sería más limpio.

## Operativo pendiente

- [ ] **Pizarrón PCT #7** — `PCT-CA-09` y `PCT-BP-03 ~ BP-06`: falta contexto de qué reportaron.
- [ ] **Validar flujo cop s en producción end-to-end** — despacho MIE/MII real (no de prueba), recepción y cierre automático.
- [ ] **`audit.html` dossier global** — opcional: exportar todas las órdenes o equipos en cuarentena por periodo para auditoría.
- [ ] **Revisar edo inventario vs realidad** — equipos marcados WIP que siguieron operando (ej. PCT-XO-290).

## Portofino (pendientes menores)

- [ ] Activar **Enforce HTTPS** en GitHub Pages cuando el cert termine de provisionarse.
- [ ] Limpiar subdominios cPanel huérfanos del DNS (`cpanel`, `whm`, `webdisk`, `ftp`, `admin`, `test`) si el hosting viejo murió — y cancelar ese hosting (posible PHP = superficie de ataque PHP2Shell).

## Nuevo: Servicio de inspecciones a particulares (B2C)

Ver sección de observaciones — en diseño. Regla de oro: **sin chocar con el inventario interno**.
