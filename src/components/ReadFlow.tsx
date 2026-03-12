import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Stack, Select, Button, ActionIcon, Code, Group, Text, Notification, Paper, Progress, Card, CloseButton, Checkbox, Tooltip, useMantineTheme } from '@mantine/core';
import { IconArrowLeft, IconPencil, IconCopy as IconClone, IconAlertTriangle } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { PdfDropzone } from './PdfDropzone';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { listConfigs, getConfig } from '../lib/configStore';
import { loadPdfDocument, extractFromAreas } from '../lib/pdfExtractor';
import { downloadJSON, downloadXML, sanitizeFilename } from '../lib/download';
import { generatePain001, generatePain001Multi, parseDateToYMD } from '../lib/painXmlGenerator';
import type { Pain001Transaction } from '../lib/painXmlGenerator';
import { useFiles } from '../lib/fileStore';
import { PdfViewer } from './PdfViewer';
import type { Rect } from './PdfViewer';

interface FileResult {
  filename: string;
  data: Record<string, string>;
  error?: string;
}

interface Props {
  initialConfigId?: string | null;
  onEditTemplate?: (id: string) => void;
  onCloneEditTemplate?: (id: string) => void;
}

export function ReadFlow({ initialConfigId, onEditTemplate, onCloneEditTemplate }: Props) {
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const configs = useMemo(() => listConfigs(), []);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(initialConfigId ?? null);
  const { files, setFiles } = useFiles();
  const [results, setResults] = useState<FileResult[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const previewDocRef = useRef<PDFDocumentProxy | null>(null);
  const extractionIdRef = useRef(0);

  const handleDocLoaded = useCallback((doc: PDFDocumentProxy) => {
    previewDocRef.current = doc;
  }, []);

  // Build rects from selected config areas
  const rects = useMemo<Rect[]>(() => {
    if (!selectedConfigId) return [];
    const config = getConfig(selectedConfigId);
    if (!config) return [];
    return config.areas.map(a => ({
      id: crypto.randomUUID(),
      key: a.key,
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
    }));
  }, [selectedConfigId]);

  // Batch extraction when files and config are ready
  useEffect(() => {
    if (files.length === 0 || !selectedConfigId) return;
    const config = getConfig(selectedConfigId);
    if (!config) return;

    const id = ++extractionIdRef.current;
    let cancelled = false;

    const run = async () => {
      setExtracting(true);
      setError(null);
      setResults(null);
      setProgress({ done: 0, total: files.length });

      const collected: FileResult[] = [];
      for (let i = 0; i < files.length; i++) {
        if (cancelled) return;
        try {
          const doc = await loadPdfDocument(files[i]);
          const data = await extractFromAreas(doc, config.areas);
          doc.destroy();
          collected.push({ filename: files[i].name, data });
        } catch (err: unknown) {
          collected.push({
            filename: files[i].name,
            data: {},
            error: err instanceof Error ? err.message : 'Extraction failed',
          });
        }
        if (!cancelled) setProgress({ done: i + 1, total: files.length });
      }

      if (!cancelled) {
        setResults(collected);
        setExtracting(false);
        setProgress(null);
      }
    };

    run();
    return () => { cancelled = true; extractionIdRef.current = id; };
  }, [files, selectedConfigId]);

  const selectedConfig = useMemo(
    () => selectedConfigId ? getConfig(selectedConfigId) : null,
    [selectedConfigId],
  );

  const activeFile = files[activeFileIndex] ?? null;
  const [wrapInArray, setWrapInArray] = useState(false);

  const combinedJson = useMemo(() => {
    if (!results) return null;
    const arr = results.map(r => r.data);
    if (arr.length === 1) return wrapInArray ? arr : arr[0];
    return arr;
  }, [results, wrapInArray]);

  const handleDownloadJson = () => {
    if (combinedJson === null) return;
    const name = sanitizeFilename(selectedConfig?.identifier ?? 'extracted-data');
    const suffix = results && results.length > 1 ? `_batch_${results.length}` : '';
    downloadJSON(JSON.stringify(combinedJson, null, 2), `${name}${suffix}.json`);
  };

  const handleDownloadXml = () => {
    if (!results || !selectedConfig?.paymentOrder) return;
    const { fieldMappings, payerName, payerIban, payerBic, currency } = selectedConfig.paymentOrder;

    if (results.length === 1) {
      const r = results[0].data;
      const xml = generatePain001({
        payerName, payerIban, payerBic, currency,
        beneficiaryName: r[fieldMappings.beneficiaryName] ?? '',
        beneficiaryIban: r[fieldMappings.beneficiaryIban] ?? '',
        amount: r[fieldMappings.amount] ?? '',
        referenceNumber: fieldMappings.referenceNumber ? r[fieldMappings.referenceNumber] : undefined,
        paymentDescription: r[fieldMappings.paymentDescription] ?? '',
        dueDate: r[fieldMappings.dueDate] ?? '',
        identifier: selectedConfig.identifier,
      });
      const parsedDate = parseDateToYMD(r[fieldMappings.dueDate] ?? '');
      downloadXML(xml, `${sanitizeFilename(selectedConfig.identifier)}_${parsedDate}.xml`);
    } else {
      const transactions: Pain001Transaction[] = results
        .filter(r => !r.error)
        .map(r => ({
          beneficiaryName: r.data[fieldMappings.beneficiaryName] ?? '',
          beneficiaryIban: r.data[fieldMappings.beneficiaryIban] ?? '',
          amount: r.data[fieldMappings.amount] ?? '',
          referenceNumber: fieldMappings.referenceNumber ? r.data[fieldMappings.referenceNumber] : undefined,
          paymentDescription: r.data[fieldMappings.paymentDescription] ?? '',
          dueDate: r.data[fieldMappings.dueDate] ?? '',
        }));
      if (transactions.length === 0) return;
      const xml = generatePain001Multi({
        payerName, payerIban, payerBic, currency,
        identifier: selectedConfig.identifier,
        transactions,
      });
      downloadXML(xml, `${sanitizeFilename(selectedConfig.identifier)}_batch_${transactions.length}.xml`);
    }
  };

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(newFiles);
    setResults(null);
    setActiveFileIndex(0);
    setCurrentPage(1);
    previewDocRef.current = null;
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    const nextResults = results ? results.filter((_, i) => i !== index) : null;
    setFiles(next);
    setResults(next.length > 0 ? nextResults : null);
    setActiveFileIndex(prev => {
      if (next.length === 0) return 0;
      if (prev >= next.length) return next.length - 1;
      return prev;
    });
  };

  const selectFile = (index: number) => {
    setActiveFileIndex(index);
    setCurrentPage(1);
    previewDocRef.current = null;
  };

  const errorCount = results?.filter(r => r.error || Object.values(r.data).some(v => !v || v.startsWith('ERROR:'))).length ?? 0;

  return (
    <Stack gap="md" style={{ maxWidth: 1200, marginInline: 'auto' }}>
      <Paper shadow="xs" p="sm" radius="md">
        {isSmall ? (
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap">
              <ActionIcon variant="subtle" size="sm" onClick={() => history.back()} title="Back" style={{ flexShrink: 0 }}>
                <IconArrowLeft size={16} />
              </ActionIcon>
              <PdfDropzone
                multiple
                files={files}
                label="Select or drop PDFs"
                onFilesChange={handleFilesChange}
              />
              <Select
                placeholder="Choose template"
                data={configs.map(c => ({ value: c.id, label: c.identifier }))}
                value={selectedConfigId}
                onChange={setSelectedConfigId}
                size="xs"
                style={{ flex: 1, minWidth: 0 }}
              />
            </Group>
            {selectedConfigId && (
              <Group gap="xs" justify="flex-end">
                {onEditTemplate && (
                  <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => onEditTemplate(selectedConfigId)}>
                    Edit template
                  </Button>
                )}
                {onCloneEditTemplate && (
                  <Button size="xs" variant="light" leftSection={<IconClone size={14} />} onClick={() => onCloneEditTemplate(selectedConfigId)}>
                    Clone & edit
                  </Button>
                )}
              </Group>
            )}
          </Stack>
        ) : (
          <Group gap="sm" wrap="nowrap" align="center" justify="space-between">
            <Group gap="sm" wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              <ActionIcon variant="subtle" size="sm" onClick={() => history.back()} title="Back" style={{ flexShrink: 0 }}>
                <IconArrowLeft size={16} />
              </ActionIcon>
              <PdfDropzone
                multiple
                files={files}
                label="Select or drop PDFs"
                onFilesChange={handleFilesChange}
              />
              <Select
                placeholder="Choose template"
                data={configs.map(c => ({ value: c.id, label: c.identifier }))}
                value={selectedConfigId}
                onChange={setSelectedConfigId}
                size="xs"
                style={{ flex: '1 1 120px', maxWidth: 280, minWidth: 0 }}
              />
            </Group>
            {selectedConfigId && (
              <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
                {onEditTemplate && (
                  <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={() => onEditTemplate(selectedConfigId)}>
                    Edit template
                  </Button>
                )}
                {onCloneEditTemplate && (
                  <Button size="xs" variant="light" leftSection={<IconClone size={14} />} onClick={() => onCloneEditTemplate(selectedConfigId)}>
                    Clone & edit
                  </Button>
                )}
              </Group>
            )}
          </Group>
        )}
      </Paper>

      {files.length === 0 && !results && (
        <Paper shadow="xs" p="md" radius="md">
          <Stack gap="xs">
            <Text size="sm" fw={500}>How to extract data from documents</Text>
            {configs.length === 0 && (
              <Text size="sm" c="dimmed">
                You don't have any templates yet. Create one by uploading
                a sample PDF and drawing areas you want to extract.
              </Text>
            )}
            <Text size="sm" c="dimmed">1. Select or drop one or more PDF files</Text>
            <Text size="sm" c="dimmed">2. Select a template that matches your document layout</Text>
            <Text size="sm" c="dimmed">3. Download as JSON or, if the template has a payment order enabled, as a Pain.001 XML payment order</Text>
            <Text size="xs" c="dimmed" fs="italic" mt="xs">
              Your documents never leave your browser — all processing happens locally on your device.
            </Text>
          </Stack>
        </Paper>
      )}

      {error && (
        <Notification color="red" onClose={() => setError(null)}>
          {error}
        </Notification>
      )}

      {progress && (
        <Paper shadow="xs" p="sm" radius="md">
          <Text size="xs" c="dimmed" mb={4}>
            Extracting {progress.done} / {progress.total}...
          </Text>
          <Progress value={(progress.done / progress.total) * 100} size="sm" animated />
        </Paper>
      )}

      {(files.length > 0 || results) && !extracting && (
        <div style={{
          display: 'flex',
          flexDirection: isSmall ? 'column' : 'row',
          alignItems: 'flex-start',
          gap: 'var(--mantine-spacing-md)',
        }}>
          {/* Results panel */}
          {combinedJson !== null && (
            <Paper shadow="xs" p="sm" radius="md" style={{
              width: isSmall ? '100%' : 400,
              flexShrink: 0,
              order: isSmall ? 0 : 1,
            }}>
              <Group justify="space-between" mb="xs">
                <Group gap="xs" align="center">
                  <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                    Extracted data
                  </Text>
                  {errorCount > 0 && (
                    <Tooltip label={`${errorCount} file${errorCount !== 1 ? 's' : ''} with empty or unreadable values`} withArrow>
                      <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" style={{ flexShrink: 0 }} />
                    </Tooltip>
                  )}
                </Group>
                <Group gap="xs" align="center">
                  <Text size="xs" c="dimmed">Download</Text>
                  <Button size="compact-xs" variant="light" onClick={handleDownloadJson}>
                    JSON
                  </Button>
                  {selectedConfig?.paymentOrder && (
                    <Button size="compact-xs" variant="light" color="teal" onClick={handleDownloadXml}>
                      XML
                    </Button>
                  )}
                </Group>
              </Group>
              {results && results.length === 1 && (
                <Checkbox
                  size="xs"
                  label="Wrap output in array"
                  checked={wrapInArray}
                  onChange={e => setWrapInArray(e.currentTarget.checked)}
                  mb="xs"
                />
              )}
              <Code block style={{ maxHeight: 600, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(combinedJson, null, 2)}
              </Code>
            </Paper>
          )}

          {/* PDF preview with file selector */}
          {activeFile && (
            <Paper shadow="xs" p="sm" radius="md" style={{
              flex: 1,
              minWidth: 0,
              width: isSmall ? '100%' : undefined,
              order: isSmall ? 1 : 0,
            }}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
                PDF preview
              </Text>

              {files.length >= 1 && (
                <Stack gap="xs" mb="sm">
                  {files.map((f, i) => {
                    const fr = results?.[i];
                    const isActive = i === activeFileIndex;
                    return (
                      <Card
                        key={f.name + f.size + i}
                        withBorder
                        padding="xs"
                        radius="sm"
                        style={{
                          borderColor: isActive ? '#228be6' : undefined,
                          cursor: files.length > 1 ? 'pointer' : undefined,
                        }}
                        onClick={() => selectFile(i)}
                      >
                        <Group justify="space-between" wrap="nowrap" gap={6}>
                          <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              backgroundColor: !fr ? '#adb5bd'
                                : (fr.error || Object.values(fr.data).some(v => !v || v.startsWith('ERROR:'))) ? '#fa5252'
                                : '#40c057',
                            }} />
                            <Text size="xs" truncate style={{ flex: 1, minWidth: 0 }}>{f.name}</Text>
                          </Group>
                          <CloseButton size="xs" onClick={(e) => { e.stopPropagation(); removeFile(i); }} />
                        </Group>
                        {fr?.error && <Text size="xs" c="red" mt={2}>{fr.error}</Text>}
                      </Card>
                    );
                  })}
                </Stack>
              )}

              <PdfViewer
                file={activeFile}
                rects={rects}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                onTotalPages={setTotalPages}
                selectedRectId={null}
                onDocLoaded={handleDocLoaded}
              />
            </Paper>
          )}
        </div>
      )}
    </Stack>
  );
}
