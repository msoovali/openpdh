import { useState, useRef } from 'react';
import { Stack, Card, Group, Text, Button, ActionIcon, CloseButton, Notification, Paper, Modal } from '@mantine/core';
import { listConfigs, deleteConfig, exportConfig, exportAllConfigs, parseImport, importConfigs } from '../lib/configStore';
import type { ImportItem } from '../lib/configStore';
import { downloadJSON, sanitizeFilename } from '../lib/download';
import { IconPencil, IconDownload, IconUpload, IconFileText } from '@tabler/icons-react';

interface Props {
  onEdit: (id: string) => void;
  onNew: () => void;
  onRead: (id: string) => void;
}

export function ConfigList({ onEdit, onNew, onRead }: Props) {
  const [configs, setConfigs] = useState(() => listConfigs());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; identifier: string } | null>(null);
  const [importData, setImportData] = useState<{ items: ImportItem[]; conflicts: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => setConfigs(listConfigs());

  const confirmDelete = () => {
    if (!deleteTarget) return;
    try {
      deleteConfig(deleteTarget.id);
      setConfigs(prev => prev.filter(c => c.id !== deleteTarget.id));
    } catch {
      setError('Failed to delete template');
    }
    setDeleteTarget(null);
  };

  const handleExport = (id: string, identifier: string) => {
    downloadJSON(exportConfig(id), `${sanitizeFilename(identifier)}.json`);
  };

  const handleExportAll = () => {
    downloadJSON(exportAllConfigs(), 'openpdh-configs.json');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseImport(text);
      if (result.items.length === 0) {
        setError('No valid templates found in file');
      } else if (result.conflicts.length > 0) {
        setImportData(result);
      } else {
        const count = importConfigs(result.items);
        setSuccess(`Imported ${count} template${count !== 1 ? 's' : ''}`);
        load();
      }
    } catch {
      setError('Failed to import: invalid JSON file');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const confirmImport = () => {
    if (!importData) return;
    const count = importConfigs(importData.items);
    setSuccess(`Imported ${count} template${count !== 1 ? 's' : ''}`);
    setImportData(null);
    load();
  };

  return (
    <Stack gap="md" style={{ maxWidth: 1200, marginInline: 'auto' }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={handleImport}
      />

      {error && (
        <Notification color="red" onClose={() => setError(null)}>
          {error}
        </Notification>
      )}
      {success && (
        <Notification color="green" onClose={() => setSuccess(null)}>
          {success}
        </Notification>
      )}

      <Paper shadow="xs" p="sm" radius="md">
        <Group justify="space-between" mb="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Templates ({configs.length})
          </Text>
          <Button size="xs" onClick={onNew}>Add new template</Button>
        </Group>
        {configs.length === 0 && (
          <Text size="sm" c="dimmed" ta="center" py="md">
            No templates yet. Create one or import from a file.
          </Text>
        )}
        <Stack gap="xs">
          {configs.map(c => (
              <Card key={c.id} withBorder padding="xs" radius="sm" style={{ cursor: 'pointer' }} onClick={() => onRead(c.id)}>
                <Group justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap">
                    <IconFileText size={16} style={{ color: 'var(--mantine-color-blue-5)', flexShrink: 0 }} />
                    <div>
                      <Text size="sm" fw={500}>{c.identifier}</Text>
                      <Text size="xs" c="dimmed">Click to read PDF with this template</Text>
                    </div>
                  </Group>
                  <Group gap={6}>
                    <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); onEdit(c.id); }} title="Edit">
                      <IconPencil size={14} />
                    </ActionIcon>
                    <ActionIcon variant="subtle" size="sm" onClick={(e) => { e.stopPropagation(); handleExport(c.id, c.identifier); }} title="Export">
                      <IconDownload size={14} />
                    </ActionIcon>
                    <CloseButton
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ id: c.id, identifier: c.identifier }); }}
                    />
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
      </Paper>
      <Group gap="sm" justify="flex-end">
        <Button size="xs" variant="light" leftSection={<IconUpload size={14} />} onClick={() => fileInputRef.current?.click()}>
          Import
        </Button>
        {configs.length > 0 && (
          <Button size="xs" variant="light" leftSection={<IconDownload size={14} />} onClick={handleExportAll}>
            Export all
          </Button>
        )}
      </Group>

      <Modal
        opened={!!importData}
        onClose={() => setImportData(null)}
        title="Overwrite existing templates?"
        centered
        size="sm"
      >
        <Text size="sm" mb="xs">
          The following templates already exist and will be overwritten:
        </Text>
        <Stack gap={4} mb="md">
          {importData?.conflicts.map(name => (
            <Text size="sm" fw={500} key={name}>• {name}</Text>
          ))}
        </Stack>
        <Group justify="flex-end" gap="sm">
          <Button size="xs" variant="light" onClick={() => setImportData(null)}>
            Cancel
          </Button>
          <Button size="xs" color="orange" onClick={confirmImport}>
            Overwrite
          </Button>
        </Group>
      </Modal>

      <Modal
        opened={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete template"
        centered
        size="sm"
      >
        <Text size="sm" mb="md">
          Are you sure you want to delete "{deleteTarget?.identifier}"? This action cannot be undone.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button size="xs" variant="light" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button size="xs" color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </Stack>
  );
}
