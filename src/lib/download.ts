function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(content: string, filename: string) {
  downloadFile(content, filename, 'application/json');
}

export function downloadXML(content: string, filename: string) {
  downloadFile(content, filename, 'application/xml');
}

export function downloadCSV(content: string, filename: string) {
  downloadFile(content, filename, 'text/csv');
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.map(escapeCsvField).join(',');
  const lines = rows.map(row => keys.map(k => escapeCsvField(row[k] ?? '')).join(','));
  return [header, ...lines].join('\n');
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
}
