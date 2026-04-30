// Output rendering. Default: JSON. Optional human-readable.
//
// We do not try to be clever — for arbitrary nested data, JSON wins.
// `--text` for the few responses where a flat table or one-paragraph
// summary is genuinely more useful.

export function renderJson(value) {
  return JSON.stringify(value, null, 2);
}

// Render a flat array of objects as a fixed-width table. Objects with
// nested values get JSON-stringified for that cell.
export function renderTable(rows, columns) {
  if (!Array.isArray(rows) || rows.length === 0) return '(no rows)';
  const cols = columns || Object.keys(rows[0]);
  const data = rows.map((r) => cols.map((c) => stringify(r[c])));
  const widths = cols.map((c, i) =>
    Math.max(c.length, ...data.map((row) => row[i].length))
  );
  const lines = [];
  lines.push(cols.map((c, i) => c.padEnd(widths[i])).join('  '));
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of data) {
    lines.push(row.map((cell, i) => cell.padEnd(widths[i])).join('  '));
  }
  return lines.join('\n');
}

function stringify(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

// Smart render: prefer table for arrays of flat objects, JSON otherwise.
export function renderSmart(value) {
  if (Array.isArray(value) && value.length > 0 && value.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
    return renderTable(value);
  }
  return renderJson(value);
}
