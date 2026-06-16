/** Форматирование дат с учётом таймзоны браузера (UTC на бэкенде). */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const s = iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
