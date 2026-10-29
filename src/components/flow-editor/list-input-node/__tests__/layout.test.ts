import {describe, expect, it} from 'vitest';
import {computeListInputNodeLayout, listSummary} from '../layout';
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

    it('has a field track and a type track in whole steps', () => {
        const layout = computeListInputNodeLayout(people);
        expect(layout.inputTrack % 40).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
        expect(layout.width).toBe(layout.inputTrack + layout.outputTrack);
    });

    it('widens the field track for a long field name', () => {
        const short = computeListInputNodeLayout(people);
        const long = computeListInputNodeLayout({...people, itemFields: [{name: 'daysSinceContact', type: 'number'}]});
        expect(long.inputTrack).toBeGreaterThan(short.inputTrack);
    });
});
