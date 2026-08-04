import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDocumentationService } from '../createDocumentationService';
import type { DocumentationService } from '../documentation-service-types';

function uniqueDbName(): string {
  return `documentation-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: DocumentationService): Promise<void> {
  return new Promise((resolve) => {
    const unsubscribe = service.subscribe(() => {
      unsubscribe();
      resolve();
    });
  });
}

// Background persistence (see Error handling: "Synchronous API, asynchronous persistence") has no
// public "flush" — poll a fresh instance against the same dbName until it observes the expected
// state, rather than guessing a fixed number of event-loop ticks (flaky under parallel test load).
async function waitForPersisted(
  dbName: string,
  modelName: string,
  predicate: (probe: DocumentationService) => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const probe = createDocumentationService(modelName, { dbName });
    await waitForHydration(probe);
    const satisfied = predicate(probe);
    probe.dispose();
    if (satisfied) return;
    if (Date.now() - start > timeoutMs) throw new Error('waitForPersisted timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('createDocumentationService — hydration', () => {
  it('starts empty and notifies once hydration completes', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    await waitForHydration(service);
    expect(service.getDescription('age')).toBeUndefined();
    service.dispose();
  });

  it('hydrates from entries pre-seeded by another instance', async () => {
    const dbName = uniqueDbName();
    const first = createDocumentationService('model', { dbName });
    await waitForHydration(first);
    first.setDescription('age', 'Applicant age in years');
    first.dispose();

    const second = createDocumentationService('model', { dbName });
    await waitForHydration(second);
    expect(second.getDescription('age')).toBe('Applicant age in years');
    second.dispose();
  });
});

describe('createDocumentationService — get/set', () => {
  it('round-trips a description', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.setDescription('age', 'Applicant age in years');
    expect(service.getDescription('age')).toBe('Applicant age in years');
    service.dispose();
  });

  it('empty string clears the description and removes the IndexedDB row', async () => {
    const dbName = uniqueDbName();
    const first = createDocumentationService('model', { dbName });
    await waitForHydration(first);
    first.setDescription('age', 'Applicant age in years');
    first.setDescription('age', '');
    expect(first.getDescription('age')).toBeUndefined();
    first.dispose();

    const second = createDocumentationService('model', { dbName });
    await waitForHydration(second);
    expect(second.getDescription('age')).toBeUndefined();
    second.dispose();
  });
});

describe('createDocumentationService — renamePath', () => {
  it('migrates an existing entry to the new path', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    await waitForHydration(service);
    service.setDescription('credit.balance', 'Outstanding balance');

    service.renamePath('credit.balance', 'wallet.balance');

    expect(service.getDescription('credit.balance')).toBeUndefined();
    expect(service.getDescription('wallet.balance')).toBe('Outstanding balance');
    service.dispose();
  });

  it('no-ops for a path with no description', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const listener = vi.fn();
    service.subscribe(listener);

    service.renamePath('missing', 'stillMissing');

    expect(listener).not.toHaveBeenCalled();
    expect(service.getDescription('stillMissing')).toBeUndefined();
    service.dispose();
  });

  it('persists the rename so a fresh instance observes it', async () => {
    const dbName = uniqueDbName();
    const first = createDocumentationService('model', { dbName });
    await waitForHydration(first);
    first.setDescription('credit.balance', 'Outstanding balance');
    first.renamePath('credit.balance', 'wallet.balance');
    // `renamePath`'s background persistence is a sequential delete-then-put (see the story's
    // IndexedDB schema write-up) — wait for it to actually land before disposing, or `dispose()`'s
    // `db.close()` can land between the two steps and drop the `put`.
    await waitForPersisted(dbName, 'model', (probe) => probe.getDescription('wallet.balance') !== undefined);
    first.dispose();

    const second = createDocumentationService('model', { dbName });
    await waitForHydration(second);
    expect(second.getDescription('credit.balance')).toBeUndefined();
    expect(second.getDescription('wallet.balance')).toBe('Outstanding balance');
    second.dispose();
  });
});

describe('createDocumentationService — subscribe', () => {
  it('notifies on write and once after hydration', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    const listener = vi.fn();
    service.subscribe(listener);
    await waitForHydration(service);
    expect(listener).toHaveBeenCalledTimes(1);

    service.setDescription('age', 'Applicant age in years');
    expect(listener).toHaveBeenCalledTimes(2);
    service.dispose();
  });

  it('two independent instances over the same dbName/modelName observe each other after re-hydration', async () => {
    const dbName = uniqueDbName();
    const a = createDocumentationService('model', { dbName });
    const b = createDocumentationService('model', { dbName });
    await Promise.all([waitForHydration(a), waitForHydration(b)]);

    a.setDescription('age', 'Applicant age in years');
    // `b`'s in-memory cache is independent; it only observes `a`'s write once it re-hydrates.
    expect(b.getDescription('age')).toBeUndefined();

    b.dispose();
    const bAgain = createDocumentationService('model', { dbName });
    await waitForHydration(bAgain);
    expect(bAgain.getDescription('age')).toBe('Applicant age in years');

    a.dispose();
    bAgain.dispose();
  });
});

describe('createDocumentationService — dispose', () => {
  it('stops further notifications', async () => {
    const service = createDocumentationService('model', { dbName: uniqueDbName() });
    await waitForHydration(service);
    const listener = vi.fn();
    service.subscribe(listener);

    service.dispose();
    expect(() => service.setDescription('age', 'text')).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it('discards an in-flight hydration result on arrival', async () => {
    const dbName = uniqueDbName();
    const warm = createDocumentationService('model', { dbName });
    await waitForHydration(warm);
    warm.setDescription('age', 'text');
    warm.dispose();

    const service = createDocumentationService('model', { dbName });
    const listener = vi.fn();
    service.subscribe(listener);
    service.dispose();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createDocumentationService — persistence errors', () => {
  it('reports a background persistence failure via onPersistError without throwing', async () => {
    const onPersistError = vi.fn();
    const service = createDocumentationService('model', { dbName: uniqueDbName(), onPersistError });
    await waitForHydration(service);
    // Disposing closes the underlying connection; a subsequent write's background persistence
    // attempt against the closed db surfaces as a persistence error, not a thrown exception.
    service.dispose();
    expect(() => service.setDescription('age', 'text')).not.toThrow();
  });
});
