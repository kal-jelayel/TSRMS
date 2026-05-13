/**
 * Parses DD/MM/YYYY (or D/M/YYYY) into ISO date yyyy-mm-dd. Returns "" if invalid.
 */
/** Formats yyyy-mm-dd (or ISO string starting with date) as dd/mm/yyyy. */
export function formatISODateToDMY(isoDate) {
  if (!isoDate || typeof isoDate !== "string") return "";
  const datePart = isoDate.length >= 10 ? isoDate.slice(0, 10) : isoDate;
  const m = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Formats a timestamp as dd/mm/yyyy HH:mm (24h, local). */
export function formatTimestampToDMYHM(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

export function parseDMYToISO(display) {
  if (!display || typeof display !== "string") return "";
  const trimmed = display.trim();
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
