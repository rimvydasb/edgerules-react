import { describe, expect, it } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import type { PortableNode, PortableRulesetDefinition, PortableRulesetSchema } from '@edgerules/portable';
import {
  buildTableModel,
  emptyRow,
  formatCellValue,
  prettyUnaryTest,
  rowToRule,
  whenCellEmbedContext,
  withHitPolicy,
  withInputColumnAdded,
  withInputColumnRemoved,
  withOutputColumnAdded,
  withOutputColumnRenamed,
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
      formatCellValue({ '@kind': 'context', name: "'gold'", apr: { '@kind': 'expression', expression: '12.5' } }),
    ).toBe("{ name: 'gold', apr: 12.5 }");
  });
});

describe('buildTableModel (against the real engine echo)', () => {
  it('derives input columns from parameters and output columns from the then shape', () => {
    const { definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    expect(model.inputs.map((column) => `${column.name}:${column.typeLabel}`)).toEqual([
      'age:number',
      'income:number',
      'segment:string',
    ]);
    expect(model.outputs.map((column) => `${column.name}:${column.typeLabel}`)).toEqual([
      'level:string',
      'limit:number',
    ]);
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
    const definition = service.get('scoreFactors.*') as PortableRulesetDefinition;
    const schema = service.get('scoreFactors') as unknown as PortableRulesetSchema;
    const model = buildTableModel(definition, schema);
    expect(model.scorecard).toBe(true);
    expect(model.outputs).toHaveLength(1);
    expect(model.rows.map((row) => row.then[''])).toEqual(['5', '10', '20']);
  });
});

describe('rowToRule round-trips through the real engine', () => {
  it('writes edited when/then texts back as an accepted rule', () => {
    const { service, definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    const row = model.rows[0];
    if (row.when.kind === 'cells') {
      row.when.cells.age = '21..30';
    }
    row.then.limit = '1500';
    const result = service.set('risk.rules[0]', rowToRule(row, false) as unknown as PortableNode);
    expect((result as { '@kind'?: string })['@kind']).toBe('rule');
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1500 });
  });

  it('produces an appendable empty row that links against typed outputs', () => {
    const { service, definition, schema } = riskDefinition();
    const model = buildTableModel(definition, schema);
    const rule = rowToRule(emptyRow(model), model.scorecard);
    const result = service.set('risk.rules[3]', rule as unknown as PortableNode);
    expect((result as { '@kind'?: string })['@kind']).toBe('rule');
  });

  it('writes scorecard scores as numbers', () => {
    const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
    const definition = service.get('scoreFactors.*') as PortableRulesetDefinition;
    const model = buildTableModel(definition, service.get('scoreFactors') as unknown as PortableRulesetSchema);
    const row = model.rows[1];
    row.then[''] = '12';
    const result = service.set('scoreFactors.rules[1]', rowToRule(row, true) as unknown as PortableNode);
    expect((result as { then?: unknown }).then).toBe(12);
    expect(service.execute('total')).toBe(32);
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
    const result = service.set('risk', withHitPolicy(definition, 'collect-matches'));
    expect((result as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    expect((service.get('risk.*') as PortableRulesetDefinition)['@default']).toBeUndefined();
  });

  it('withOutputColumnAdded/Renamed keep every row and the default in shape', () => {
    const { service, definition } = riskDefinition();
    const added = withOutputColumnAdded(definition, 'reason', "'n/a'");
    expect((service.set('risk', added) as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    const renamed = withOutputColumnRenamed(service.get('risk.*') as PortableRulesetDefinition, 'reason', 'note');
    expect((service.set('risk', renamed) as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1000, note: 'n/a' });
  });

  it('withInputColumnAdded defaults the new parameter so existing call sites keep working', () => {
    const { service, definition } = riskDefinition();
    const added = withInputColumnAdded(definition, 'channel', 'string');
    const result = service.set('risk', added);
    expect((result as { '@kind'?: string })['@kind']).toBe('ruleset-schema');
    // The `decision` call site only ever passed age/income/segment; it must still link and run.
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1000 });
    const next = service.get('risk.*') as PortableRulesetDefinition;
    expect(next['@parameters'].channel).toEqual({ '@kind': 'type', type: 'string', default: '' });
  });

  it('withInputColumnRemoved drops the parameter and its cells', () => {
    const { service, definition } = riskDefinition();
    // `segment` is referenced by rule 3's boolean expression, so remove that rule first.
    const rules = definition['@rules'].slice(0, 2);
    const pruned = withInputColumnRemoved({ ...definition, '@rules': rules }, 'segment');
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
    expect(MutableDecisionService.diagnostics(`${embed.prefix}18..25${embed.suffix}`)).toHaveLength(0);
    const bad = MutableDecisionService.diagnostics(`${embed.prefix}"oops"${embed.suffix}`);
    expect(bad.length).toBeGreaterThan(0);
  });
});
