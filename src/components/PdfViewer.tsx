import { useEffect, useRef, useState, useCallback } from 'react';
import { ActionIcon, Group, Text } from '@mantine/core';
import * as pdfjsLib from 'pdfjs-dist';
import '../lib/pdfExtractor'; // ensures worker is initialized
import { colors } from '../lib/styles';

export interface Rect {
  id: string;
  key: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  previewText?: string;
  anchorKeyword?: string;
  anchorOffsetX?: number;
  anchorOffsetY?: number;
}

interface Props {
  file: File;
  rects: Rect[];
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onTotalPages: (count: number) => void;
  onRectDrawn?: (rect: Omit<Rect, 'id' | 'key' | 'previewText'>) => void;
  onRectClick?: (rect: Rect) => void;
  selectedRectId?: string | null;
  onDocLoaded?: (doc: pdfjsLib.PDFDocumentProxy) => void;
}

export function PdfViewer({
  file,
  rects,
  currentPage,
  totalPages,
  onPageChange,
  onTotalPages,
  onRectDrawn,
  onRectClick,
  selectedRectId,
  onDocLoaded,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [rotation, setRotation] = useState(0);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      if (cancelled) { doc.destroy(); return; }
      setPdfDoc(prev => { prev?.destroy(); return doc; });
      setRotation(0);
      onTotalPages(doc.numPages);
      onDocLoaded?.(doc);
    };
    loadPdf();
    return () => {
      cancelled = true;
      setPdfDoc(prev => { prev?.destroy(); return null; });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only reload when file changes, callbacks are stable
  }, [file]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    let cancelled = false;
    let renderTask: { cancel(): void } | null = null;
    const renderPage = async () => {
      const page = await pdfDoc.getPage(currentPage);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.5, rotation });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const task = page.render({ canvasContext: ctx, viewport, canvas });
      renderTask = task;
      await task.promise;
    };
    renderPage().catch(() => {});
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pdfDoc, currentPage, rotation]);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const overlay = overlayRef.current!;
    const rect = overlay.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start drawing on left click on the overlay background
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.dataset.rectId) return; // clicked an existing rect
    const pos = getRelativePos(e);
    setDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
  }, [getRelativePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawCurrent(getRelativePos(e));
  }, [drawing, getRelativePos]);

  const handleMouseUp = useCallback(() => {
    if (!drawing || !drawStart || !drawCurrent) {
      setDrawing(false);
      return;
    }

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    // Minimum size threshold
    if (width > 1 && height > 1) {
      onRectDrawn?.({ page: currentPage, x, y, width, height });
    }

    setDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  }, [drawing, drawStart, drawCurrent, currentPage, onRectDrawn]);

  const pageRects = rects.filter(r => r.page === currentPage);

  return (
    <div>
      <nav aria-label="PDF page navigation">
        <Group justify="center" mb="sm">
          <ActionIcon variant="light" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} aria-label="Previous page">
            &lt;
          </ActionIcon>
          <Text size="sm" aria-live="polite">
            Page {currentPage} / {totalPages}
          </Text>
          <ActionIcon variant="light" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} aria-label="Next page">
            &gt;
          </ActionIcon>
          <ActionIcon variant="light" onClick={() => setRotation(r => (r + 90) % 360)} aria-label="Rotate page">
            ↻
          </ActionIcon>
        </Group>
      </nav>
      <div
        style={{ position: 'relative', display: 'inline-block', cursor: 'crosshair', userSelect: 'none' }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%', height: 'auto' }} role="img" aria-label={`PDF document page ${currentPage} of ${totalPages}`} />
        <div
          ref={overlayRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Existing rectangles */}
          {pageRects.map(r => (
            <div
              key={r.id}
              data-rect-id={r.id}
              role="button"
              tabIndex={0}
              aria-label={`Reading area: ${r.key || 'unnamed'}`}
              onClick={(e) => {
                e.stopPropagation();
                onRectClick?.(r);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onRectClick?.(r);
                }
              }}
              style={{
                position: 'absolute',
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.width}%`,
                height: `${r.height}%`,
                border: `2px solid ${selectedRectId === r.id ? colors.selected : colors.ok}`,
                backgroundColor: selectedRectId === r.id ? 'rgba(34,139,230,0.15)' : 'rgba(64,192,87,0.1)',
                cursor: 'pointer',
                boxSizing: 'border-box',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: -18,
                  left: 0,
                  fontSize: 11,
                  backgroundColor: selectedRectId === r.id ? colors.selected : colors.ok,
                  color: 'white',
                  padding: '1px 4px',
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}
              >
                {r.key || '(unnamed)'}
              </span>
            </div>
          ))}

          {/* Drawing rectangle */}
          {drawing && drawStart && drawCurrent && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(drawStart.x, drawCurrent.x)}%`,
                top: `${Math.min(drawStart.y, drawCurrent.y)}%`,
                width: `${Math.abs(drawCurrent.x - drawStart.x)}%`,
                height: `${Math.abs(drawCurrent.y - drawStart.y)}%`,
                border: `2px dashed ${colors.selected}`,
                backgroundColor: 'rgba(34,139,230,0.1)',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
