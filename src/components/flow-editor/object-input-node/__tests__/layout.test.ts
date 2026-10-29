import {describe, expect, it} from 'vitest';
import {computeObjectInputNodeLayout, FIELD_LIMIT, isReducedObjectInput, recordSummary, shownFields} from '../layout';
import type {ObjectInputNodeModel} from '../types';

const applicant: ObjectInputNodeModel = {
    field: 'applicant',
    fields: [
        {name: 'age', type: 'number', value: '23', used: true},
        {name: 'income', type: 'number', value: '25000', used: false},
    ],
};

const record = (count: number): ObjectInputNodeModel => ({
    field: 'big',
    fields: Array.from({length: count}, (_, index) => ({
        name: `f${index + 1}`,
        type: 'number',
        value: String(index),
        used: false,
    })),
});

describe('ObjectInputNode layout', () => {
    it('summarizes the record shape', () => {
        expect(recordSummary(applicant)).toBe('{ age, income }');
        expect(recordSummary({field: 'empty', fields: []})).toBe('{  }');
    });

    it('names at most 5 fields in the summary, then …', () => {
        expect(recordSummary(record(7))).toBe('{ f1, f2, f3, f4, f5, … }');
    });

    it('shows at most FIELD_LIMIT fields', () => {
        expect(FIELD_LIMIT).toBe(128);
        expect(shownFields(record(128))).toHaveLength(128);
        expect(
            shownFields(record(130))
                .map((item) => item.name)
                .at(-1),
        ).toBe('f128');
    });

    it('is reduced with more than FIELD_LIMIT fields or a value cut off', () => {
        expect(isReducedObjectInput(applicant)).toBe(false);
        expect(isReducedObjectInput(record(128))).toBe(false);
        expect(isReducedObjectInput(record(129))).toBe(true);
        const long = 'applicant.income / 1000 + applicant.age * 42 + 1000000';
        expect(
            isReducedObjectInput({...applicant, fields: [{name: 'x', type: 'number', value: long, used: false}]}),
        ).toBe(true);
    });

    it('has a field track and a value track in whole steps', () => {
        const layout = computeObjectInputNodeLayout(applicant);
        expect(layout.inputTrack).toBeGreaterThan(0);
        expect(layout.outputTrack).toBeGreaterThan(0);
        expect(layout.width).toBe(layout.inputTrack + layout.outputTrack);
        expect(layout.inputTrack % 40).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
    });

    it('widens the value track for a long value', () => {
        const short = computeObjectInputNodeLayout(applicant);
        const long = computeObjectInputNodeLayout({
            ...applicant,
            fields: [{name: 'age', type: 'number', value: 'applicant.income / 1000 + 42', used: false}],
        });
        expect(long.outputTrack).toBeGreaterThan(short.outputTrack);
    });
});
