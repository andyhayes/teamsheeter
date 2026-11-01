import { useState, type ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  title?: string;
  value: (row: T) => number | string;
  render?: (row: T) => ReactNode;
  /** Right-aligned numeric column (default true unless the values are strings). */
  numeric?: boolean;
}

/** A table sortable by any column (click a header; click again to reverse). Numbers sort high first. */
export function SortableTable<T>({ rows, columns, rowKey, initialSort }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; initialSort?: string }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean }>({ key: initialSort ?? columns[0].key, desc: true });
  const col = columns.find((c) => c.key === sort.key) ?? columns[0];
  const sorted = [...rows].sort((a, b) => {
    const x = col.value(a);
    const y = col.value(b);
    const cmp = typeof x === 'number' && typeof y === 'number' ? y - x : String(x).localeCompare(String(y), undefined, { numeric: true });
    return sort.desc ? cmp : -cmp;
  });
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                title={c.title}
                className={`${c.numeric !== false ? 'num' : ''} ${sort.key === c.key ? 'sorted' : ''}`}
                onClick={() => setSort((s) => ({ key: c.key, desc: s.key === c.key ? !s.desc : true }))}
              >
                {c.label}
                {sort.key === c.key && <span aria-hidden>{sort.desc ? ' ▾' : ' ▴'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric !== false ? 'num' : ''}>
                  {c.render ? c.render(r) : c.value(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
