import { useState, useCallback, useEffect, useRef } from 'react';
import { Button, ActionIcon, TextInput, Stack, Paper, Text, Group, Card, CloseButton, Code, Notification, useMantineTheme, Checkbox, Select, Modal } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useMediaQuery } from '@mantine/hooks';
import { PdfDropzone } from './PdfDropzone';
import { PdfViewer } from './PdfViewer';
import type { Rect } from './PdfViewer';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractSinglePageInfo, extractTextFromArea, extractFromAreas, loadPdfDocument, type PageInfo } from '../lib/pdfExtractor';
import { createConfig, updateConfig, getConfig, deleteConfig, listConfigs, loadPayerDetails, savePayerDetails } from '../lib/configStore';
import type { PaymentOrderFieldMappings } from '../lib/configStore';
import { useFiles } from '../lib/fileStore';

interface Props {
  editConfigId: string | null;
  cloneFromConfigId?: string | null;
  returnToRead?: boolean;
  onDone: (savedConfigId?: string, backToRead?: boolean) => void;
}

const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK'];

function buildSnapshot(
  identifier: string, rects: { key: string; page: number; x: number; y: number; width: number; height: number }[],
  paymentEnabled: boolean, payerName: string, payerIban: string, payerBic: string,
  currency: string, fieldMappings: PaymentOrderFieldMappings,
): string {
  return JSON.stringify({
    identifier,
    areas: rects.map(r => ({ key: r.key, page: r.page, x: r.x, y: r.y, width: r.width, height: r.height })),
    paymentEnabled,
    ...(paymentEnabled ? { payerName, payerIban, payerBic, currency, fieldMappings } : {}),
  });
}

export function ConfigureFlow({ editConfigId, cloneFromConfigId, returnToRead, onDone }: Props) {
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const isExtraSmall = useMediaQuery(`(max-width: ${theme.breakpoints.sm})`);
  const [identifier, setIdentifier] = useState('');
  const { files, setFiles } = useFiles();
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [selectedRectId, setSelectedRectId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pagesCacheRef = useRef<Map<number, PageInfo>>(new Map());
  const selectedRectIdRef = useRef(selectedRectId);
  selectedRectIdRef.current = selectedRectId;

  // Per-file validation: 'ok' | 'error' | 'pending'
  const [fileStatus, setFileStatus] = useState<Map<string, 'ok' | 'error' | 'pending'>>(new Map());

  // Payment order state
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [payerIban, setPayerIban] = useState('');
  const [payerBic, setPayerBic] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [fieldMappings, setFieldMappings] = useState<PaymentOrderFieldMappings>({
    beneficiaryName: '', beneficiaryIban: '', amount: '',
    referenceNumber: '', paymentDescription: '', dueDate: '',
  });

  const initialSnapshotRef = useRef<string | null>(null);

  // Load existing config when editing or cloning, or prefill payer details for new
  useEffect(() => {
    const sourceId = editConfigId ?? cloneFromConfigId;
    if (sourceId) {
      const config = getConfig(sourceId);
      if (config) {
        setIdentifier(cloneFromConfigId ? `${config.identifier} (copy)` : config.identifier);
        const loadedRects = config.areas.map(a => ({
          id: crypto.randomUUID(),
          key: a.key,
          page: a.page,
          x: a.x,
          y: a.y,
          width: a.width,
          height: a.height,
        }));
        setRects(loadedRects);
        if (config.paymentOrder) {
          setPaymentEnabled(true);
          setPayerName(config.paymentOrder.payerName);
          setPayerIban(config.paymentOrder.payerIban);
          setPayerBic(config.paymentOrder.payerBic);
          setCurrency(config.paymentOrder.currency);
          setFieldMappings(config.paymentOrder.fieldMappings);
          if (editConfigId) {
            initialSnapshotRef.current = buildSnapshot(
              config.identifier, loadedRects, true,
              config.paymentOrder.payerName, config.paymentOrder.payerIban,
              config.paymentOrder.payerBic, config.paymentOrder.currency,
              config.paymentOrder.fieldMappings,
            );
          }
          return;
        }
        if (editConfigId) {
          initialSnapshotRef.current = buildSnapshot(
            config.identifier, loadedRects, false, '', '', '', 'EUR',
            { beneficiaryName: '', beneficiaryIban: '', amount: '', referenceNumber: '', paymentDescription: '', dueDate: '' },
          );
        }
      }
    }
    const cached = loadPayerDetails();
    setPayerName(cached.payerName);
    setPayerIban(cached.payerIban);
    setPayerBic(cached.payerBic);
  }, [editConfigId, cloneFromConfigId]);

  const rectsRef = useRef(rects);
  rectsRef.current = rects;

  const handleDocLoaded = useCallback(async (doc: PDFDocumentProxy) => {
    docRef.current = doc;
    pagesCacheRef.current = new Map();
    // Extract only pages that exist in this doc
    const pagesNeeded = [...new Set(rectsRef.current.map(r => r.page))];
    const validPages = pagesNeeded.filter(p => p >= 1 && p <= doc.numPages);
    if (validPages.length > 0) {
      const infos = await Promise.all(validPages.map(p => extractSinglePageInfo(doc, p)));
      validPages.forEach((p, i) => pagesCacheRef.current.set(p, infos[i]));
    }
    setRects(curr => curr.map(rect => {
      const pi = pagesCacheRef.current.get(rect.page);
      return { ...rect, previewText: pi ? extractTextFromArea(pi, rect) : '' };
    }));
  }, []);

  // Validate all files by extracting areas and checking for errors
  useEffect(() => {
    if (files.length === 0 || rects.length === 0) {
      setFileStatus(new Map());
      return;
    }
    const areas = rects.filter(r => r.key.trim()).map(r => ({
      key: r.key, page: r.page, x: r.x, y: r.y, width: r.width, height: r.height,
    }));
    if (areas.length === 0) { setFileStatus(new Map()); return; }

    let cancelled = false;
    const run = async () => {
      const next = new Map<string, 'ok' | 'error' | 'pending'>();
      files.forEach(f => next.set(f.name + f.size, 'pending'));
      if (!cancelled) setFileStatus(new Map(next));

      for (const f of files) {
        if (cancelled) return;
        const key = f.name + f.size;
        try {
          const doc = await loadPdfDocument(f);
          const data = await extractFromAreas(doc, areas);
          doc.destroy();
          const hasError = Object.values(data).some(v => !v || v.startsWith('ERROR:'));
          next.set(key, hasError ? 'error' : 'ok');
        } catch {
          next.set(key, 'error');
        }
        if (!cancelled) setFileStatus(new Map(next));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [files, rects]);

  const handleRectDrawn = useCallback(
    (rect: Omit<Rect, 'id' | 'key' | 'previewText'>) => {
      const id = crypto.randomUUID();
      const cachedPage = pagesCacheRef.current.get(rect.page);
      const previewText = cachedPage
        ? extractTextFromArea(cachedPage, rect)
        : undefined;
      const newRect: Rect = { ...rect, id, key: '', previewText };
      setRects(prev => [...prev, newRect]);
      setSelectedRectId(id);
      if (!cachedPage && docRef.current) {
        extractSinglePageInfo(docRef.current, rect.page).then(pageInfo => {
          pagesCacheRef.current.set(rect.page, pageInfo);
          setRects(prev => prev.map(r =>
            r.id === id ? { ...r, previewText: extractTextFromArea(pageInfo, r) } : r
          ));
        });
      }
    },
    [],
  );

  const handleKeyChange = useCallback((id: string, key: string) => {
    setRects(prev => prev.map(r => (r.id === id ? { ...r, key } : r)));
  }, []);

  const handleDeleteRect = useCallback((id: string) => {
    setRects(prev => prev.filter(r => r.id !== id));
    if (selectedRectIdRef.current === id) setSelectedRectId(null);
  }, []);

  const [overwriteTarget, setOverwriteTarget] = useState<{ id: string; name: string } | null>(null);
  const pendingSaveAndReadRef = useRef(false);

  const findConflict = () => {
    const name = identifier.trim();
    return listConfigs().find(c => c.identifier === name && c.id !== editConfigId) ?? null;
  };

  const executeSave = (overwrite = false) => {
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

      const paymentOrder = paymentEnabled ? {
        payerName: payerName.trim(),
        payerIban: payerIban.trim(),
        payerBic: payerBic.trim(),
        currency,
        fieldMappings,
      } : undefined;

      if (overwrite && overwriteTarget) {
        deleteConfig(overwriteTarget.id);
      }

      let savedId: string;
      if (editConfigId) {
        updateConfig(editConfigId, identifier.trim(), areas, paymentOrder);
        savedId = editConfigId;
      } else {
        const created = createConfig(identifier.trim(), areas, paymentOrder);
        savedId = created.id;
      }

      if (paymentEnabled) {
        savePayerDetails({ payerName: payerName.trim(), payerIban: payerIban.trim(), payerBic: payerBic.trim() });
      }
      setOverwriteTarget(null);
      onDone(savedId, pendingSaveAndReadRef.current);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = (saveAndRead = false) => {
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

    pendingSaveAndReadRef.current = saveAndRead;
    const conflict = findConflict();
    if (conflict) {
      setOverwriteTarget({ id: conflict.id, name: conflict.identifier });
    } else {
      executeSave();
    }
  };

  const areaKeyOptions = rects
    .filter(r => r.key.trim())
    .map(r => ({ value: r.key, label: r.key }));

  const updateMapping = (field: keyof PaymentOrderFieldMappings, value: string | null) =>
    setFieldMappings(prev => ({ ...prev, [field]: value ?? '' }));

  const currentSnapshot = editConfigId
    ? buildSnapshot(identifier.trim(), rects, paymentEnabled, payerName.trim(), payerIban.trim(), payerBic.trim(), currency, fieldMappings)
    : null;
  const hasChanges = !editConfigId || initialSnapshotRef.current !== currentSnapshot;

  const saveDisabled = !hasChanges || rects.length === 0 || !identifier.trim() || rects.some(r => !r.key.trim()) ||
    (paymentEnabled && (
      !payerName.trim() || !payerIban.trim() || !payerBic.trim() ||
      !fieldMappings.beneficiaryName || !fieldMappings.beneficiaryIban ||
      !fieldMappings.amount || !fieldMappings.paymentDescription || !fieldMappings.dueDate
    ));

  const activeFile = files[activeFileIndex] ?? null;

  const handleFilesChange = (newFiles: File[]) => {
    setFiles(newFiles);
    setActiveFileIndex(0);
    setSelectedRectId(null);
    setCurrentPage(1);
  };

  const selectFile = (index: number) => {
    setActiveFileIndex(index);
    setCurrentPage(1);
  };

  const handleCancel = () => {
    onDone(undefined, returnToRead);
  };

  const backButton = (
    <ActionIcon variant="subtle" size="sm" onClick={handleCancel} title="Back" style={{ flexShrink: 0 }}>
      <IconArrowLeft size={16} />
    </ActionIcon>
  );

  const pdfDropzone = (
    <PdfDropzone multiple files={files} label="Select or drop PDFs" onFilesChange={handleFilesChange} />
  );

  const nameInput = (
    <TextInput
      placeholder="Template name"
      value={identifier}
      onChange={e => setIdentifier(e.currentTarget.value)}
      size="xs"
      required
      style={isSmall ? { flex: 1, minWidth: 0 } : { flex: '1 1 180px', maxWidth: 280 }}
    />
  );

  const paymentCheckbox = (
    <Checkbox
      size="xs"
      label="Payment order (Pain.001)"
      checked={paymentEnabled}
      onChange={e => setPaymentEnabled(e.currentTarget.checked)}
    />
  );

  const actionButtons = (
    <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
      <Button size="xs" onClick={() => handleSave(returnToRead)} loading={saving} disabled={saveDisabled}>
        Save
      </Button>
      <Button size="xs" variant="light" onClick={handleCancel}>
        Cancel
      </Button>
    </Group>
  );

  return (
    <Stack gap="md" style={{ maxWidth: 1200, marginInline: 'auto' }}>
      <Paper shadow="xs" p="sm" radius="md">
        {isSmall ? (
          <Stack gap="sm">
            <Group gap="sm" wrap="nowrap">
              {backButton}
              {pdfDropzone}
              {nameInput}
            </Group>
            <Group gap="sm" justify="space-between">
              {paymentCheckbox}
              {actionButtons}
            </Group>
          </Stack>
        ) : (
          <Group gap="sm" wrap="nowrap" align="center" justify="space-between">
            <Group gap="sm" wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
              {backButton}
              {pdfDropzone}
              {nameInput}
              {paymentCheckbox}
            </Group>
            {actionButtons}
          </Group>
        )}
      </Paper>

      {error && (
        <Notification color="red" onClose={() => setError(null)}>
          {error}
        </Notification>
      )}

      <div style={{
        display: 'flex',
        flexDirection: isSmall ? 'column' : 'row',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--mantine-spacing-md)',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: isExtraSmall ? 'column' : 'row',
          gap: 'var(--mantine-spacing-md)',
          width: isSmall ? '100%' : undefined,
          flexShrink: 0,
          order: isSmall ? 1 : 1,
        }}>
          <Paper shadow="xs" p="sm" radius="md" style={{
            width: isSmall ? undefined : 320,
            flex: isSmall ? 1 : undefined,
            minWidth: 0,
          }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
              Areas ({rects.length})
            </Text>

            {activeFile && rects.length === 0 && (
              <Text size="sm" c="dimmed">
                Draw rectangles on the PDF to define reading areas.
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
                      placeholder="Label (e.g., document_number)"
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

          {paymentEnabled && (
            <Paper shadow="xs" p="sm" radius="md" style={{
              width: isSmall ? undefined : 320,
              flex: isSmall ? 1 : undefined,
              minWidth: 0,
            }}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">Payer details</Text>
              <Stack gap="xs">
                <TextInput size="xs" label="Payer name" required value={payerName} onChange={e => setPayerName(e.currentTarget.value)} />
                <TextInput size="xs" label="Payer IBAN" required value={payerIban} onChange={e => setPayerIban(e.currentTarget.value)} />
                <TextInput size="xs" label="Payer bank BIC" required value={payerBic} onChange={e => setPayerBic(e.currentTarget.value)} />
                <Select size="xs" label="Currency" data={CURRENCIES} value={currency} onChange={v => setCurrency(v ?? 'EUR')} />
              </Stack>

              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mt="md" mb="xs">Field mappings</Text>
              <Stack gap="xs">
                <Select size="xs" label="Beneficiary name" required data={areaKeyOptions} value={fieldMappings.beneficiaryName || null} onChange={v => updateMapping('beneficiaryName', v)} placeholder="Select area key" />
                <Select size="xs" label="Beneficiary IBAN" required data={areaKeyOptions} value={fieldMappings.beneficiaryIban || null} onChange={v => updateMapping('beneficiaryIban', v)} placeholder="Select area key" />
                <Select size="xs" label="Amount" required data={areaKeyOptions} value={fieldMappings.amount || null} onChange={v => updateMapping('amount', v)} placeholder="Select area key" />
                <Select size="xs" label="Reference number (optional)" data={areaKeyOptions} value={fieldMappings.referenceNumber || null} onChange={v => updateMapping('referenceNumber', v)} placeholder="Select area key" clearable />
                <Select size="xs" label="Payment description" required data={areaKeyOptions} value={fieldMappings.paymentDescription || null} onChange={v => updateMapping('paymentDescription', v)} placeholder="Select area key" />
                <Select size="xs" label="Due date" required data={areaKeyOptions} value={fieldMappings.dueDate || null} onChange={v => updateMapping('dueDate', v)} placeholder="Select area key" />
              </Stack>
            </Paper>
          )}
        </div>

        {!activeFile && (
          <Paper shadow="xs" p="md" radius="md" style={{
            flex: 1,
            minWidth: 0,
            width: isSmall ? '100%' : undefined,
            order: isSmall ? 2 : 0,
          }}>
            <Text size="sm" c="dimmed">
              Select a PDF to preview the document and draw new areas.
            </Text>
          </Paper>
        )}

        {activeFile && (
          <Paper shadow="xs" p="sm" radius="md" style={{
            flex: 1,
            minWidth: 0,
            width: isSmall ? '100%' : undefined,
            order: isSmall ? 2 : 0,
          }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
              PDF preview
            </Text>

            {files.length >= 1 && (
              <Stack gap="xs" mb="sm">
                {files.map((f, i) => (
                  <Card
                    key={f.name + f.size + i}
                    withBorder
                    padding="xs"
                    radius="sm"
                    style={{
                      borderColor: i === activeFileIndex ? '#228be6' : undefined,
                      cursor: files.length > 1 ? 'pointer' : undefined,
                    }}
                    onClick={() => selectFile(i)}
                  >
                    <Group justify="space-between" wrap="nowrap" gap={6}>
                      <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                        {(() => {
                          const status = fileStatus.get(f.name + f.size);
                          return (
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                              backgroundColor: status === 'ok' ? '#40c057' : status === 'error' ? '#fa5252' : '#adb5bd',
                            }} />
                          );
                        })()}
                        <Text size="xs" truncate style={{ flex: 1, minWidth: 0 }}>{f.name}</Text>
                      </Group>
                      <CloseButton size="xs" onClick={(e) => {
                        e.stopPropagation();
                        const next = files.filter((_, j) => j !== i);
                        setFiles(next);
                        setActiveFileIndex(prev => {
                          if (next.length === 0) return 0;
                          if (prev >= next.length) return next.length - 1;
                          return prev;
                        });
                      }} />
                    </Group>
                  </Card>
                ))}
              </Stack>
            )}

            <PdfViewer
              file={activeFile}
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

      <Modal
        opened={!!overwriteTarget}
        onClose={() => setOverwriteTarget(null)}
        title="Overwrite existing template?"
        centered
        size="sm"
      >
        <Text size="sm" mb="md">
          A template named "{overwriteTarget?.name}" already exists. Do you want to overwrite it?
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button size="xs" variant="light" onClick={() => setOverwriteTarget(null)}>
            Cancel
          </Button>
          <Button size="xs" color="orange" onClick={() => executeSave(true)}>
            Overwrite
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
