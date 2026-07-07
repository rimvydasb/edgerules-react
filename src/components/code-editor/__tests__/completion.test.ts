import { describe, expect, it } from 'vitest';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { edgeRulesCompletionSource } from '../language/completion';
import type { CodeEditorService } from '../language/service';
import { VALID_MODEL_DSL } from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const service: CodeEditorService = MutableDecisionService;

function complete(doc: string, pos: number, explicit = true): CompletionResult | null {
  const source = edgeRulesCompletionSource(() => service);
  const state = EditorState.create({ doc });
  return source(new CompletionContext(state, pos, explicit)) as CompletionResult | null;
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((option) => option.label);
}

describe('edgeRulesCompletionSource (real engine)', () => {
  it('suggests user-scope names, built-ins, and keywords at root scope', () => {
    const pos = VALID_MODEL_DSL.indexOf('limit: riskScore') + 'limit: '.length;
    const result = complete(VALID_MODEL_DSL, pos);
    const all = labels(result);

    expect(all).toContain('applicant');
    expect(all).toContain('riskScore');
    expect(all).toContain('Customer');
    expect(all).toContain('abs'); // built-in
    expect(all).toContain('if'); // keyword

    // Engine rank (user scope > built-ins > keywords) is preserved via descending boost.
    const options = result!.options;
    const applicantIndex = options.findIndex((o) => o.label === 'applicant');
    const absIndex = options.findIndex((o) => o.label === 'abs');
    expect(options[applicantIndex].boost!).toBeGreaterThan(options[absIndex].boost!);
  });

  it('completes members after a dotted receiver', () => {
    const doc = VALID_MODEL_DSL.replace(
      'limit: riskScore(applicant.age).score',
      'limit: applicant.',
    );
    const pos = doc.indexOf('limit: applicant.') + 'limit: applicant.'.length;
    const result = complete(doc, pos);

    expect(labels(result).sort()).toEqual(['address', 'age']);
    expect(result!.options.every((option) => option.type === 'property')).toBe(true);
  });

  it('carries built-in signatures as detail', () => {
    const pos = VALID_MODEL_DSL.indexOf('limit: ') + 'limit: '.length;
    const result = complete(VALID_MODEL_DSL, pos);
    const abs = result!.options.find((option) => option.label === 'abs');
    expect(abs?.detail).toMatch(/number/);
  });

  it('still completes in a syntactically broken document (mid-keystroke)', () => {
    const broken = '{\n  applicant: {\n    age: 21\n  }\n  x: \n}';
    const pos = broken.indexOf('x: ') + 'x: '.length;
    const result = complete(broken, pos);
    expect(labels(result)).toContain('applicant');
  });

  it('does not fire implicitly without a prefix or dot', () => {
    const pos = VALID_MODEL_DSL.indexOf('limit: ') + 'limit: '.length;
    expect(complete(VALID_MODEL_DSL, pos, false)).toBeNull();
  });

  it('fires implicitly right after a dot', () => {
    const doc = VALID_MODEL_DSL.replace(
      'limit: riskScore(applicant.age).score',
      'limit: applicant.',
    );
    const pos = doc.indexOf('limit: applicant.') + 'limit: applicant.'.length;
    const result = complete(doc, pos, false);
    expect(labels(result)).toContain('age');
  });

  it('returns a valid replace range clamped to the document', () => {
    const doc = VALID_MODEL_DSL.replace('limit: riskScore', 'limit: risk');
    const pos = doc.indexOf('limit: risk') + 'limit: risk'.length;
    const result = complete(doc, pos)!;
    expect(result.from).toBe(doc.indexOf('limit: risk') + 'limit: '.length);
    expect(result.to).toBe(pos);
  });

  it('returns null when the service has no completions capability', () => {
    const diagnosticsOnly: CodeEditorService = { diagnostics: () => [] };
    const source = edgeRulesCompletionSource(() => diagnosticsOnly);
    const state = EditorState.create({ doc: '{ a: 1 }' });
    expect(source(new CompletionContext(state, 5, true))).toBeNull();
  });
});
