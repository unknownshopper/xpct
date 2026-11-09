# TODOOP — Flujo operativo de seguimiento de equipos (post-trabajo)

Modelo del pizarrón PCT (nov-2026). Interés principal: **dar seguimiento a los equipos**.

## Entradas al flujo

| Origen | Destino inicial |
|---|---|
| Equipos fuera (rentas) que regresan | Cuarentena → Externo / Mantenimiento general |
| Equipos devolución cliente (post-job) | Batería de bloques completa |

**Candado de salida**: un equipo SOLO puede salir/volverse a rentar si tiene su **reporte anual vigente** (punto 3 del pizarrón: disponibilidad = reportes vigentes anuales).

## Cadena de bloques (aplica a TODOS los que regresan)

```
Trabajo → Regresan (RECEPCIÓN)
   ↓
BLOQUE A: VT / UTT
   ↓
DECISIÓN según resultados ──(daño)──→ CUARENTENA → MIE (externo) / Mantto Gral
   ↓ (apto)
BLOQUE B: MT / PT
   ↓
BLOQUE C: PH (prueba hidrostática)
   ↓
BLOQUE D: Mantenimiento (incl. pintura)
   ↓
OPERATIVO — disponible para salir (si anual vigente)
```

- **VT** = visual · **UTT** = ultrasonido · **MT** = magnetic particles · **PT** = líquidos penetrantes (LT) · **PH** = prueba hidrostática
- Cada etapa genera su documento: checklist ✓/✗, observaciones, evidencia fotográfica
- La decisión de cuarentena se toma tras el bloque VT/UTT según resultados
- Contexto: todo opera dentro del proceso **post-trabajo**

## Por definir

- [ ] **"F/O"** del pizarrón — punto ② no identificado (¿folio/orden? ¿formato oficial?)
- [ ] Si MT/PT y PH tienen también su punto de decisión a cuarentena o solo VT/UTT decide
- [ ] Quién documenta cada bloque (¿mismo inspector o secciones por especialidad?)
- [ ] Orden estricto vs. paralelo — pizarrón dice "se hace en bloques": VT/UTT primero, ¿B/C/D siempre en ese orden?
- [ ] Mantto general vs. pintura — ¿el bloque D es reacondicionamiento cosmético (pintura) o mantenimiento general completo?

## Modelado propuesto (a discutir)

- Doc `servicios_bloques` o campo `etapas` por equipo: `post-trabajo → vt/utt → decisión → mt/pt → ph → mantto → operativo` con estado por etapa (pendiente/aprobado/derivado a cuarentena)
- Reusar evidencias + firmas + observaciones de inspecciones
- Gate de salida: verificar `vigenciaAnual` antes de permitir renta/despacho
- Referencia visual: `operaflux.html`
