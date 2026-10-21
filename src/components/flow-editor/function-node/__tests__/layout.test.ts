import {describe, expect, it} from 'vitest';
import {computeFunctionNodeLayout} from '../layout';
import type {FunctionNodeModel} from '../types';

const risk: FunctionNodeModel = {
    field: 'decision',
    callee: {path: 'risk', kind: 'ruleset', parameters: [], returnLabel: '{ level, limit }'},
    arguments: [
        {name: 'age', type: 'number', used: true},
        {name: 'income', type: 'number', used: true},
    ],
    results: [
        {name: 'level', type: 'string', renamable: true},
        {name: 'limit', type: 'number', renamable: true},
    ],
    draft: false,
    callers: 1,
};

describe('computeFunctionNodeLayout', () => {
    it('has an argument track and a result track in whole 40px steps', () => {
        const layout = computeFunctionNodeLayout(risk);
        expect(layout.inputTrack).toBeGreaterThan(0);
        expect(layout.inputTrack % 40).toBe(0);
        expect(layout.outputTrack % 40).toBe(0);
        expect(layout.width).toBe(layout.inputTrack + layout.outputTrack);
    });

    it('keeps a node without a callee between 280px and 480px', () => {
        const empty = computeFunctionNodeLayout({...risk, callee: undefined, arguments: [], results: []});
        expect(empty.width).toBeGreaterThanOrEqual(280);
        expect(empty.width).toBeLessThanOrEqual(480);
    });

    it('makes room for the draft badge', () => {
        const long = {...risk, label: 'A rather long node name that sets the width'};
        expect(computeFunctionNodeLayout({...long, draft: true}).width).toBeGreaterThan(
            computeFunctionNodeLayout(long).width,
        );
    });
});
