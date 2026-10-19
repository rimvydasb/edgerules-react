import {MutableDecisionService} from '@edgerules/node/mutable';
import {describe, expect, it} from 'vitest';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {SAMPLE_MODEL} from '../../testing/sampleModel';
import {filterItems, paletteItems} from '../paletteItems';

function items() {
    const service = createFlowEditorService(MutableDecisionService.fromCode(SAMPLE_MODEL));
    return {service, items: paletteItems(service)};
}

describe('paletteItems', () => {
    it('offers a generic item per node type, then the records and callees of the model', () => {
        const ids = items().items.map((item) => item.id);
        expect(ids.slice(0, 3)).toEqual(['new-input', 'input:applicant', 'input:application']);
        expect(ids).toContain('function');
        expect(ids.filter((id) => id.startsWith('callee:')).sort()).toEqual([
            'callee:applicantDecision',
            'callee:creditScore',
            'callee:monthly',
            'callee:risk',
        ]);
        expect(ids.slice(-2)).toEqual(['output', 'chart']);
    });

    it('describes a callee by its signature and kind', () => {
        const risk = items().items.find((item) => item.id === 'callee:risk');
        expect(risk).toMatchObject({
            icon: 'ruleset',
            label: 'Add ruleset risk',
            detail: '(age, income, segment) → { level, limit }',
            action: {kind: 'function', callee: 'risk'},
        });
    });

    it('drops a record once it is an input node', () => {
        const {service} = items();
        service.addInputNode('applicant');
        expect(paletteItems(service).map((item) => item.id)).not.toContain('input:applicant');
    });
});

describe('filterItems', () => {
    it('matches every word against title, detail and group, ignoring case', () => {
        const all = items().items;
        expect(filterItems(all, 'CREDIT').map((item) => item.id)).toEqual(['callee:creditScore']);
        expect(filterItems(all, 'outputs').map((item) => item.id)).toEqual(['output']);
        expect(filterItems(all, 'charts').map((item) => item.id)).toEqual(['chart']);
        expect(filterItems(all, 'segment level').map((item) => item.id)).toEqual(['callee:risk']);
        expect(filterItems(all, '  ')).toBe(all);
    });
});
