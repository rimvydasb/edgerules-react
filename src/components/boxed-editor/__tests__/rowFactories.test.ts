import {describe, expect, it} from 'vitest';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {isPortableError} from '../../../lib/portable';
import type {BoxedTableRowData} from '../boxed-editor-types';
import {
    addRelationColumn,
    appendRelationItem,
    nextComplexTypeRow,
    nextRelationRow,
} from '../commands/rowFactories';
import {createBoxedEditorService} from '../service/createBoxedEditorService';

describe('row factories', () => {
    it('creates an empty complex type that commits and links through the real engine', () => {
        const mutable = MutableDecisionService.fromCode('{}');
        const service = createBoxedEditorService(mutable);
        const row = nextComplexTypeRow({path: '*'}, new Set());

        expect(isPortableError(service.setBoxedRowData(row.path, row))).toBe(false);
        expect(service.link()).toBeUndefined();
        expect(mutable.toPortable()).toMatchObject({
            Type: {'@kind': 'type-definition'},
        });
    });

    it('seeds appended relation cells from type-compatible previous literals', () => {
        const row: BoxedTableRowData = {
            kind: 'relation',
            depth: 0,
            path: 'records',
            name: 'records',
            columns: ['number', 'boolean', 'string', 'date', 'materializedDate'],
            children: [
                {
                    kind: 'relation-item',
                    depth: 1,
                    path: 'records[0]',
                    name: 'Item 1',
                    columns: ['number', 'boolean', 'string', 'date', 'materializedDate'],
                    cells: ['7', 'true', '"text"', '@"2026-07-29"', '"2026-07-30"'],
                } as BoxedTableRowData,
            ],
        };

        const appended = appendRelationItem(row);

        expect((appended.children?.[1] as BoxedTableRowData).cells).toEqual([
            '0',
            'false',
            '""',
            '@"2026-07-29"',
            '@"2026-07-30"',
        ]);
    });

    it('clones and rebases a previous drill-down cell when appending a relation record', () => {
        const row: BoxedTableRowData = {
            kind: 'relation',
            depth: 0,
            path: 'records',
            name: 'records',
            columns: ['address', 'value'],
            children: [{
                kind: 'relation-item',
                depth: 1,
                path: 'records[0]',
                name: 'Item 1',
                columns: ['address', 'value'],
                cells: ['', '7'],
                children: [{
                    kind: 'context',
                    depth: 2,
                    path: 'records[0].address',
                    name: 'address',
                    children: [{
                        kind: 'field',
                        depth: 3,
                        path: 'records[0].address.city',
                        name: 'city',
                        value: '"Vilnius"',
                    }],
                }],
            } as BoxedTableRowData],
        };

        const appended = appendRelationItem(row);
        const item = appended.children?.[1] as BoxedTableRowData;
        expect(item.cells).toEqual(['', '0']);
        expect(item.children?.[0]).toMatchObject({
            path: 'records[1].address',
            children: [{path: 'records[1].address.city', value: '"Vilnius"'}],
        });
    });

    it('preserves a date default after a real engine round-trip', () => {
        const mutable = MutableDecisionService.fromCode('{}');
        const service = createBoxedEditorService(mutable);
        const created = nextRelationRow({path: '*'}, new Set());
        expect(isPortableError(service.setBoxedRowData(created.path, created))).toBe(false);
        expect(isPortableError(service.setBoxedRowData('relation', addRelationColumn(created, 'column')))).toBe(
            false,
        );
        const relation = service.getBoxedRowData('relation') as BoxedTableRowData;
        const children = service.getBoxedRowsData('relation');
        const first = children[0] as BoxedTableRowData;
        const result = service.setBoxedRowData('relation', {
            ...relation,
            children: [{...first, cells: ['@"2026-07-29"']} as BoxedTableRowData],
        });
        expect(isPortableError(result), JSON.stringify(result)).toBe(false);

        const refreshed = {
            ...(service.getBoxedRowData('relation') as BoxedTableRowData),
            children: service.getBoxedRowsData('relation'),
        };
        expect((refreshed.children?.[0] as BoxedTableRowData).cells).toEqual(['@"2026-07-29"']);
        const appended = appendRelationItem(refreshed);
        expect((appended.children?.[1] as BoxedTableRowData).cells).toEqual(['@"2026-07-29"']);
        expect(isPortableError(service.setBoxedRowData('relation', appended))).toBe(false);
    });
});
