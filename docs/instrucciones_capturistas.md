# Instrucciones para Capturistas: Llenado de formato_pruebas.csv

Estas instrucciones indican cómo llenar y exportar el archivo CSV para cargar pruebas en lote. Un administrador realizará la importación; tú solo debes preparar el archivo correctamente.

## Encabezados (mantener nombres y orden exactos)
Coloca estas cabeceras en la primera fila del archivo y respeta mayúsculas/minúsculas y acentos en los valores indicados.

cliente,equipo,numeroSerie,periodo,prueba,fechaRealizacion,noReporte,resultado,ejecucion,emisor,pruebaDetalle,observaciones,ubicacion,areaPrueba,tecnico,proxima

## Campos requeridos y reglas
- cliente (Requerido): nombre del cliente.
- equipo (Requerido): nombre del equipo tal como aparece en inventario.
- numeroSerie (Requerido): número de serie exacto.
- periodo (Requerido): ANUAL | POST-TRABAJO | REPARACION.
- prueba (Requerido): LT | VT | PT | MT | UTT u otros según catálogo.
- fechaRealizacion (Requerido): formato dd/mm/aaaa. Ejemplo: 15/12/2025.
- noReporte (Requerido): número de reporte o certificado.
- resultado (Requerido): APROBADA | RECHAZADA | N/A.
- ejecucion (Opcional): INTERNO | EXTERNO. Si INTERNO, el emisor se fijará en PCT.
- emisor (Opcional): requerido si ejecucion=EXTERNO.
- pruebaDetalle (Opcional): requerido cuando la prueba sea VT, PT o MT y aplique catálogo.
- observaciones (Opcional): texto libre.
- ubicacion (Opcional): ubicación del servicio.
- areaPrueba (Opcional): área de prueba.
- tecnico (Opcional): nombre del técnico.
- proxima (Opcional): SOLO para ANUAL. Si se deja vacío, la próxima se calculará automáticamente conforme a la lógica vigente.

Importante:
- Los registros de POST-TRABAJO y REPARACION no deben llevar "proxima"; heredarán la fecha y estado del ANUAL más reciente del mismo equipo.
- Si no existe un ANUAL previo, se permitirá la carga y en el sistema se mostrará N/A en Próxima/Estado.
- El equipo y numeroSerie deben existir en inventario y no estar en estado OFF/WIP.

## Ejemplos
- ANUAL con próxima explícita:
ACME,Winch-10T,SN123,ANUAL,LT,15/12/2025,LT-001,APROBADA,INTERNO,,N/A,OK general,Planta A,Área 1,Juan Perez,15/12/2026

- POST-TRABAJO heredando Próxima del ANUAL:
ACME,Winch-10T,SN123,POST-TRABAJO,VT,20/12/2025,VT-077,APROBADA,EXTERNO,ProveedorX,VT-General,Post mantenimiento,Planta A,Área 1,Maria Lopez,

- REPARACION interno:
ACME,Grúa-5T,SN987,REPARACION,PT,22/12/2025,PT-045,APROBADA,INTERNO,,PT-General,,Planta B,Zona 3,Carlos Díaz,

## Buenas prácticas al llenar
- Usa UTF-8. Evita caracteres especiales no estándar.
- Evita comas dentro de los campos. Si son necesarias, rodea el valor con comillas dobles.
- No dejes filas con datos incompletos en campos requeridos.
- Asegúrate de que las fechas estén en dd/mm/aaaa.
- Valida que equipo y numeroSerie existan en inventario.

## Cómo exportar a CSV desde Excel
1. Copia los encabezados exactos en la primera fila.
2. Llena los datos en filas siguientes.
3. Archivo → Guardar como → Formato CSV (delimitado por comas) (*.csv).
4. Si es posible, selecciona codificación UTF-8.
5. Verifica que el separador es coma "," (no punto y coma ";").

## Entrega del archivo
- Nombra el archivo como formato_pruebas.csv.
- Envía el archivo al administrador para su importación.
- El administrador realizará una validación previa (dry-run) y te devolverá observaciones si hay errores.
