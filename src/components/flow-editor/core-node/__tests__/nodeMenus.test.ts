import {describe, expect, it, vi} from 'vitest';
import {coreNodeMenuItems, rowMenuItems, startGroup} from '../nodeMenus';
import type {CoreNodeMenuContext, RowMenuContext} from '../types';

function context(overrides: Partial<CoreNodeMenuContext> = {}): CoreNodeMenuContext {
    return {
        hasDescription: false,
        canDescribe: true,
        readOnly: false,
        onRenameNode: vi.fn(),
        onRenameField: vi.fn(),
        onDuplicate: vi.fn(),
        onAddDescription: vi.fn(),
        onRemoveDescription: vi.fn(),
        onRemoveFromFlow: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    };
}

const ids = (items: {id: string}[]) => items.map((item) => item.id);
const extra = (id: string) => ({id, label: id, onSelect: vi.fn()});

describe('coreNodeMenuItems', () => {
    it('builds the "This node" and "Remove" groups', () => {
        const items = coreNodeMenuItems(context());
        expect(ids(items)).toEqual([
            'rename-node',
            'rename-field',
            'duplicate',
            'add-description',
            'remove-from-flow',
            'delete',
        ]);
        expect(items.filter((item) => item.group !== undefined).map((item) => item.group)).toEqual([
            'This node',
            'Remove',
        ]);
    });

    it('offers Remove description when the node has one, and nothing without a documentation service', () => {
        expect(ids(coreNodeMenuItems(context({hasDescription: true})))).toContain('remove-description');
        const items = ids(coreNodeMenuItems(context({canDescribe: false})));
        expect(items).not.toContain('add-description');
        expect(items).not.toContain('remove-description');
    });

    it('puts node-kind items after Rename field and a labelled group before Remove', () => {
        const items = coreNodeMenuItems(context(), {
            afterRename: [extra('change-callee')],
            middle: [extra('open-editor'), extra('view-code')],
            middleGroup: 'Record',
        });
        expect(ids(items)).toEqual([
            'rename-node',
            'rename-field',
            'change-callee',
            'duplicate',
            'add-description',
            'open-editor',
            'view-code',
            'remove-from-flow',
            'delete',
        ]);
        expect(items.find((item) => item.id === 'open-editor')?.group).toBe('Record');
    });

    it('keeps only the middle group in read-only mode', () => {
        const items = coreNodeMenuItems(context({readOnly: true}), {middle: [extra('view-code')], middleGroup: 'X'});
        expect(ids(items)).toEqual(['view-code']);
    });
});

describe('rowMenuItems', () => {
    const row = (overrides: Partial<RowMenuContext> = {}): RowMenuContext => ({
        noun: 'field',
        index: 1,
        count: 3,
        used: false,
        onMove: vi.fn(),
        onAddBelow: vi.fn(),
        onDelete: vi.fn(),
        ...overrides,
    });

    it('names the items after the row noun', () => {
        const items = rowMenuItems(row({noun: 'argument'}));
        expect(ids(items)).toEqual(['move-up', 'move-down', 'add-below', 'delete-argument']);
        expect(items.map((item) => item.label)).toEqual([
            'Move up',
            'Move down',
            'Add argument below',
            'Delete argument',
        ]);
    });

    it('disables Move up on the first row and Move down on the last row', () => {
        expect(rowMenuItems(row({index: 0}))[0].disabled).toBe(true);
        expect(rowMenuItems(row({index: 2}))[1].disabled).toBe(true);
        const middle = rowMenuItems(row());
        expect([middle[0].disabled, middle[1].disabled]).toEqual([false, false]);
    });

    it('disables Delete of a used row and explains why', () => {
        const remove = rowMenuItems(row({used: true, usedReason: 'Read as applicant.age'}))[3];
        expect(remove).toMatchObject({disabled: true, reason: 'Read as applicant.age', danger: true});
        expect(rowMenuItems(row({usedReason: 'unused'}))[3].reason).toBeUndefined();
    });

    it('passes the direction to onMove', () => {
        const onMove = vi.fn();
        const [up, down] = rowMenuItems(row({onMove}));
        up.onSelect();
        down.onSelect();
        expect(onMove.mock.calls).toEqual([['up'], ['down']]);
    });
});

describe('startGroup', () => {
    it('labels only the first item and keeps an empty list empty', () => {
        expect(startGroup([extra('a'), extra('b')], 'G').map((item) => item.group)).toEqual(['G', undefined]);
        expect(startGroup([], 'G')).toEqual([]);
    });
});
