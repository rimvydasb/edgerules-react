// Deliberately no `fake-indexeddb/auto` import in this file — jsdom ships no IndexedDB
// implementation, so `typeof indexedDB === 'undefined'` genuinely holds here.
import { describe, expect, it } from 'vitest';
import { createDocumentationService } from '../createDocumentationService';

describe('createDocumentationService — no indexedDB available', () => {
  it('operates in-memory only, without throwing', async () => {
    expect(typeof indexedDB).toBe('undefined');

    const service = createDocumentationService('model');
    await new Promise<void>((resolve) => {
      const unsubscribe = service.subscribe(() => {
        unsubscribe();
        resolve();
      });
    });

    service.setDescription('age', 'Applicant age in years');
    expect(service.getDescription('age')).toBe('Applicant age in years');

    service.renamePath('age', 'applicant.age');
    expect(service.getDescription('age')).toBeUndefined();
    expect(service.getDescription('applicant.age')).toBe('Applicant age in years');

    service.dispose();
  });
});
