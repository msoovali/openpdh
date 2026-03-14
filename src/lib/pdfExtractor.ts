import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Area } from './configStore';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function loadPdfDocument(file: File): Promise<PDFDocumentProxy> {
  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

interface CharInfo {
  char: string;
  x: number;
  y: number;
  fontSize: number;
}

export interface PageInfo {
  width: number;
  height: number;
  chars: CharInfo[];
}

export async function extractSinglePageInfo(doc: PDFDocumentProxy, pageNum: number): Promise<PageInfo> {
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  const chars: CharInfo[] = [];

  for (const item of textContent.items) {
    if (!('str' in item)) continue;
    const str = item.str;
    if (!str) continue;

    const itemX = item.transform[4];
    const itemY = item.transform[5];
    const fontSize = Math.abs(item.transform[3]) || Math.abs(item.transform[0]);
    const itemWidth = item.width;

    const charWidth = str.length > 0 ? itemWidth / str.length : 0;

    for (let c = 0; c < str.length; c++) {
      chars.push({
        char: str[c],
        x: itemX + c * charWidth,
        y: itemY,
        fontSize,
      });
    }
  }

  return { width: viewport.width, height: viewport.height, chars };
}

export function extractTextFromArea(pageInfo: PageInfo, area: { x: number; y: number; width: number; height: number }): string {
  const areaLeft = (area.x / 100) * pageInfo.width;
  const areaTop = (area.y / 100) * pageInfo.height;
  const areaRight = ((area.x + area.width) / 100) * pageInfo.width;
  const areaBottom = ((area.y + area.height) / 100) * pageInfo.height;

  const pdfAreaBottom = pageInfo.height - areaBottom;
  const pdfAreaTop = pageInfo.height - areaTop;

  const matched = pageInfo.chars.filter(ch => {
    const midY = ch.y + ch.fontSize / 2;
    return ch.x >= areaLeft && ch.x < areaRight && midY >= pdfAreaBottom && midY <= pdfAreaTop;
  });

  matched.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2) return yDiff;
    return a.x - b.x;
  });

  const lines: string[] = [];
  let currentLine: string[] = [];
  let lastY: number | null = null;

  for (const ch of matched) {
    if (lastY !== null && Math.abs(ch.y - lastY) > 2) {
      if (currentLine.length > 0) lines.push(currentLine.join(''));
      currentLine = [];
    }
    currentLine.push(ch.char);
    lastY = ch.y;
  }
  if (currentLine.length > 0) lines.push(currentLine.join(''));

  return lines.map(l => l.trim()).join('\n').trim();
}

export function hasExtractionError(data: Record<string, string>): boolean {
  return Object.values(data).some(v => !v || v.startsWith('ERROR:'));
}

export function findKeywordPosition(pageInfo: PageInfo, keyword: string): { x: number; y: number } | null {
  const chars = [...pageInfo.chars];
  // Sort top-to-bottom (descending PDF Y), then left-to-right
  chars.sort((a, b) => {
    const yDiff = b.y - a.y;
    if (Math.abs(yDiff) > 2) return yDiff;
    return a.x - b.x;
  });

  // Group into lines
  const lines: { chars: CharInfo[] }[] = [];
  let currentLine: CharInfo[] = [];
  let lastY: number | null = null;

  for (const ch of chars) {
    if (lastY !== null && Math.abs(ch.y - lastY) > 2) {
      if (currentLine.length > 0) lines.push({ chars: currentLine });
      currentLine = [];
    }
    currentLine.push(ch);
    lastY = ch.y;
  }
  if (currentLine.length > 0) lines.push({ chars: currentLine });

  const lowerKeyword = keyword.toLowerCase();

  for (const line of lines) {
    const text = line.chars.map(c => c.char).join('');
    const idx = text.toLowerCase().indexOf(lowerKeyword);
    if (idx !== -1) {
      const matchChar = line.chars[idx];
      // Convert PDF coords to percentage coords (with Y-axis inversion)
      const xPct = (matchChar.x / pageInfo.width) * 100;
      const yPct = ((pageInfo.height - matchChar.y) / pageInfo.height) * 100;
      return { x: xPct, y: yPct };
    }
  }

  return null;
}

export async function extractFromAreas(doc: PDFDocumentProxy, areas: Area[]): Promise<Record<string, string>> {
  const neededPages = [...new Set(areas.map(a => a.page))];
  const pageMap = new Map<number, PageInfo>();
  await Promise.all(neededPages.map(async p => {
    if (p >= 1 && p <= doc.numPages) {
      pageMap.set(p, await extractSinglePageInfo(doc, p));
    }
  }));

  const result: Record<string, string> = {};
  for (const area of areas) {
    const pageInfo = pageMap.get(area.page);
    if (!pageInfo) {
      result[area.key] = '';
      continue;
    }

    let effectiveArea = { x: area.x, y: area.y, width: area.width, height: area.height };

    if (area.anchorKeyword) {
      const kwPos = findKeywordPosition(pageInfo, area.anchorKeyword);
      if (kwPos) {
        const newX = Math.max(0, Math.min(100 - area.width, kwPos.x + (area.anchorOffsetX ?? 0)));
        const newY = Math.max(0, Math.min(100 - area.height, kwPos.y + (area.anchorOffsetY ?? 0)));
        effectiveArea = { x: newX, y: newY, width: area.width, height: area.height };
      }
    }

    const text = extractTextFromArea(pageInfo, effectiveArea);
    result[area.key] = text;
  }

  return result;
}
