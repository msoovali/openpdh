import { useState, useCallback, useEffect, useRef } from 'react';
import { Button, TextInput, Stack, Paper, Text, Group, Card, CloseButton, Code, Notification, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PdfDropzone } from './PdfDropzone';
import { PdfViewer } from './PdfViewer';
import type { Rect } from './PdfViewer';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractSingleArea } from '../lib/pdfExtractor';
import { createConfig, updateConfig, getConfig } from '../lib/configStore';

interface Props {
  editConfigId: string | null;
  onDone: () => void;
}

export function ConfigureFlow({ editConfigId, onDone }: Props) {
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const [identifier, setIdentifier] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);

  // Load existing config when editing
  useEffect(() => {
    if (!editConfigId) return;
    const config = getConfig(editConfigId);
    if (config) {
      setIdentifier(config.identifier);
      setRects(
        config.areas.map(a => ({
          id: crypto.randomUUID(),
          key: a.key,
          page: a.page,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
        })),
      );
    }
  }, [editConfigId]);

  const runPreview = useCallback(async (doc: PDFDocumentProxy, rect: { id: string; page: number; x: number; y: number; width: number; height: number }) => {
    try {
      const text = await extractSingleArea(doc, rect);
      setRects(prev => prev.map(r => r.id === rect.id ? { ...r, previewText: text } : r));
    } catch {
      setRects(prev => prev.map(r => r.id === rect.id ? { ...r, previewText: 'ERROR: preview failed' } : r));
    }
  }, []);

  const handleDocLoaded = useCallback((doc: PDFDocumentProxy) => {
    pdfDocRef.current = doc;
    // Run previews for all existing rects
    setRects(prev => {
      for (const rect of prev) {
        runPreview(doc, rect);
      }
      return prev;
    });
  }, [runPreview]);

  const handleRectDrawn = useCallback(
    async (rect: Omit<Rect, 'id' | 'key' | 'previewText'>) => {
      const id = crypto.randomUUID();
      const newRect: Rect = { ...rect, id, key: '', previewText: undefined };
      setRects(prev => [...prev, newRect]);
      setSelectedRectId(id);

      if (pdfDocRef.current) {
        runPreview(pdfDocRef.current, { id, ...rect });
      }
    },
    [runPreview],
  );

  const handleKeyChange = useCallback((id: string, key: string) => {
    setRects(prev => prev.map(r => (r.id === id ? { ...r, key } : r)));
  }, []);

  const handleDeleteRect = useCallback((id: string) => {
    setRects(prev => prev.filter(r => r.id !== id));
    if (selectedRectId === id) setSelectedRectId(null);
  }, [selectedRectId]);

  const handleSave = async () => {
    if (!identifier.trim()) {
      setError('Please enter an identifier');
      return;
    }
    const unnamed = rects.filter(r => !r.key.trim());
    if (unnamed.length > 0) {
      setError('All areas must have a key identifier');
      return;
    }
    if (rects.length === 0) {
      setError('Please draw at least one area');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const areas = rects.map(r => ({
        key: r.key,
        page: r.page,
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }));

      if (editConfigId) {
        updateConfig(editConfigId, identifier.trim(), areas);
      } else {
        createConfig(identifier.trim(), areas);
      }
      onDone();
    } catch (err: any) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md">
      <Paper shadow="xs" p="sm" radius="md">
        <Group gap="sm" wrap="wrap" align="center">
          <TextInput
            placeholder="Configuration identifier (e.g., acme-documents)"
            value={identifier}
            onChange={e => setIdentifier(e.currentTarget.value)}
            size="xs"
            required
            style={{ flex: '1 1 180px', maxWidth: 280 }}
          />

          <PdfDropzone
            file={file}
            label="Select or drop PDF"
            onFileSelect={f => {
              setFile(f);
              setSelectedRectId(null);
              setCurrentPage(1);
            }}
          />

          <Group gap="xs">
            <Button size="xs" onClick={handleSave} loading={saving} disabled={rects.length === 0 || !identifier.trim() || rects.some(r => !r.key.trim())}>
              {editConfigId ? 'Update' : 'Save'}
            </Button>
            <Button size="xs" variant="light" onClick={onDone}>
              Cancel
            </Button>
          </Group>
        </Group>
      </Paper>

      {error && (
        <Notification color="red" onClose={() => setError(null)}>
          {error}
        </Notification>
      )}

      <div style={{
        display: 'flex',
        flexDirection: isSmall ? 'column' : 'row',
        alignItems: 'flex-start',
        gap: 'var(--mantine-spacing-md)',
      }}>
        <Paper shadow="xs" p="sm" radius="md" style={{
          width: isSmall ? '100%' : (file ? 320 : '100%'),
          flexShrink: 0,
          order: isSmall ? 0 : 1,
        }}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            Areas ({rects.length})
          </Text>

          {rects.length === 0 && (
            <Text size="sm" c="dimmed">
              {file ? 'Draw rectangles on the PDF to define reading areas.' : 'Select a PDF to start defining areas.'}
            </Text>
          )}

          <Stack gap="xs">
            {rects.map(r => (
              <Card
                key={r.id}
                withBorder
                padding="xs"
                radius="sm"
                style={{
                  borderColor: selectedRectId === r.id ? '#228be6' : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setSelectedRectId(r.id);
                  setCurrentPage(r.page);
                }}
              >
                <Group justify="space-between" wrap="nowrap" mb={4}>
                  <TextInput
                    size="xs"
                    placeholder="Key (e.g., document_number)"
                    value={r.key}
                    onChange={e => handleKeyChange(r.id, e.currentTarget.value)}
                    onClick={e => e.stopPropagation()}
                    style={{ flex: 1 }}
                  />
                  <CloseButton
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleDeleteRect(r.id);
                    }}
                  />
                </Group>
                <Text size="xs" c="dimmed">Page {r.page}</Text>
                {r.previewText !== undefined && (
                  <Code block mt={4} style={{ fontSize: 11, maxHeight: 60, overflow: 'auto' }}>
                    {r.previewText}
                  </Code>
                )}
              </Card>
            ))}
          </Stack>
        </Paper>

        {file && (
          <Paper shadow="xs" p="sm" radius="md" style={{
            flex: 1,
            minWidth: 0,
            width: isSmall ? '100%' : undefined,
            order: isSmall ? 1 : 0,
          }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
              PDF preview
            </Text>
            <PdfViewer
              file={file}
              rects={rects}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              onTotalPages={setTotalPages}
              onRectDrawn={handleRectDrawn}
              onRectClick={r => setSelectedRectId(r.id)}
              selectedRectId={selectedRectId}
              onDocLoaded={handleDocLoaded}
            />
          </Paper>
        )}
      </div>
    </Stack>
  );
}
