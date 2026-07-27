import { useSyncExternalStore } from 'react';
import type { DocumentationService } from './documentation-service-types';

export function useDescription(service: DocumentationService, path: string): string | undefined {
  return useSyncExternalStore(service.subscribe, () => service.getDescription(path));
}
