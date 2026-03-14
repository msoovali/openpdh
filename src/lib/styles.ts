import type { CSSProperties } from 'react';

// Shared color tokens
export const colors = {
  selected: '#228be6',
  ok: '#40c057',
  error: '#fa5252',
  pending: '#adb5bd',
} as const;

// Status indicator dot (8×8 circle)
export function statusDotStyle(status: 'ok' | 'error' | 'pending' | undefined): CSSProperties {
  return {
    width: 8,
    height: 8,
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: status === 'ok' ? colors.ok : status === 'error' ? colors.error : colors.pending,
  };
}

// Sticky first-column cell in a table
export const stickyColumnStyle: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 1,
  backgroundColor: 'var(--mantine-color-body)',
};

// Compact file-input wrapper border
export const fileInputWrapperStyle: CSSProperties = {
  border: '1px solid var(--mantine-color-default-border)',
  borderRadius: 'var(--mantine-radius-sm)',
  padding: '4px 8px',
  height: 30,
};
