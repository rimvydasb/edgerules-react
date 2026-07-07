import { describe, expect, it } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { embedService } from '../language/service';
import { CELL_EMBED_PREFIX, CELL_EMBED_SUFFIX } from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const embedded = embedService(MutableDecisionService, {
  prefix: CELL_EMBED_PREFIX,
  suffix: CELL_EMBED_SUFFIX,
});

describe('embedService (real engine)', () => {
  it('reports no diagnostics for a cell expression valid in the surrounding model', () => {
    expect(embedded.diagnostics('applicant.age + 1')).toEqual([]);
  });

  it('maps diagnostics for a broken cell into cell-local coordinates', () => {
    const cell = 'applicant.age +';
    const diagnostics = embedded.diagnostics(cell);
    expect(diagnostics.length).toBeGreaterThan(0);
    for (const diagnostic of diagnostics) {
      expect(diagnostic.from).toBeGreaterThanOrEqual(0);
      expect(diagnostic.to).toBeLessThanOrEqual(cell.length);
      expect(diagnostic.from).toBeLessThanOrEqual(diagnostic.to);
    }
  });

  it('surfaces a linker error for a name unknown in the surrounding model', () => {
    const cell = 'bogusReference';
    const diagnostics = embedded.diagnostics(cell);
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0].message.toLowerCase()).toContain('bogus');
  });

  it('completes cell members from the surrounding model scope', () => {
    const cell = 'applicant.';
    const result = embedded.completions!(cell, cell.length);
    const labels = result.options.map((option) => option.label);
    expect(labels).toContain('age');
    expect(labels).toContain('address');
    expect(result.from).toBe(cell.length);
    expect(result.to).toBe(cell.length);
  });

  it('maps the completion replace range into cell coordinates', () => {
    const cell = 'applicant.ag';
    const result = embedded.completions!(cell, cell.length);
    expect(result.from).toBe('applicant.'.length);
    expect(result.to).toBe(cell.length);
  });
});
