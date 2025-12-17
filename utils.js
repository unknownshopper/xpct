// Utilidades compartidas en el frontend

// parseCSVLine: divide una línea CSV simple en columnas, respetando comillas dobles básicas.
// Se asume un formato sin saltos de línea embebidos y separador coma.
function parseCSVLine(linea) {
    const resultado = [];
    let actual = '';
    let enComillas = false;

    for (let i = 0; i < linea.length; i++) {
        const ch = linea[i];

        if (ch === '"') {
            if (enComillas && i + 1 < linea.length && linea[i + 1] === '"') {
                actual += '"';
                i++;
            } else {
                enComillas = !enComillas;
            }
        } else if (ch === ',' && !enComillas) {
            resultado.push(actual);
            actual = '';
        } else {
            actual += ch;
        }
    }

    if (actual.length > 0) {
        resultado.push(actual.trim());
        actual = '';
    }

    return resultado;
}

// Exponer en window para los scripts no-módulo que ya esperan parseCSVLine en global
if (typeof window !== 'undefined') {
    window.parseCSVLine = window.parseCSVLine || parseCSVLine;
}
