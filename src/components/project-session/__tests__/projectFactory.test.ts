import {describe, expect, it} from 'vitest';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {createProjectFactory} from '../factory/createProjectFactory';
import {LOAN_MODEL, nodeEngine} from '../testing/sessionFixture';

const factory = createProjectFactory({engine: nodeEngine});

describe('ProjectFactory.createBundle', () => {
    it('builds a bundle from DSL, kept as written, with empty slices', () => {
        const bundle = factory.createBundle({
            name: 'Loans',
            description: 'Credit',
            tags: ['credit'],
            model: {dsl: LOAN_MODEL},
        });
        expect(bundle).toEqual({
            manifest: {
                kind: 'EdgeRulesProject',
                formatVersion: 1,
                projectId: expect.stringMatching(/^[0-9a-f-]{36}$/),
                name: 'Loans',
                description: 'Credit',
                tags: ['credit'],
                model: {format: 'dsl', source: 'model/main.edge'},
            },
            model: LOAN_MODEL,
            documentation: {schemaVersion: 1, byPath: {}},
            tests: {schemaVersion: 1, subjects: {}},
            flow: {schemaVersion: 1, layout: {positions: {}, outputs: []}},
        });
    });

    it('gives every bundle its own projectId', () => {
        const a = factory.createBundle({name: 'Same', model: {dsl: '{ a: 1 }'}});
        const b = factory.createBundle({name: 'Same', model: {dsl: '{ a: 1 }'}});
        expect(a.manifest.projectId).not.toBe(b.manifest.projectId);
    });

    it('converts a Portable model to canonical DSL that round-trips', () => {
        const portable = MutableDecisionService.fromCode(LOAN_MODEL).toPortable();
        const bundle = factory.createBundle({name: 'Loans', model: {portable}});
        expect(bundle.model).toBe(MutableDecisionService.fromCode(LOAN_MODEL).getCode('*'));
        expect(MutableDecisionService.fromCode(bundle.model).toPortable()).toEqual(portable);
    });

    it('carries the optional slices', () => {
        const bundle = factory.createBundle({
            name: 'Loans',
            model: {dsl: LOAN_MODEL},
            documentation: {schemaVersion: 1, byPath: {decision: 'Final'}},
            tests: {schemaVersion: 1, subjects: {'*': {cases: [], rows: []}}},
            flow: {schemaVersion: 1, layout: {positions: {decision: {x: 0, y: 0}}, outputs: []}},
        });
        expect(bundle.documentation.byPath).toEqual({decision: 'Final'});
        expect(bundle.tests.subjects).toEqual({'*': {cases: [], rows: []}});
        expect(bundle.flow.layout.positions).toEqual({decision: {x: 0, y: 0}});
    });

    it('rejects a model that does not parse or link', () => {
        expect(() => factory.createBundle({name: 'Bad', model: {dsl: '{ a: b + }'}})).toThrow(
            expect.objectContaining({code: 'invalid-model'}),
        );
        expect(() => factory.createBundle({name: 'Bad', model: {dsl: '{ a: missing }'}})).toThrow(
            expect.objectContaining({code: 'invalid-model', message: expect.stringContaining("'missing'")}),
        );
    });

    it('rejects a malformed slice or an empty name', () => {
        expect(() =>
            factory.createBundle({
                name: 'Loans',
                model: {dsl: LOAN_MODEL},
                documentation: {schemaVersion: 1, byPath: {decision: 1 as never}},
            }),
        ).toThrow(expect.objectContaining({code: 'invalid-bundle'}));
        expect(() => factory.createBundle({name: '', model: {dsl: LOAN_MODEL}})).toThrow(
            expect.objectContaining({code: 'invalid-bundle'}),
        );
    });
});
