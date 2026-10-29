import {describe, expect, it} from 'vitest';
import {computeValueInputNodeLayout, isReducedValueInput} from '../layout';
import type {ValueInputNodeModel} from '../types';

const age: ValueInputNodeModel = {field: 'age', type: 'number', value: '23'};

describe('ValueInputNode layout', () => {
    it('has only a value track, in whole steps', () => {
        const layout = computeValueInputNodeLayout(age);
        expect(layout.inputTrack).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
        expect(layout.width).toBe(layout.outputTrack);
    });

    it('widens the value track for a long node name', () => {
        const long = computeValueInputNodeLayout({...age, label: 'The age of the applicant in years'});
        expect(long.outputTrack).toBeGreaterThan(computeValueInputNodeLayout(age).outputTrack);
    });

    it('is reduced only when the value is cut off', () => {
        expect(isReducedValueInput(age)).toBe(false);
        expect(isReducedValueInput({...age, value: `'${'a very long text value '.repeat(4)}'`})).toBe(true);
    });
});
