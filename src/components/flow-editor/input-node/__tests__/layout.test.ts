import {describe, expect, it} from 'vitest';
import {computeInputNodeLayout, recordSummary} from '../layout';
import type {InputNodeModel} from '../types';

const applicant: InputNodeModel = {
    field: 'applicant',
    fields: [
        {name: 'age', type: 'number', used: true},
        {name: 'income', type: 'number', used: false},
    ],
};

describe('InputNode layout', () => {
    it('summarizes the record shape', () => {
        expect(recordSummary(applicant)).toBe('{ age, income }');
        expect(recordSummary({field: 'empty', fields: []})).toBe('{  }');
    });

    it('has only the output track', () => {
        const layout = computeInputNodeLayout(applicant);
        expect(layout.inputTrack).toBe(0);
        expect(layout.width).toBe(layout.outputTrack);
        expect(layout.outputTrack % 40).toBe(0);
    });
});
