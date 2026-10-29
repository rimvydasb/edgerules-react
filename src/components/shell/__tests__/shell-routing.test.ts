import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import type {ProjectExplorerOpenTarget} from '../../project-explorer';
import {explorerRoute} from '../shell-routing';
import type {ShellView} from '../shell-types';

const model = MutableDecisionService.fromCode(
    `{
    type Customer: { name: <string> }
    func riskScore(income: number): { score: income / 100 }
    limit: 1000
    applicant: { age: 21 }
    @Workbook
    book: {
        @FunctionNode
        score: riskScore(applicant.age)
    }
}`,
).toPortable();

describe('explorerRoute', () => {
    it.each<[ShellView, ProjectExplorerOpenTarget, ReturnType<typeof explorerRoute>]>([
        // The active view stays when it can show the entry.
        ['code', {kind: 'type', path: 'Customer'}, {path: 'Customer', view: 'code'}],
        ['flow', {kind: 'context', path: 'applicant'}, {path: 'applicant', view: 'flow'}],
        // A workbook and its nodes always open in the Flow view; a node is centered on the canvas of its workbook.
        ['boxed', {kind: 'workbook', path: 'book'}, {path: 'book', view: 'flow'}],
        ['code', {kind: 'workbook', path: '*'}, {path: '*', view: 'flow'}],
        ['tests', {kind: 'workbook', path: 'book'}, {path: 'book', view: 'flow'}],
        ['boxed', {kind: 'function-node', path: 'book.score'}, {path: 'book', view: 'flow', focus: 'book.score'}],
        ['flow', {kind: 'function-node', path: 'book.score'}, {path: 'book', view: 'flow', focus: 'book.score'}],
        ['code', {kind: 'input-node', path: 'applicant'}, {path: '*', view: 'flow', focus: 'applicant'}],
        // An entry without Flow, from the Flow view.
        ['flow', {kind: 'function', path: 'riskScore'}, {path: 'riskScore', view: 'boxed'}],
        ['flow', {kind: 'type', path: 'Customer'}, {path: 'Customer', view: 'boxed'}],
        ['flow', {kind: 'variable', path: 'limit'}, {path: 'limit', view: 'boxed'}],
        // From the Tests view: the Boxed view.
        ['tests', {kind: 'function', path: 'riskScore'}, {path: 'riskScore', view: 'boxed'}],
        // A test always opens in the Tests view.
        ['code', {kind: 'test', path: '*'}, {path: '*', view: 'tests'}],
    ])('from %s, %o opens %o', (view, target, route) => {
        expect(explorerRoute(target, view, model)).toEqual(route);
    });
});
