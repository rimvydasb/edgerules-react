import type { PortableError } from '@edgerules/portable';

export function isPortableError(value: unknown): value is PortableError {
  return typeof value === 'object' && value !== null && (value as { '@kind'?: unknown })['@kind'] === 'error';
}
