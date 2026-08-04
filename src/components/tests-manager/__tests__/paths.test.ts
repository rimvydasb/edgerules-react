import { MutableDecisionService } from '@edgerules/node/mutable';
import { describe, expect, it } from 'vitest';
import {
  collectKnownPaths,
  hasIndex,
  isKnownPath,
  isValidPathSyntax,
  nextDuplicatePath,
  normalizeIndexes,
  parsePathSegments,
  pathPrefixes,
} from '../model/paths';
import { deriveRows } from '../model/rows';
import type { TestSubject } from '../tests-manager-types';

const MODEL_SUBJECT: TestSubject = { id: '*', kind: 'model', name: 'Workbook' };

const ARRAY_MODEL = `{
    type CreditLine: { balance: <number>, limit: <number> }
    type Applicant: { name: <string>, creditLine: <CreditLine[]> }
    application: { applicant: <Applicant[]> }
}`;

describe('parsePathSegments', () => {
  it('splits field names and indexes', () => {
    expect(parsePathSegments('application.applicant[0].creditLine[1].balance')).toEqual([
      'application',
      'applicant',
      0,
      'creditLine',
      1,
      'balance',
    ]);
  });

  it('handles consecutive indexes of a multi-dimensional array', () => {
    expect(parsePathSegments('grid[2][3]')).toEqual(['grid', 2, 3]);
  });

  it('rejects malformed paths', () => {
    for (const bad of ['applicant[', 'applicant[a]', 'applicant..name', '.name', '1abc']) {
      expect(isValidPathSyntax(bad)).toBe(false);
    }
  });

  it('treats the empty path (a scalar result row) as well formed', () => {
    expect(parsePathSegments('')).toEqual([]);
  });
});

describe('normalizeIndexes / hasIndex', () => {
  it('resets every index to zero', () => {
    expect(normalizeIndexes('applicant[2].creditLine[13].balance')).toBe(
      'applicant[0].creditLine[0].balance',
    );
  });

  it('leaves an index-free path alone', () => {
    expect(normalizeIndexes('credit.balance')).toBe('credit.balance');
    expect(hasIndex('credit.balance')).toBe(false);
    expect(hasIndex('credit[0].balance')).toBe(true);
  });
});

describe('pathPrefixes', () => {
  it('walks field and index steps alike', () => {
    expect(pathPrefixes('a[0].b')).toEqual(['a', 'a[0]', 'a[0].b']);
  });
});

describe('nextDuplicatePath', () => {
  it('bumps the deepest index', () => {
    expect(nextDuplicatePath('applicant[0].creditLine[0].balance', [])).toBe(
      'applicant[0].creditLine[1].balance',
    );
    expect(nextDuplicatePath('applicant[0].name', [])).toBe('applicant[1].name');
  });

  it('skips indexes already taken by another row', () => {
    expect(
      nextDuplicatePath('history[0]', ['history[0]', 'history[1]', 'history[2]']),
    ).toBe('history[3]');
  });

  it('is undefined for a path with no index — nothing to duplicate', () => {
    expect(nextDuplicatePath('credit.balance', [])).toBeUndefined();
  });
});

describe('isKnownPath against a real model', () => {
  const known = collectKnownPaths(
    deriveRows(MutableDecisionService.fromCode(ARRAY_MODEL), MODEL_SUBJECT).map((row) => row.path),
  );

  it('accepts a derived leaf and every prefix of it', () => {
    expect(isKnownPath('application.applicant[0].creditLine[0].balance', known)).toBe(true);
    expect(isKnownPath('application.applicant[0].creditLine', known)).toBe(true);
    expect(isKnownPath('application.applicant', known)).toBe(true);
    expect(isKnownPath('application', known)).toBe(true);
  });

  it('accepts any index of an array the model declares — that is what Duplicate produces', () => {
    expect(isKnownPath('application.applicant[3].creditLine[7].balance', known)).toBe(true);
  });

  it('rejects a field the model does not declare, and a malformed path', () => {
    expect(isKnownPath('application.applicant[0].score', known)).toBe(false);
    expect(isKnownPath('applicant[0].name', known)).toBe(false);
    expect(isKnownPath('application.applicant[0', known)).toBe(false);
  });

  it('accepts everything when the universe is empty — an unreadable schema paints nothing red', () => {
    expect(isKnownPath('anything.at.all', new Set())).toBe(true);
  });
});
