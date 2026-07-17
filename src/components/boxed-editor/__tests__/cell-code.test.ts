import { describe, expect, it } from 'vitest';
import { cellCode } from '../cell-code';
import { renderNode } from '../boxed-model';

describe('Portable to Cell Code mapping', () => {
  it('maps positional and named invocations to complete DSL calls', () => {
    expect(
      cellCode({
        '@kind': 'invocation',
        '@method': 'myFunc',
        '@arguments': ['a', 'b + 1'],
      }),
    ).toBe('myFunc(a, b + 1)');

    expect(
      cellCode({
        '@kind': 'invocation',
        '@method': 'myFunc',
        '@arguments': { value: 'a' },
      }),
    ).toBe('myFunc(value: a)');
  });

  it('normalizes an invocation to one non-expandable expression cell', () => {
    const rendered = renderNode(
      {
        '@kind': 'invocation',
        '@method': 'myFunc',
        '@arguments': ['a'],
      },
      'result',
    );

    expect(rendered.kind).toBe('expression');
    expect(rendered.children).toBeUndefined();
    expect(cellCode(rendered.authored)).toBe('myFunc(a)');
  });
});
