import { useState } from 'react';
import { AppShell, Group, Text, Modal, Stack, Anchor, ActionIcon } from '@mantine/core';
import type { ReactNode } from 'react';
import type { View } from '../App';

interface Props {
  children: ReactNode;
  onNavigate: (view: View) => void;
}

export function Layout({ children, onNavigate }: Props) {
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <AppShell header={{ height: 60 }} footer={{ height: 40 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <img
            src="/OPENPDH_HEADER.png"
            alt="OpenPDH"
            style={{ height: 36, cursor: 'pointer', flexShrink: 0 }}
            onClick={() => onNavigate('configs')}
          />
          <div />
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
            Need custom software?{' '}
            <Anchor
              component="button"
              type="button"
              size="xs"
              onClick={() => setContactOpen(true)}
            >
              Let's talk
            </Anchor>
          </Text>
          <Text size="xs" c="dimmed">·</Text>
          <ActionIcon
            component="a"
            href="https://github.com/msoovali/OpenPDH"
            target="_blank"
            rel="noopener noreferrer"
            variant="subtle"
            color="gray"
            size="sm"
            title="GitHub"
          >
            <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </ActionIcon>
        </Group>
      </AppShell.Footer>

      <Modal
        opened={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Get in touch"
        centered
        size="sm"
      >
        <Text size="sm" mb="md">
          Need end-to-end document automation or custom software development?
        </Text>
        <Stack gap="xs">
          <Anchor href="https://www.linkedin.com/in/martin-soovali/" target="_blank" rel="noopener noreferrer" size="sm">
            LinkedIn — Martin Soovali
          </Anchor>
          <Anchor href="mailto:cemption@gmail.com" size="sm">
            cemption@gmail.com
          </Anchor>
        </Stack>
      </Modal>
    </AppShell>
  );
}
