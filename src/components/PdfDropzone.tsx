import { useRef } from 'react';
import { Group, Text, Button, CloseButton } from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import '@mantine/dropzone/styles.css';

interface Props {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  label?: string;
}

export function PdfDropzone({ file, onFileSelect, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (file) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFileSelect(f);
            e.target.value = '';
          }}
        />
        <Group
          gap={6}
          align="center"
          style={{
            border: '1px solid var(--mantine-color-default-border)',
            borderRadius: 'var(--mantine-radius-sm)',
            padding: '4px 8px',
            height: 30,
          }}
        >
          <Text size="xs" truncate style={{ maxWidth: 160 }}>{file.name}</Text>
          <Button size="compact-xs" variant="subtle" onClick={() => inputRef.current?.click()}>
            Change
          </Button>
          <CloseButton size="xs" onClick={() => onFileSelect(null)} />
        </Group>
      </>
    );
  }

  return (
    <Dropzone
      onDrop={(files) => {
        if (files[0]) onFileSelect(files[0]);
      }}
      accept={[MIME_TYPES.pdf]}
      maxFiles={1}
      multiple={false}
      py={4}
      px="sm"
      radius="sm"
      style={{ flex: '1 1 160px', maxWidth: 240, cursor: 'pointer' }}
    >
      <Text size="xs" ta="center" c="dimmed" style={{ pointerEvents: 'none' }}>
        {label ?? 'Select or drop PDF'}
      </Text>
    </Dropzone>
  );
}
