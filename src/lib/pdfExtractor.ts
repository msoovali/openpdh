import type { PDFDocumentProxy } from 'pdfjs-dist';

interface CharInfo {
  char: string;
  x: number;
  y: number;
  fontSize: number;
}

interface AreaDef {
  key: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PageInfo {
  width: number;
  height: number;
  chars: CharInfo[];
}

async function extractPageInfo(doc: PDFDocumentProxy): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
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

    pages.push({ width: viewport.width, height: viewport.height, chars });
  }

  return pages;
}

function extractTextFromArea(pageInfo: PageInfo, area: { x: number; y: number; width: number; height: number }): string {
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

export async function extractFromAreas(doc: PDFDocumentProxy, areas: AreaDef[]): Promise<Record<string, string>> {
  const pages = await extractPageInfo(doc);
  const result: Record<string, string> = {};

  for (const area of areas) {
    const pageIndex = area.page - 1;
    if (pageIndex < 0 || pageIndex >= pages.length) {
      result[area.key] = 'ERROR: could not parse (page not found)';
      continue;
    }
    const text = extractTextFromArea(pages[pageIndex], area);
    result[area.key] = text || 'ERROR: could not parse';
  }

  return result;
}

export async function extractSingleArea(doc: PDFDocumentProxy, area: { page: number; x: number; y: number; width: number; height: number }): Promise<string> {
  const pages = await extractPageInfo(doc);
  const pageIndex = area.page - 1;

  if (pageIndex < 0 || pageIndex >= pages.length) {
    return 'ERROR: could not parse (page not found)';
  }

  const text = extractTextFromArea(pages[pageIndex], area);
  return text || 'ERROR: could not parse';
}
