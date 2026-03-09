import { useState, useEffect, useRef } from 'react';
import { Stack, Card, Group, Text, Button, CloseButton, Notification, Paper, Modal } from '@mantine/core';
import { listConfigs, deleteConfig, exportConfig, exportAllConfigs, parseImport, importConfigs } from '../lib/configStore';
import type { ImportItem } from '../lib/configStore';

interface Props {
  onEdit: (id: string) => void;
  onNew: () => void;
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ConfigList({ onEdit, onNew }: Props) {
  const [configs, setConfigs] = useState<{ id: string; identifier: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; identifier: string } | null>(null);
  const [importData, setImportData] = useState<{ items: ImportItem[]; conflicts: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => setConfigs(listConfigs());
  useEffect(load, []);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    try {
      deleteConfig(deleteTarget.id);
      setConfigs(prev => prev.filter(c => c.id !== deleteTarget.id));
    } catch {
      setError('Failed to delete configuration');
    }
    setDeleteTarget(null);
  };

  const handleExport = (id: string, identifier: string) => {
    download(exportConfig(id), `${identifier}.json`);
  };

  const handleExportAll = () => {
    download(exportAllConfigs(), 'openpdh-configs.json');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = parseImport(text);
      if (result.items.length === 0) {
        setError('No valid configurations found in file');
      } else if (result.conflicts.length > 0) {
        setImportData(result);
      } else {
        const count = importConfigs(result.items);
        setSuccess(`Imported ${count} configuration${count !== 1 ? 's' : ''}`);
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
    setSuccess(`Imported ${count} configuration${count !== 1 ? 's' : ''}`);
    setImportData(null);
    load();
  };

  return (
    <Stack gap="md">
      <Paper shadow="xs" p="sm" radius="md">
        <Group gap="sm" wrap="wrap" justify="space-between">
          <Group gap="sm">
            <Button size="xs" variant="light" onClick={() => fileInputRef.current?.click()}>
              Import
            </Button>
            {configs.length > 0 && (
              <Button size="xs" variant="light" onClick={handleExportAll}>
                Export all
              </Button>
            )}
          </Group>
          <Button size="xs" onClick={onNew}>Add new configuration</Button>
        </Group>
      </Paper>

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

      {configs.length === 0 && (
        <Paper shadow="xs" p="md" radius="md">
          <Text size="sm" c="dimmed" ta="center">
            No configurations yet. Create one or import from a file.
          </Text>
        </Paper>
      )}

      {configs.length > 0 && (
        <Paper shadow="xs" p="sm" radius="md">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            Configurations ({configs.length})
          </Text>
          <Stack gap="xs">
            {configs.map(c => (
              <Card key={c.id} withBorder padding="xs" radius="sm">
                <Group justify="space-between" wrap="nowrap">
                  <Text size="sm" fw={500}>{c.identifier}</Text>
                  <Group gap={6}>
                    <Button size="compact-xs" variant="light" onClick={() => handleExport(c.id, c.identifier)}>
                      Export
                    </Button>
                    <Button size="compact-xs" variant="light" onClick={() => onEdit(c.id)}>
                      Edit
                    </Button>
                    <CloseButton
                      size="sm"
                      onClick={() => setDeleteTarget({ id: c.id, identifier: c.identifier })}
                    />
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        </Paper>
      )}
      <Modal
        opened={!!importData}
        onClose={() => setImportData(null)}
        title="Overwrite existing configurations?"
        centered
        size="sm"
      >
        <Text size="sm" mb="xs">
          The following configurations already exist and will be overwritten:
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
        title="Delete configuration"
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
