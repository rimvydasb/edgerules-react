import {describe, expect, it} from 'vitest';
import {computeListInputNodeWidth, listSummary} from '../layout';
import type {ListInputNodeModel} from '../types';

const people: ListInputNodeModel = {
    field: 'people',
    type: 'object[]',
    itemFields: [
        {name: 'id', type: 'string'},
        {name: 'age', type: 'number'},
    ],
};

describe('ListInputNode layout', () => {
    it('summarizes the list type and, once read, the number of items', () => {
        expect(listSummary(people)).toBe('object[]');
        expect(listSummary(people, 1)).toBe('object[] · 1 item');
        expect(listSummary(people, 100)).toBe('object[] · 100 items');
    });

    it('has a least width in whole steps that fits the header', () => {
        const width = computeListInputNodeWidth(people);
        expect(width % 40).toBe(0);
        expect(computeListInputNodeWidth({...people, label: 'A much longer name of the list input'})).toBeGreaterThan(
            width,
        );
    });
});
