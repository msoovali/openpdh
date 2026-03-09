import { useState, useEffect } from 'react';
import { Stack, Select, Button, Code, Group, Text, Notification, Paper, useMantineTheme } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { PdfDropzone } from './PdfDropzone';
import * as pdfjsLib from 'pdfjs-dist';
import { listConfigs, getConfig } from '../lib/configStore';
import { extractFromAreas } from '../lib/pdfExtractor';
import { downloadJSON, downloadXML } from '../lib/download';
import { generatePain001, parseDateToYMD } from '../lib/painXmlGenerator';
import { PdfViewer } from './PdfViewer';
import type { Rect } from './PdfViewer';

export function ReadFlow() {
  const theme = useMantineTheme();
  const isSmall = useMediaQuery(`(max-width: ${theme.breakpoints.md})`);
  const [configs, setConfigs] = useState<{ id: string; identifier: string }[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Record<string, string> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [rects, setRects] = useState<Rect[]>([]);

  useEffect(() => {
    setConfigs(listConfigs());
  }, []);

  // Build rects from selected config areas, clear previous result
  useEffect(() => {
    setResult(null);
    if (!selectedConfigId) { setRects([]); return; }
    const config = getConfig(selectedConfigId);
    if (!config) { setRects([]); return; }
    setRects(config.areas.map(a => ({
      id: crypto.randomUUID(),
      key: a.key,
      page: a.page,
      x: a.x,
      y: a.y,
      width: a.width,
      height: a.height,
    })));
  }, [selectedConfigId]);

  const handleExtract = async () => {
    if (!file || !selectedConfigId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const config = getConfig(selectedConfigId);
      if (!config) throw new Error('Configuration not found');

      const arrayBuffer = await file.arrayBuffer();
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const data = await extractFromAreas(doc, config.areas);
      await doc.destroy();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setLoading(false);
    }
  };

  const selectedConfig = selectedConfigId ? getConfig(selectedConfigId) : null;

  const handleDownload = () => {
    if (!result) return;
    downloadJSON(JSON.stringify(result, null, 2), `${selectedConfig?.identifier ?? 'extracted-data'}.json`);
  };

  const handleDownloadXml = () => {
    if (!result || !selectedConfig?.paymentOrder) return;
    const { fieldMappings, payerName, payerIban, payerBic, currency } = selectedConfig.paymentOrder;

    const xml = generatePain001({
      payerName,
      payerIban,
      payerBic,
      currency,
      beneficiaryName: result[fieldMappings.beneficiaryName] ?? '',
      beneficiaryIban: result[fieldMappings.beneficiaryIban] ?? '',
      amount: result[fieldMappings.amount] ?? '',
      referenceNumber: fieldMappings.referenceNumber ? result[fieldMappings.referenceNumber] : undefined,
      paymentDescription: result[fieldMappings.paymentDescription] ?? '',
      dueDate: result[fieldMappings.dueDate] ?? '',
      identifier: selectedConfig.identifier,
    });

    const dueDateRaw = result[fieldMappings.dueDate] ?? '';
    const parsedDate = parseDateToYMD(dueDateRaw);
    downloadXML(xml, `${selectedConfig.identifier}_${parsedDate}.xml`);
  };

  const handleFileSelect = (f: File | null) => {
    setFile(f);
    setResult(null);
    setCurrentPage(1);
  };

  return (
    <Stack gap="md">
      <Paper shadow="xs" p="sm" radius="md">
        <Group gap="sm" wrap="wrap">
          <Select
            placeholder="Choose configuration"
            data={configs.map(c => ({ value: c.id, label: c.identifier }))}
            value={selectedConfigId}
            onChange={setSelectedConfigId}
            size="xs"
            style={{ flex: '1 1 180px', maxWidth: 280 }}
          />

          <PdfDropzone
            file={file}
            label="Select or drop PDF"
            onFileSelect={handleFileSelect}
          />

          <Button
            size="xs"
            onClick={handleExtract}
            loading={loading}
            disabled={!file || !selectedConfigId}
          >
            Extract data
          </Button>
        </Group>
      </Paper>

      {!file && !result && (
        <Paper shadow="xs" p="md" radius="md">
          <Stack gap="xs">
            <Text size="sm" fw={500}>How to extract data from a document</Text>
            {configs.length === 0 && (
              <Text size="sm" c="dimmed">
                You don't have any configurations yet. Go to Configurations to create one by uploading
                a sample PDF and drawing areas you want to extract.
              </Text>
            )}
            <Text size="sm" c="dimmed">1. Select a configuration that matches your document layout</Text>
            <Text size="sm" c="dimmed">2. Select or drop a PDF file</Text>
            <Text size="sm" c="dimmed">3. Click "Extract data" to get structured JSON output</Text>
            <Text size="sm" c="dimmed">4. Download as JSON or, if the configuration has a payment order enabled, as a Pain.001 XML payment order</Text>
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

      {(file || result) && (
        <div style={{
          display: 'flex',
          flexDirection: isSmall ? 'column' : 'row',
          alignItems: 'flex-start',
          gap: 'var(--mantine-spacing-md)',
        }}>
          {result && (
            <Paper shadow="xs" p="sm" radius="md" style={{
              width: isSmall ? '100%' : 400,
              flexShrink: 0,
              order: isSmall ? 0 : 1,
            }}>
              <Group justify="space-between" mb="xs">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Extracted data
                </Text>
                <Group gap="xs" align="center">
                  <Text size="xs" c="dimmed">Download as</Text>
                  <Button size="compact-xs" variant="light" onClick={handleDownload}>
                    JSON
                  </Button>
                  {selectedConfig?.paymentOrder && (
                    <Button size="compact-xs" variant="light" color="teal" onClick={handleDownloadXml}>
                      Payment order XML
                    </Button>
                  )}
                </Group>
              </Group>
              <Code block style={{ maxHeight: 600, overflow: 'auto', fontSize: 12 }}>
                {JSON.stringify(result, null, 2)}
              </Code>
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
                selectedRectId={null}
              />
            </Paper>
          )}
        </div>
      )}
    </Stack>
  );
}
