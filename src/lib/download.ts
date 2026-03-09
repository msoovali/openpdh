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

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_');
}
