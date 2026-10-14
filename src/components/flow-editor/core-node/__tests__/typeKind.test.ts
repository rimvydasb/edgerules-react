import {describe, expect, it} from 'vitest';
import {isListType, typeKind} from '../typeKind';

describe('typeKind', () => {
    it.each([
        ['number', 'number'],
        ['string', 'string'],
        ['boolean', 'boolean'],
        ['date', 'date'],
        ['duration', 'date'],
        ['Applicant', 'record'],
        ['any', 'any'],
        ['', 'any'],
        ['number[]', 'number'],
        ['Applicant[]', 'record'],
    ])('maps %s to the %s color family', (type, kind) => {
        expect(typeKind(type)).toBe(kind);
    });

    it('detects a list type', () => {
        expect(isListType('string[]')).toBe(true);
        expect(isListType('string')).toBe(false);
    });
});
