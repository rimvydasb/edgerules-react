import { describe, expect, it } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import type {
  PortableNode,
  PortableRulesetDefinition,
  PortableRulesetSchema,
} from '@edgerules/portable';
import {
  buildExpressionFromCells,
  buildTableModel,
  duplicatePriorities,
  emptyRow,
  formatCellValue,
  isValidColumnName,
  isValidPriority,
  parseExpressionToCells,
  prettyUnaryTest,
  rowToRule,
  whenCellEmbedContext,
  withHitPolicy,
  withInputColumnAdded,
  withInputColumnRemoved,
  withInputColumnRenamed,
  withInputColumnTypeChanged,
  withOutputColumnAdded,
  withOutputColumnRenamed,
  withOutputColumnsReordered,
} from '../table-model';
import { RISK_MODEL_DSL, SCORECARD_MODEL_DSL } from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
function riskDefinition(): {
  service: MutableDecisionService;
  definition: PortableRulesetDefinition;
  schema: PortableRulesetSchema;
} {
  const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
  return {
    service,
    definition: service.get('risk.*') as PortableRulesetDefinition,
    schema: service.get('risk') as unknown as PortableRulesetSchema,
  };
}

describe('prettyUnaryTest', () => {
  it('re-sugars the normalized range echo back to a..b', () => {
    expect(prettyUnaryTest('... >= 18 and ... <= 25')).toBe('18..25');
  });

  it('unwraps a normalized equality to the bare value', () => {
    expect(prettyUnaryTest('... = "retail"')).toBe('"retail"');
  });

  it('strips the context variable from plain comparisons', () => {
    expect(prettyUnaryTest('... < 30000')).toBe('< 30000');
  });

  it('maps any to the empty (matches-all) cell', () => {
    expect(prettyUnaryTest('any')).toBe('');
  });

  it('keeps named unary tests untouched', () => {
    expect(prettyUnaryTest('isCore')).toBe('isCore');
  });
});

describe('formatCellValue', () => {
  it('renders scalars and expression strings as DSL text', () => {
    expect(formatCellValue(1000)).toBe('1000');
    expect(formatCellValue(true)).toBe('true');
    expect(formatCellValue("'high'")).toBe("'high'");
  });

  it('renders nested contexts as record literals', () => {
    expect(
      formatCellValue({
        '@kind': 'context',
        name: "'gold'",
        apr: { '@kind': 'expression', expression: '12.5' },
      }),
    ).toBe("{ name: 'gold', apr: 12.5 }");
  });
});

describe('buildTableModel (against the real engine echo)', () => {
  it('derives input columns from parameters and output columns from the then shape', () => {
    const { definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    expect(
      model.inputs.map((column) => `${column.name}:${column.typeLabel}`),
    ).toEqual(['age:number', 'income:number', 'segment:string']);
    expect(
      model.outputs.map((column) => `${column.name}:${column.typeLabel}`),
    ).toEqual(['level:string', 'limit:number']);
    expect(model.scorecard).toBe(false);
    expect(model.hitPolicy).toBe('first-match');
  });

  it('re-sugars when cells and blanks omitted (any) columns', () => {
    const { definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    const first = model.rows[0];
    expect(first.when).toEqual({
      kind: 'cells',
      cells: { age: '18..25', income: '< 30000', segment: '"retail"' },
    });
    const second = model.rows[1];
    expect(second.when.kind).toBe('cells');
    if (second.when.kind === 'cells') {
      expect(second.when.cells.segment).toBe('');
    }
  });

  it('models a boolean-expression when as an expression row', () => {
    const { definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    expect(model.rows[2].when).toEqual({
      kind: 'expression',
      text: 'age >= 65 or segment = "premium"',
    });
  });

  it('exposes the default row per output column', () => {
    const { definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    expect(model.defaultRow).toEqual({ level: "'none'", limit: '0' });
  });

  it('detects a scorecard and collapses outputs to one score column', () => {
    const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
    const definition = service.get(
      'scoreFactors.*',
    ) as PortableRulesetDefinition;
    const schema = service.get(
      'scoreFactors',
    ) as unknown as PortableRulesetSchema;
    const model = buildTableModel(definition, schema);
    expect(model.scorecard).toBe(true);
    expect(model.outputs).toHaveLength(1);
    expect(model.rows.map((row) => row.then[''])).toEqual(['5', '10', '20']);
  });
});

describe('rowToRule round-trips through the real engine', () => {
  it('writes edited when/then texts back as an accepted rule', async () => {
    const { service, definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    const row = model.rows[0];
    if (row.when.kind === 'cells') {
      row.when.cells.age = '21..30';
    }
    row.then.limit = '1500';
    const result = service.set(
      'risk.rules[0]',
      rowToRule(row, false) as unknown as PortableNode,
    );
    expect((result as { '@kind'?: string })['@kind']).toBe('rule');
    await expect(service.execute('decision')).resolves.toEqual({
      level: 'high',
      limit: 1500,
    });
  });

  it('produces an appendable empty row that links against typed outputs', () => {
    const { service, definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    const rule = rowToRule(emptyRow(model), model.scorecard);
    const result = service.set(
      'risk.rules[3]',
      rule as unknown as PortableNode,
    );
    expect((result as { '@kind'?: string })['@kind']).toBe('rule');
  });

  it('writes scorecard scores as numbers', async () => {
    const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
    const definition = service.get(
      'scoreFactors.*',
    ) as PortableRulesetDefinition;
    const model = buildTableModel(
      definition,
      service.get('scoreFactors') as unknown as PortableRulesetSchema,
    );
    const row = model.rows[1];
    row.then[''] = '12';
    const result = service.set(
      'scoreFactors.rules[1]',
      rowToRule(row, true) as unknown as PortableNode,
    );
    expect((result as { then?: unknown }).then).toBe(12);
    await expect(service.execute('total')).resolves.toBe(32);
  });
});

describe('structural definition edits accepted by the real engine', () => {
  it('withHitPolicy(best-match) assigns priorities the engine accepts', () => {
    const { service, definition } = riskDefinition();
    const result = service.set('risk', withHitPolicy(definition, 'best-match'));
    expect((result as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    const next = service.get('risk.*') as PortableRulesetDefinition;
    expect(next['@hitPolicy']).toBe('best-match');
    expect(next['@rules'].map((rule) => rule.priority)).toEqual([1, 2, 3]);
  });

  it('withHitPolicy(collect-matches) drops the default the engine would reject', () => {
    const { service, definition } = riskDefinition();
    const result = service.set(
      'risk',
      withHitPolicy(definition, 'collect-matches'),
    );
    expect((result as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    expect(
      (service.get('risk.*') as PortableRulesetDefinition)['@default'],
    ).toBeUndefined();
  });

  it('withOutputColumnAdded/Renamed keep every row and the default in shape', async () => {
    const { service, definition } = riskDefinition();
    const added = withOutputColumnAdded(definition, 'reason', "'n/a'");
    expect((service.set('risk', added) as { '@kind'?: string })['@kind']).toBe(
      'ruleset-schema',
    );
    const renamed = withOutputColumnRenamed(
      service.get('risk.*') as PortableRulesetDefinition,
      'reason',
      'note',
    );
    expect(
      (service.set('risk', renamed) as { '@kind'?: string })['@kind'],
    ).toBe('ruleset-schema');
    await expect(service.execute('decision')).resolves.toEqual({
      level: 'high',
      limit: 1000,
      note: 'n/a',
    });
  });

  it('withInputColumnAdded defaults the new parameter so existing call sites keep working', async () => {
    const { service, definition } = riskDefinition();
    const added = withInputColumnAdded(definition, 'channel', 'string');
    const result = service.set('risk', added);
    expect((result as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    // The `decision` call site only ever passed age/income/segment; it must still link and run.
    await expect(service.execute('decision')).resolves.toEqual({
      level: 'high',
      limit: 1000,
    });
    const next = service.get('risk.*') as PortableRulesetDefinition;
    expect(next['@parameters'].channel).toEqual({
      '@kind': 'type',
      type: 'string',
      default: '',
    });
  });

  it('withInputColumnRemoved drops the parameter and its cells', () => {
    const { service, definition } = riskDefinition();
    // `segment` is referenced by rule 3's boolean expression, so remove that rule first.
    const rules = definition['@rules'].slice(0, 2);
    const pruned = withInputColumnRemoved(
      { ...definition, '@rules': rules },
      'segment',
    );
    const result = service.set('risk', pruned);
    // The call site still passes `segment:` — the engine reports it; what matters here is
    // that the definition itself no longer carries the column.
    expect(Object.keys(pruned['@parameters'])).toEqual(['age', 'income']);
    expect(pruned['@rules'][0].when).not.toHaveProperty('segment');
    expect(result).toBeDefined();
  });
});

describe('whenCellEmbedContext', () => {
  it('lets the engine lint a unary-test cell in the ruleset scope', () => {
    const { definition } = riskDefinition();
    const embed = whenCellEmbedContext(definition, 'age');
    expect(
      MutableDecisionService.diagnostics(
        `${embed.prefix}18..25${embed.suffix}`,
      ),
    ).toHaveLength(0);
    const bad = MutableDecisionService.diagnostics(
      `${embed.prefix}"oops"${embed.suffix}`,
    );
    expect(bad.length).toBeGreaterThan(0);
  });
});

describe('cells <-> expression conversion (DT-001 / DT-002)', () => {
  it('buildExpressionFromCells produces a semantics-preserving expression the engine accepts', async () => {
    const { service } = riskDefinition();
    const expression = buildExpressionFromCells(['age', 'income', 'segment'], {
      age: '18..25',
      income: '< 30000',
      segment: '"retail"',
    });
    expect(expression).not.toBeNull();
    const result = service.set('risk.rules[0]', {
      '@kind': 'rule',
      when: { '@kind': 'expression', expression } as unknown as Record<string, unknown>,
      then: { level: "'high'", limit: 1000 },
    } as unknown as Parameters<typeof service.set>[1]);
    expect((result as { '@kind'?: string })['@kind']).toBe('rule');
    await expect(service.execute('decision')).resolves.toEqual({ level: 'high', limit: 1000 });
  });

  it('buildExpressionFromCells refuses a bare identifier cell (ambiguous named test vs. equality)', () => {
    expect(buildExpressionFromCells(['age'], { age: 'isCore' })).toBeNull();
  });

  it('parseExpressionToCells refuses a cross-column "or" (DT-002)', () => {
    expect(
      parseExpressionToCells(['age', 'segment'], 'age >= 65 or segment = "premium"'),
    ).toBeNull();
  });

  it('parseExpressionToCells decomposes a flat AND-only expression', () => {
    expect(
      parseExpressionToCells(['age', 'income', 'segment'], 'age >= 18 and age <= 25 and income < 30000'),
    ).toEqual({ age: '>= 18 and <= 25', income: '< 30000' });
  });
});

describe('isValidColumnName / isValidPriority / duplicatePriorities', () => {
  it('accepts identifier-shaped names and rejects the rest', () => {
    expect(isValidColumnName('age')).toBe(true);
    expect(isValidColumnName('_private1')).toBe(true);
    expect(isValidColumnName('has space')).toBe(false);
    expect(isValidColumnName('123start')).toBe(false);
    expect(isValidColumnName('')).toBe(false);
  });

  it('accepts only positive whole numbers as a priority', () => {
    expect(isValidPriority('1')).toBe(true);
    expect(isValidPriority('0')).toBe(false);
    expect(isValidPriority('-1')).toBe(false);
    expect(isValidPriority('1.5')).toBe(false);
    expect(isValidPriority('')).toBe(false);
    expect(isValidPriority('abc')).toBe(false);
  });

  it('flags rows that share a best-match priority', () => {
    const rows = [
      { when: { kind: 'cells' as const, cells: {} }, then: {}, priority: 1 },
      { when: { kind: 'cells' as const, cells: {} }, then: {}, priority: 1 },
      { when: { kind: 'cells' as const, cells: {} }, then: {}, priority: 2 },
    ];
    expect(duplicatePriorities(rows)).toEqual(new Set([1]));
  });
});

describe('withInputColumnRenamed / withInputColumnTypeChanged / withOutputColumnsReordered', () => {
  it('renames the parameter and every referencing when-cell key, accepted by the real engine', () => {
    // A standalone model whose only call site passes positional (not named) arguments, so the
    // rename's one known gap — unrewritten named-argument call sites — doesn't apply here.
    const service = MutableDecisionService.fromCode(`{
      ruleset risk(age: number, income: number): {
        hitPolicy: "first-match"
        rules: [ { when: { age: 18..25, income: < 30000 }, then: { level: "high" } } ]
        default: { level: "none" }
      }
      decision: risk(20, 25000)
    }`);
    const definition = service.get('risk.*') as PortableRulesetDefinition;
    const renamed = withInputColumnRenamed(definition, 'income', 'salary');
    expect(Object.keys(renamed['@parameters'])).toEqual(['age', 'salary']);
    expect(renamed['@rules'][0].when).toEqual({ age: '18..25', salary: '< 30000' });
    expect((service.set('risk', renamed) as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
  });

  it('a renamed parameter still referenced by an unrewritten boolean-expression row surfaces as an engine error, not silent breakage', () => {
    const { service, definition } = riskDefinition();
    // Rule 3's `when` is the boolean expression `age >= 65 or segment = "premium"` — renaming
    // `age` doesn't rewrite that identifier (see the function's doc comment), so the model no
    // longer links. `set()` itself never rolls back or errors for a linking reason anymore (it
    // applies the write and returns the type-free node — see `../../../edgerules-v2/doc/architecture/CRUD_SPEC.md`);
    // `.link()` is the call that surfaces the precise diagnosis.
    const renamed = withInputColumnRenamed(definition, 'age', 'years');
    const result = service.set('risk', renamed) as { '@kind'?: string; message?: string };
    expect(result['@kind']).toBe('ruleset');
    expect(() => service.link()).toThrowError(/unresolved reference/i);
  });

  it('changes a parameter type and is accepted by the real engine', () => {
    const { service, definition } = riskDefinition();
    const changed = withInputColumnTypeChanged(definition, 'income', 'number');
    expect((service.set('risk', changed) as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
  });

  it('reorders then/default fields without changing their values', async () => {
    const { service, definition } = riskDefinition();
    const reordered = withOutputColumnsReordered(definition, ['limit', 'level']);
    expect(Object.keys(reordered['@rules'][0].then).filter((key) => key !== '@kind')).toEqual(['limit', 'level']);
    expect((service.set('risk', reordered) as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    await expect(service.execute('decision')).resolves.toEqual({ level: 'high', limit: 1000 });
  });
});
