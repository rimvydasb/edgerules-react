import { describe, expect, it } from 'vitest';
import { parseProjectBundle, parseProjectLocator } from '../bundle/parseProjectBundle';
import { ProjectError } from '../errors';
import { contractBundle } from '../testing/repositoryContract';

function issuesOf(run: () => unknown): readonly string[] {
  try {
    run();
  } catch (error) {
    if (error instanceof ProjectError) return error.issues;
    throw error;
  }
  throw new Error('expected a ProjectError');
}

describe('parseProjectBundle', () => {
  it('round-trips a bundle through JSON unchanged', () => {
    const bundle = contractBundle();
    const parsed = parseProjectBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed).toEqual(bundle);
    expect(parseProjectBundle(JSON.parse(JSON.stringify(parsed)))).toEqual(bundle);
  });

  it('returns a copy that shares nothing with its input', () => {
    const bundle = contractBundle();
    const parsed = parseProjectBundle(bundle);
    parsed.flow.layout.positions.b.x = 999;
    expect(bundle.flow.layout.positions.b.x).toBe(10);
  });

  it('keeps optional chart nodes of the flow layout', () => {
    const bundle = contractBundle();
    bundle.flow.layout.charts = [{ id: 'chart', source: { node: 'b', handle: 'result' }, size: { width: 300, height: 200 } }];
    expect(parseProjectBundle(bundle).flow.layout.charts).toEqual(bundle.flow.layout.charts);
  });

  it('lists every schema violation with its path', () => {
    const bundle = contractBundle() as unknown as Record<string, any>;
    bundle.manifest.kind = 'Other';
    bundle.manifest.name = '';
    bundle.model = 42;
    bundle.documentation.byPath.a = 7;
    bundle.tests.subjects['*'].rows[0].section = 'outputs';
    bundle.tests.subjects['*'].cases[0].inputs = [];
    bundle.flow.layout.positions.b = { x: 'left', y: 0 };
    expect(issuesOf(() => parseProjectBundle(bundle))).toEqual([
      'manifest.kind: expected "EdgeRulesProject"',
      'manifest.name: expected a non-empty string',
      'model: expected a string',
      'documentation.byPath.a: expected a string',
      'tests.subjects.*.cases[0].inputs: expected an object',
      'tests.subjects.*.rows[0].section: expected a test section',
      'flow.layout.positions.b.x: expected a number',
    ]);
  });

  it('requires every slice and its schema version', () => {
    const { documentation: _documentation, ...bundle } = contractBundle();
    expect(issuesOf(() => parseProjectBundle({ ...bundle, tests: { schemaVersion: 2, subjects: {} } }))).toEqual([
      'documentation: expected an object',
      'tests.schemaVersion: expected 1',
    ]);
  });

  it('rejects a missing or malformed format version', () => {
    const bundle = contractBundle() as unknown as Record<string, any>;
    delete bundle.manifest.formatVersion;
    expect(() => parseProjectBundle(bundle)).toThrow(expect.objectContaining({ code: 'invalid-bundle' }));
    expect(() => parseProjectBundle('not a bundle')).toThrow(expect.objectContaining({ code: 'invalid-bundle' }));
  });

  it('refuses a bundle written by a newer format', () => {
    const bundle = contractBundle();
    bundle.manifest.formatVersion = 2;
    expect(() => parseProjectBundle(bundle)).toThrow(expect.objectContaining({ code: 'unsupported-format' }));
  });

  it('migrates an older format step by step before validating', () => {
    // A hypothetical format 1 -> 2 -> 3 history: 2 renamed `docs` to `documentation`, 3 added flow.
    const v1 = { ...contractBundle(), docs: contractBundle().documentation } as Record<string, any>;
    delete v1.documentation;
    delete v1.flow;
    const migrations = {
      1: ({ docs, ...rest }: Record<string, unknown>) => ({ ...rest, documentation: docs }),
      2: (bundle: Record<string, unknown>) => ({ ...bundle, flow: { schemaVersion: 1, layout: { positions: {}, outputs: [] } } }),
    };
    const migrated = parseProjectBundle(v1, migrations, 3);
    expect(migrated.manifest.formatVersion).toBe(3);
    expect(migrated.documentation).toEqual(contractBundle().documentation);
    expect(migrated.flow.layout).toEqual({ positions: {}, outputs: [] });
    expect(v1.docs).toBeDefined(); // the input is not touched
  });

  it('reports a gap in the migration chain', () => {
    expect(() => parseProjectBundle(contractBundle(), {}, 2)).toThrow(
      expect.objectContaining({ code: 'unsupported-format' }),
    );
  });
});

describe('parseProjectLocator', () => {
  it('accepts the indexeddb provider and drops unknown fields', () => {
    expect(parseProjectLocator({ provider: 'indexeddb', resource: 'db', projectPath: 'p', extra: 1 })).toEqual({
      provider: 'indexeddb',
      resource: 'db',
      projectPath: 'p',
    });
  });

  it('rejects an unknown provider or an empty path', () => {
    expect(issuesOf(() => parseProjectLocator({ provider: 'ftp', resource: 'db', projectPath: '' }))).toEqual([
      'locator.provider: expected indexeddb, github or s3',
      'locator.projectPath: expected a non-empty string',
    ]);
  });
});
