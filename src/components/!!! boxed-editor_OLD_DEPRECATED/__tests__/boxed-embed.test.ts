import { describe, expect, it } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { expressionEmbedContext } from '../boxed-embed';

const MODEL = `{
  application: { amount: <number>; result: amount * 2 }
  func monthly(amount: number) -> number: amount / 12
  payment: monthly(application.amount)
}`;

describe('expressionEmbedContext', () => {
  it('surrounds a cell with valid portable-derived DSL', () => {
    const service = MutableDecisionService.fromCode(MODEL);
    const embed = expressionEmbedContext(service.toPortable(), 'application.result');
    expect(MutableDecisionService.diagnostics(`${embed.prefix}application.amount * 3${embed.suffix}`)).toEqual([]);
  });
});
