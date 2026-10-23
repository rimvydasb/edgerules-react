import type {ReactNode} from 'react';
import type {BoxedEditorTargetKind} from '../../boxed-editor';
import type {DocumentationService} from '../../documentation-service';
import type {RowMenuItem} from '#ui/RowActionsMenu';

/** Host routing target; reuses the Boxed Editor kinds and adds 'tests'. */
export interface FlowEditorOpenTarget {
    path: string; // callee path ('risk') or node field path ('decision')
    kind: BoxedEditorTargetKind | 'tests';
}

/** ReactFlow data shared by every node kind; the node id is the field path. */
// A type alias, not an interface: xyflow requires node data to be assignable to Record<string, unknown>.
export type CoreNodeData = {
    field: string; // model field path of the node, for example 'decision'
};

/** Color family of a type; a list takes the family of its element type. */
export type TypeKind = 'number' | 'string' | 'boolean' | 'date' | 'record' | 'any';

export type PinSide = 'in' | 'out';

export type MoveDirection = 'up' | 'down';

/** The header edits every node has. A node adds its row edits to this union. */
export type CoreEditing = {kind: 'node-name'} | {kind: 'field'} | {kind: 'description'};

/** An inline rename of one row of a track, for example an argument or a record field. */
export interface RowEditing<Kind extends string> {
    kind: Kind;
    name: string;
}

/** The only inline edit of a node, or null. One edit at a time keeps focus and commits simple. */
export type NodeEditing<Row extends {kind: string} = never> = CoreEditing | Row;

export interface PinProps {
    id: string; // handle id: 'in:<parameter>', 'out:<result>' or 'out:*'
    side: PinSide;
    type: string; // 'number', 'Applicant', 'number[]'
    bound?: 'path' | 'value'; // input only: how the argument is bound
    bad?: boolean; // red ring: no binding, or the last binding was rejected
    title: string;
    forceRecord?: boolean; // the whole-result pin is always a square
}

export interface InlineInputProps {
    value: string;
    ariaLabel: string;
    placeholder?: string;
    align?: 'start' | 'end';
    /** Returns an error text to keep the input open, or nothing when the commit succeeded. */
    onCommit: (text: string) => string | void;
    onCancel: () => void;
}

export interface EditableNameProps {
    name: string;
    editing: boolean;
    editable: boolean; // false shows plain text: read-only mode or a name that cannot change
    title: string; // tooltip of the name
    ariaLabel: string; // label of the inline input
    className?: string; // extra class of the plain text
    onStartEditing: () => void;
    /** Returns an error text to keep the input open. */
    onCommit: (text: string) => string | void;
    onCancel: () => void;
}

export interface DescriptionRowProps {
    documentation: DocumentationService;
    field: string;
    editing: boolean;
    readOnly?: boolean;
    onEditingChange: (editing: boolean) => void;
}

export interface NodeMenuButtonProps {
    items: RowMenuItem[];
    ariaLabel: string;
    footer?: ReactNode;
    variant?: 'node' | 'row'; // 'node': the header kebab; 'row': the kebab inside a track row
    align?: 'start' | 'end'; // 'row' only: the kebab side within the row
}

export interface NodeFrameProps {
    field: string; // model field path
    label?: string; // '@node-name'; the title falls back to the field
    testId: string;
    selected?: boolean;
    width: number; // px, from the node layout
    color: string; // tile background
    icon: ReactNode; // tile content
    badge?: ReactNode; // after the field name, for example the draft badge
    summaryLabel: string; // left label of the second header line, for example 'calls'
    summary: ReactNode; // rest of the second header line
    menuItems: RowMenuItem[];
    editing: NodeEditing<{kind: string}> | null;
    onEditingChange: (editing: CoreEditing | null) => void;
    children: ReactNode; // the body: tracks, or an empty state
}

export interface TrackLayoutInput {
    titleWidth: number; // measured width of the first header line
    summaryWidth: number; // measured width of the second header line
    inputNameWidths: number[]; // measured widths of the left track names; empty for no left track
    outputNameWidths: number[]; // measured widths of the right track names
}

export interface TrackLayout {
    inputTrack: number; // px, 0 when there is no left track
    outputTrack: number; // px
    width: number; // px, inputTrack + outputTrack
}

/** Callbacks of the "This node" and "Remove" menu groups. */
export interface CoreNodeMenuContext {
    hasDescription: boolean;
    canDescribe: boolean; // a documentation service is present
    readOnly: boolean;
    onRenameNode: () => void;
    onRenameField: () => void;
    onDuplicate: () => void;
    onAddDescription: () => void;
    onRemoveDescription: () => void;
    onRemoveFromFlow: () => void;
    onDelete: () => void;
}

export interface CoreNodeMenuSlots {
    afterRename?: RowMenuItem[]; // "This node" items between Rename field and Duplicate
    middle?: RowMenuItem[]; // a node-kind group between "This node" and "Remove"
    middleGroup?: ReactNode; // label of the middle group
}

/** The row menu of a track row: move, add below, delete. */
export interface RowMenuContext {
    noun: string; // 'argument' or 'field': the menu labels and ids use it
    index: number;
    count: number;
    used: boolean; // something reads the row; Delete is disabled
    usedReason?: string; // tooltip of the disabled Delete
    onMove: (direction: MoveDirection) => void;
    onAddBelow: () => void;
    onDelete: () => void;
}
