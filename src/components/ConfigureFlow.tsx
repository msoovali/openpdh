import { useState, useCallback, useEffect, useRef } from 'react';
import { Button, TextInput, Stack, Paper, Text, Group, Card, CloseButton, Code, Notification, useMantineTheme, Checkbox, Select } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PdfDropzone } from './PdfDropzone';
import { PdfViewer } from './PdfViewer';
import type { Rect } from './PdfViewer';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { extractSinglePageInfo, extractTextFromArea, type PageInfo } from '../lib/pdfExtractor';
import { createConfig, updateConfig, getConfig, loadPayerDetails, savePayerDetails } from '../lib/configStore';
import type { PaymentOrderFieldMappings } from '../lib/configStore';

interface Props {
  editConfigId: string | null;
  onDone: () => void;
}

const currencyOptions = [
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
  { value: 'GBP', label: 'GBP' },
  { value: 'CHF', label: 'CHF' },
  { value: 'SEK', label: 'SEK' },
  { value: 'NOK', label: 'NOK' },
  { value: 'DKK', label: 'DKK' },
  { value: 'PLN', label: 'PLN' },
  { value: 'CZK', label: 'CZK' },
];

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
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pagesCacheRef = useRef<Map<number, PageInfo>>(new Map());
  const selectedRectIdRef = useRef(selectedRectId);
  selectedRectIdRef.current = selectedRectId;

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

  // Load existing config when editing, or prefill payer details for new
  useEffect(() => {
    if (!editConfigId) {
      const cached = loadPayerDetails();
      setPayerName(cached.payerName);
      setPayerIban(cached.payerIban);
      setPayerBic(cached.payerBic);
      return;
    }
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
      if (config.paymentOrder) {
        setPaymentEnabled(true);
        setPayerName(config.paymentOrder.payerName);
        setPayerIban(config.paymentOrder.payerIban);
        setPayerBic(config.paymentOrder.payerBic);
        setCurrency(config.paymentOrder.currency);
        setFieldMappings(config.paymentOrder.fieldMappings);
      } else {
        const cached = loadPayerDetails();
        setPayerName(cached.payerName);
        setPayerIban(cached.payerIban);
        setPayerBic(cached.payerBic);
      }
    }
  }, [editConfigId]);

  const handleDocLoaded = useCallback(async (doc: PDFDocumentProxy) => {
    docRef.current = doc;
    pagesCacheRef.current = new Map();
    // Extract only pages needed for existing rects (lazy)
    setRects(prev => {
      const pagesNeeded = [...new Set(prev.map(r => r.page))];
      if (pagesNeeded.length > 0) {
        Promise.all(pagesNeeded.map(p => extractSinglePageInfo(doc, p))).then(infos => {
          pagesNeeded.forEach((p, i) => pagesCacheRef.current.set(p, infos[i]));
          setRects(curr => curr.map(rect => {
            const pi = pagesCacheRef.current.get(rect.page);
            return pi ? { ...rect, previewText: extractTextFromArea(pi, rect) } : rect;
          }));
        });
      }
      return prev;
    });
  }, []);

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

      const paymentOrder = paymentEnabled ? {
        payerName: payerName.trim(),
        payerIban: payerIban.trim(),
        payerBic: payerBic.trim(),
        currency,
        fieldMappings,
      } : undefined;

      if (editConfigId) {
        updateConfig(editConfigId, identifier.trim(), areas, paymentOrder);
      } else {
        createConfig(identifier.trim(), areas, paymentOrder);
      }

      if (paymentEnabled) {
        savePayerDetails({ payerName: payerName.trim(), payerIban: payerIban.trim(), payerBic: payerBic.trim() });
      }
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const areaKeyOptions = rects
    .filter(r => r.key.trim())
    .map(r => ({ value: r.key, label: r.key }));

  const updateMapping = (field: keyof PaymentOrderFieldMappings, value: string | null) =>
    setFieldMappings(prev => ({ ...prev, [field]: value ?? '' }));

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

          <Checkbox
            size="xs"
            label="Payment order (Pain.001)"
            checked={paymentEnabled}
            onChange={e => setPaymentEnabled(e.currentTarget.checked)}
          />

          <Group gap="xs">
            <Button size="xs" onClick={handleSave} loading={saving} disabled={
              rects.length === 0 || !identifier.trim() || rects.some(r => !r.key.trim()) ||
              (paymentEnabled && (
                !payerName.trim() || !payerIban.trim() || !payerBic.trim() ||
                !fieldMappings.beneficiaryName || !fieldMappings.beneficiaryIban ||
                !fieldMappings.amount || !fieldMappings.paymentDescription || !fieldMappings.dueDate
              ))
            }>
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
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--mantine-spacing-md)',
      }}>
        <Paper shadow="xs" p="sm" radius="md" style={{
          width: isSmall ? '100%' : 320,
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

        {paymentEnabled && (
          <Paper shadow="xs" p="sm" radius="md" style={{
            width: isSmall ? '100%' : 320,
            flexShrink: 0,
            order: isSmall ? 2 : 2,
          }}>
            <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">Payer details</Text>
            <Stack gap="xs">
              <TextInput size="xs" label="Payer name" required value={payerName} onChange={e => setPayerName(e.currentTarget.value)} />
              <TextInput size="xs" label="Payer IBAN" required value={payerIban} onChange={e => setPayerIban(e.currentTarget.value)} />
              <TextInput size="xs" label="Payer bank BIC" required value={payerBic} onChange={e => setPayerBic(e.currentTarget.value)} />
              <Select size="xs" label="Currency" data={currencyOptions} value={currency} onChange={v => setCurrency(v ?? 'EUR')} />
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
