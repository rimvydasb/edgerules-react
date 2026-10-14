import { MutableDecisionService } from '@edgerules/node/mutable';
import type { PortableNode } from '@edgerules/portable';
import { describe, expect, it } from 'vitest';
import { setWithLinkCheck } from '../linkCheck';
import { isPortableError } from '../portable';

const expression = (text: string) => ({ '@kind': 'expression', expression: text }) as unknown as PortableNode;

function build() {
  const service = MutableDecisionService.fromCode('{ a: 1\n b: a + 1 }');
  const portable = () => service.toPortable() as unknown as Record<string, PortableNode>;
  return { service, portable };
}

describe('setWithLinkCheck', () => {
  it('keeps a write that leaves the model linkable', () => {
    const { service, portable } = build();
    const result = setWithLinkCheck(service, 'b', expression('a + 10'), portable().b);
    expect(isPortableError(result)).toBe(false);
    expect(portable().b).toEqual(expression('a + 10'));
  });

  it('reverts a write that leaves the model unlinkable and returns the link error', () => {
    const { service, portable } = build();
    const before = portable().b;
    const result = setWithLinkCheck(service, 'b', expression('missing + 1'), before);
    expect(isPortableError(result)).toBe(true);
    expect(portable().b).toEqual(before);
  });

  it('removes a new field when its write fails to link and no previous node exists', () => {
    const { service, portable } = build();
    const result = setWithLinkCheck(service, 'c', expression('missing + 1'), undefined);
    expect(isPortableError(result)).toBe(true);
    expect(Object.keys(portable())).not.toContain('c');
  });

  it('keeps an unrelated write when the model already had the same link error', () => {
    const { service, portable } = build();
    service.set('c', expression('missing + 1'));
    const result = setWithLinkCheck(service, 'a', 2 as unknown as PortableNode, portable().a);
    expect(isPortableError(result)).toBe(false);
    expect(portable().a).toBe(2);
  });
});
