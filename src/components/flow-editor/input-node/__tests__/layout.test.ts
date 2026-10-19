import {describe, expect, it} from 'vitest';
import {computeInputNodeLayout, recordSummary} from '../layout';
import type {InputNodeModel} from '../types';

const applicant: InputNodeModel = {
    field: 'applicant',
    fields: [
        {name: 'age', type: 'number', value: '23', used: true},
        {name: 'income', type: 'number', value: '25000', used: false},
    ],
};

describe('InputNode layout', () => {
    it('summarizes the record shape', () => {
        expect(recordSummary(applicant)).toBe('{ age, income }');
        expect(recordSummary({field: 'empty', fields: []})).toBe('{  }');
    });

    it('has a field track and a value track in whole steps', () => {
        const layout = computeInputNodeLayout(applicant);
        expect(layout.inputTrack).toBeGreaterThan(0);
        expect(layout.outputTrack).toBeGreaterThan(0);
        expect(layout.width).toBe(layout.inputTrack + layout.outputTrack);
        expect(layout.inputTrack % 40).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
    });

    it('widens the value track for a long value', () => {
        const short = computeInputNodeLayout(applicant);
        const long = computeInputNodeLayout({
            ...applicant,
            fields: [{name: 'age', type: 'number', value: 'applicant.income / 1000 + 42', used: false}],
        });
        expect(long.outputTrack).toBeGreaterThan(short.outputTrack);
    });
});
