import { useRef } from 'react';
import { Group, Text, Button, CloseButton } from '@mantine/core';
import { Dropzone, MIME_TYPES } from '@mantine/dropzone';
import { IconFileUpload } from '@tabler/icons-react';
import { fileKey } from '../lib/fileStore';
import { fileInputWrapperStyle } from '../lib/styles';
import '@mantine/dropzone/styles.css';

interface SingleProps {
  multiple?: false;
  file: File | null;
  onFileSelect: (file: File | null) => void;
  label?: string;
}

interface MultiProps {
  multiple: true;
  files: File[];
  onFilesChange: (files: File[]) => void;
  label?: string;
}

type Props = SingleProps | MultiProps;

export function PdfDropzone(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { label, multiple } = props;

  if (multiple) {
    const { files, onFilesChange } = props;

    const addFiles = (newFiles: File[]) => {
      const existing = new Set(files.map(fileKey));
      const unique = newFiles.filter(f => !existing.has(fileKey(f)));
      if (unique.length > 0) onFilesChange([...files, ...unique]);
    };

    if (files.length > 0) {
      return (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files) addFiles(Array.from(e.target.files));
              e.target.value = '';
            }}
          />
          <Group
            gap={6}
            align="center"
            style={fileInputWrapperStyle}
          >
            <Text size="xs" truncate style={{ maxWidth: 160 }}>
              {files.length} file{files.length !== 1 ? 's' : ''}
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={() => inputRef.current?.click()}>
              Add more
            </Button>
            <CloseButton size="xs" onClick={() => onFilesChange([])} />
          </Group>
        </>
      );
    }

    return (
      <Dropzone
        onDrop={addFiles}
        accept={[MIME_TYPES.pdf]}
        multiple
        py={6}
        px="sm"
        radius="sm"
        style={{
          flex: '1 1 160px',
          maxWidth: 260,
          cursor: 'pointer',
          borderWidth: 2,
          borderStyle: 'dashed',
          borderColor: 'var(--mantine-color-blue-4)',
          backgroundColor: 'light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))',
        }}
      >
        <Group gap={6} justify="center" style={{ pointerEvents: 'none' }}>
          <IconFileUpload size={18} color="var(--mantine-color-blue-6)" />
          <Text size="xs" fw={500} c="blue.6">
            {label ?? 'Select or drop PDFs'}
          </Text>
        </Group>
      </Dropzone>
    );
  }

  // Single-file mode (original behavior)
  const { file, onFileSelect } = props;

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
      py={6}
      px="sm"
      radius="sm"
      style={{
        flex: '1 1 160px',
        maxWidth: 260,
        cursor: 'pointer',
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: 'var(--mantine-color-blue-4)',
        backgroundColor: 'light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))',
      }}
    >
      <Group gap={6} justify="center" style={{ pointerEvents: 'none' }}>
        <IconFileUpload size={18} color="var(--mantine-color-blue-6)" />
        <Text size="xs" fw={500} c="blue.6">
          {label ?? 'Select or drop PDF'}
        </Text>
      </Group>
    </Dropzone>
  );
}
