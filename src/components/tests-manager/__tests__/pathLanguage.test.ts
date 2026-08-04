import { MutableDecisionService } from '@edgerules/node/mutable';
import { describe, expect, it } from 'vitest';
import { collectKnownPaths } from '../model/paths';
import { createPathLanguageService } from '../model/pathLanguage';
import { deriveRows } from '../model/rows';
import type { TestSubject } from '../tests-manager-types';

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Workbook' };

const ARRAY_MODEL = `{
    type CreditLine: { balance: <number>, limit: <number> }
    type Applicant: { name: <string>, creditLine: <CreditLine[]> }
    application: {
        applicant: <Applicant[]>
        reference: <string>
    }
}`;

const knownPaths = collectKnownPaths(
  deriveRows(MutableDecisionService.fromCode(ARRAY_MODEL), MODEL_SUBJECT).map((row) => row.path),
);

const service = createPathLanguageService({ knownPaths });

function labels(code: string, pos = code.length): string[] {
  return service.completions?.(code, pos).options.map((option) => option.label) ?? [];
}

describe('path diagnostics', () => {
  // The bug this replaces: the engine's own `diagnostics()` compiles the cell text as a whole
  // model, so it reported the first segment of every valid path as an unknown reference.
  it('reports nothing for a path the model declares, at any index', () => {
    expect(service.diagnostics('application.applicant[0].creditLine')).toEqual([]);
    expect(service.diagnostics('application.applicant[2].creditLine[7].balance')).toEqual([]);
    expect(service.diagnostics('application')).toEqual([]);
  });

  it('reports nothing for an empty cell — mid-edit is not an error', () => {
    expect(service.diagnostics('')).toEqual([]);
  });

  it('marks the first undeclared segment, not the whole path', () => {
    const [diagnostic] = service.diagnostics('application.applicant[0].nope');
    expect(diagnostic.message).toContain("'nope' is not a field of 'application.applicant[0]'");
    expect(diagnostic.from).toBe('application.applicant[0].'.length);
    expect(diagnostic.to).toBe('application.applicant[0].nope'.length);
    expect(diagnostic.severity).toBe('error');
  });

  it('marks an unknown root segment from the start', () => {
    const [diagnostic] = service.diagnostics('applicant[0].name');
    expect(diagnostic.from).toBe(0);
    expect(diagnostic.message).toContain('not declared by this test subject');
  });

  it('reports malformed path syntax', () => {
    expect(service.diagnostics('application.')[0].message).toContain('Not a valid path');
    expect(service.diagnostics('application..name')[0].message).toContain('Not a valid path');
  });

  it('reports a path another row already occupies', () => {
    const withTaken = createPathLanguageService({
      knownPaths,
      takenPaths: new Set(['application.reference']),
    });
    expect(withTaken.diagnostics('application.reference')[0].message).toContain(
      'Another row already uses this path',
    );
  });

  it('reports nothing at all when the subject has no readable schema', () => {
    const empty = createPathLanguageService({ knownPaths: new Set() });
    expect(empty.diagnostics('whatever.i.like')).toEqual([]);
  });
});

describe('path completions', () => {
  // The bug this replaces: completions came from the model language service, so a path cell
  // offered built-ins like `matchesPattern(...)` and nothing addressable.
  it('completes the children of a typed prefix, shallowest first', () => {
    expect(labels('application.')).toEqual([
      'application.applicant',
      'application.reference',
      'application.applicant[0]',
      'application.applicant[0].creditLine',
      'application.applicant[0].name',
      'application.applicant[0].creditLine[0]',
      'application.applicant[0].creditLine[0].balance',
      'application.applicant[0].creditLine[0].limit',
    ]);
  });

  it('completes from a partially typed segment', () => {
    expect(labels('application.applicant[0].n')).toEqual(['application.applicant[0].name']);
  });

  it('keeps the index the user typed while completing the rest', () => {
    expect(labels('application.applicant[3].creditLine[1].')).toEqual([
      'application.applicant[3].creditLine[1].balance',
      'application.applicant[3].creditLine[1].limit',
    ]);
  });

  it('offers every root path on an empty cell', () => {
    expect(labels('')).toContain('application');
  });

  it('offers nothing beyond a complete leaf', () => {
    expect(labels('application.applicant[0].name')).toEqual([]);
  });

  it('replaces the whole cell, so picking a deep leaf is one choice', () => {
    const result = service.completions?.('application.app', 15);
    expect(result?.from).toBe(0);
    expect(result?.to).toBe('application.app'.length);
  });
});
