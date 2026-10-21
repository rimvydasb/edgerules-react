import {
    IconAdjustments,
    IconArrowsMaximize,
    IconArrowsMinimize,
    IconArrowsUpDown,
    IconBraces,
    IconCode,
    IconColumns,
    IconCopy,
    IconListCheck,
    IconListDetails,
    IconMathFunction,
    IconPencil,
    IconPlaylistAdd,
    IconPlus,
    IconSettings,
    IconTable,
    IconTrash,
    type Icon,
} from '@tabler/icons-react';

// Single source of truth for every action id the three-dot menu can dispatch and the icon it
// renders with — ported 1:1 from the wireframe's `boxed/actions.ts` (`docs/boxed-editor/
// phase-05-context-menus-and-actions.md` §3), plus the few ids the wireframe left iconless
// (`convert-to-*`) or didn't need (`view-as-code`, `toggle-expand`, both variable per row state).
export const rowActionRegistry = [
    {id: 'duplicate', icon: IconCopy},
    {id: 'delete', icon: IconTrash},
    {id: 'convert-to-field', icon: undefined},
    {id: 'convert-to-context', icon: undefined},
    {id: 'convert-to-relation', icon: undefined},
    {id: 'convert-to-list', icon: undefined},
    {id: 'add-field', icon: IconPlus},
    {id: 'add-complex-type', icon: IconBraces},
    {id: 'add-argument', icon: IconPlus},
    {id: 'add-variable', icon: IconPlus},
    {id: 'add-constraint', icon: IconPlus},
    {id: 'add-setting', icon: IconSettings},
    {id: 'add-rule', icon: IconPlaylistAdd},
    {id: 'add-condition-column', icon: IconColumns},
    {id: 'add-action-column', icon: IconColumns},
    {id: 'add-column', icon: IconColumns},
    {id: 'delete-column', icon: IconTrash},
    {id: 'delete-argument', icon: IconTrash},
    {id: 'rename-argument', icon: IconPencil},
    {id: 'rename-column', icon: IconPencil},
    {id: 'add-function', icon: IconMathFunction},
    {id: 'add-relation', icon: IconTable},
    {id: 'add-ruleset', icon: IconListCheck},
    {id: 'add-list', icon: IconListDetails},
    {id: 'add-optimisation', icon: IconAdjustments},
    {id: 'switch-objective-direction', icon: IconArrowsUpDown},
    {id: 'switch-rule-form', icon: IconArrowsUpDown},
    {id: 'model-settings', icon: IconSettings},
    {id: 'view-as-code', icon: IconCode},
    {id: 'expand', icon: IconArrowsMaximize},
    {id: 'collapse', icon: IconArrowsMinimize},
] as const satisfies {id: string; icon?: Icon}[];

export type RowActionId = (typeof rowActionRegistry)[number]['id'];

// Derived once from the registry above — the only place an id-to-icon lookup exists.
export const rowActionIcons: Partial<Record<RowActionId, Icon>> = Object.fromEntries(
    rowActionRegistry.flatMap(({id, icon}) => (icon ? [[id, icon]] : [])),
);
