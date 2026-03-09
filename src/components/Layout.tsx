import { AppShell, Group, Button, Text } from '@mantine/core';
import { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  currentView: string;
  onNavigate: (view: any) => void;
}

export function Layout({ children, currentView, onNavigate }: Props) {
  return (
    <AppShell header={{ height: 60 }} footer={{ height: 40 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <img
            src="/OPENPDH_HEADER.png"
            alt="OpenPDH"
            style={{ height: 36, cursor: 'pointer', flexShrink: 0 }}
            onClick={() => onNavigate('read')}
          />
          <Group gap="xs" wrap="nowrap">
            <Button
              size="sm"
              variant={currentView === 'read' ? 'filled' : 'light'}
              onClick={() => onNavigate('read')}
            >
              Read document
            </Button>
            <Button
              size="sm"
              variant={currentView === 'configs' || currentView === 'configure' ? 'filled' : 'light'}
              onClick={() => onNavigate('configs')}
            >
              Configurations
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>{children}</AppShell.Main>

      <AppShell.Footer p="xs">
        <Group justify="center" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            © {new Date().getFullYear()} Martin Sooväli & Codemption OÜ
          </Text>
          <Text size="xs" c="dimmed">·</Text>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            Need end-to-end document automation or custom software development?{' '}
            <a href="https://www.linkedin.com/in/martin-soovali/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--mantine-color-blue-5)' }}>
              Let's talk
            </a>
          </Text>
        </Group>
      </AppShell.Footer>
    </AppShell>
  );
}
