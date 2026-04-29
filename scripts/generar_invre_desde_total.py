import csv
from pathlib import Path
from datetime import datetime


def read_csv(path: Path):
    with path.open('r', encoding='utf-8', newline='') as f:
        return list(csv.reader(f))


def write_csv(path: Path, rows):
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerows(rows)


def main():
    root = Path(__file__).resolve().parents[1]
    src = root / 'docs' / 'INVENTARIOTOTAL04-2026.csv'
    invre = root / 'docs' / 'invre.csv'

    if not src.exists():
        raise SystemExit(f'No existe: {src}')
    if not invre.exists():
        raise SystemExit(f'No existe: {invre}')

    src_rows = read_csv(src)
    invre_rows = read_csv(invre)

    if not src_rows or not invre_rows:
        raise SystemExit('CSV vacío')

    src_header = src_rows[0]
    invre_header = invre_rows[0]

    wanted = [h.strip() for h in invre_header]
    src_index = {}
    for i, h in enumerate(src_header):
        key = h.strip()
        if key and key not in src_index:
            src_index[key] = i

    missing = [h for h in wanted if h not in src_index]
    if missing:
        raise SystemExit('Faltan columnas en INVENTARIOTOTAL04-2026.csv: ' + ', '.join(missing))

    keep_idx = [src_index[h] for h in wanted]

    out_rows = [invre_header]
    for r in src_rows[1:]:
        if len(r) < len(src_header):
            r = r + [''] * (len(src_header) - len(r))
        out_rows.append([r[i] for i in keep_idx])

    ts = datetime.now().strftime('%Y%m%d-%H%M%S')
    bak = invre.with_suffix(f'.csv.bak.{ts}')
    bak.write_bytes(invre.read_bytes())

    write_csv(invre, out_rows)

    print('OK')
    print('Source:', src)
    print('Output:', invre)
    print('Backup:', bak)
    print('Rows written:', len(out_rows) - 1)


if __name__ == '__main__':
    main()
