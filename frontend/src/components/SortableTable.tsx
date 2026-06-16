import { ReactNode, useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string | number;
  render?: (row: T) => ReactNode;
  filter?: boolean;
}

/** Таблица с сортировкой и фильтром по всем колонкам (зам.6, зам.13). */
export default function SortableTable<T>({
  columns, rows, rowKey, initialSort, emptyText = "Нет данных",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  initialSort?: { key: string; dir: "asc" | "desc" };
  emptyText?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "asc" as "asc" | "desc" });
  const [filters, setFilters] = useState<Record<string, string>>({});

  const view = useMemo(() => {
    let r = rows.filter((row) =>
      columns.every((c) => {
        const f = filters[c.key]?.trim().toLowerCase();
        return !f || String(c.value(row) ?? "").toLowerCase().includes(f);
      })
    );
    const col = columns.find((c) => c.key === sort.key);
    if (col) {
      r = [...r].sort((a, b) => {
        const va = col.value(a), vb = col.value(b);
        const cmp = typeof va === "number" && typeof vb === "number"
          ? va - vb : String(va).localeCompare(String(vb), "ru");
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    return r;
  }, [rows, columns, filters, sort]);

  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} className="sortable" onClick={() => toggle(c.key)}>
              {c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
            </th>
          ))}
        </tr>
        <tr>
          {columns.map((c) => (
            <th key={c.key}>
              {c.filter === false ? null : (
                <input
                  aria-label={`Фильтр: ${c.label}`}
                  value={filters[c.key] ?? ""}
                  onChange={(e) => setFilters({ ...filters, [c.key]: e.target.value })}
                  placeholder="фильтр"
                  style={{ fontWeight: 400, textTransform: "none" }}
                />
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {view.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : c.value(row)}</td>)}
          </tr>
        ))}
        {view.length === 0 && <tr><td colSpan={columns.length} className="muted">{emptyText}</td></tr>}
      </tbody>
    </table>
  );
}
