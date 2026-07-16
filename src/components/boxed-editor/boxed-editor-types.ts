import type { SxProps, Theme } from '@mui/material/styles';
import type { PortableError, PortableNode, PortableRootContext, PortableTypedValue } from '@edgerules/portable';
import type { GetFilter } from '@edgerules/web';
import type { Dispatch, SetStateAction } from 'react';
import type { CodeEditorService } from '../code-editor/language/service';
import type { BoxedRenderNode } from './boxed-model';

export interface BoxedEditorService {
  toPortable(): PortableRootContext;
  get(path: string, filter?: GetFilter): PortableNode | PortableError;
  set(path: string, node: PortableNode): PortableNode | PortableError;
  remove(path: string): void | PortableError;
  rename(path: string, newName: string): void | PortableError;
}

export type BoxedEditorTargetKind = 'type-definition' | 'ruleset' | 'loop';

export interface BoxedEditorOpenTarget {
  path: string;
  kind: BoxedEditorTargetKind;
}

export interface BoxedEditorProps {
  service: BoxedEditorService;
  path: string;
  languageService?: CodeEditorService;
  revision?: string | number;
  readOnly?: boolean;
  onChange?: (snapshot: PortableRootContext) => void;
  onOpenNode?: (target: BoxedEditorOpenTarget) => void;
  className?: string;
  sx?: SxProps<Theme>;
}

export interface AddFieldDraft {
  parentPath: string;
  name: string;
  kind: 'expression' | 'input' | 'context' | 'list';
}

export interface InputDraft {
  path: string;
  value: PortableTypedValue;
}

export interface SignatureParameter {
  name: string;
  type: string;
}

export interface SignatureDraft {
  path: string;
  external: boolean;
  parameters: SignatureParameter[];
  returnType: string;
  node: Record<string, unknown>;
}

export interface MetadataDraft {
  path: string;
  node: Record<string, unknown>;
  nodeKind: string;
  nodeName: string;
  description: string;
}

export interface InvocationDraft {
  path: string;
  node: Record<string, unknown>;
  method: string;
  named: boolean;
  arguments: Array<{ name: string; value: string }>;
}

export interface ListItemDraft {
  path: string;
  relation: boolean;
  fields: Array<{ name: string; value: string }>;
}

export interface RelationColumnDraft {
  path: string;
  items: PortableNode[];
  action: 'add' | 'rename' | 'delete';
  source?: string;
  name: string;
  value: string;
}

export interface BoxedNodeRowProps {
  node: BoxedRenderNode;
  depth: number;
  expanded: Set<string>;
  editingExpression: string | null;
  editingName: string | null;
  nameDraft: string;
  readOnly: boolean;
  snapshot: PortableRootContext;
  languageService: CodeEditorService;
  errors: Record<string, string>;
  toggle: (id: string) => void;
  startExpression: (node: BoxedRenderNode) => void;
  commitExpression: (node: BoxedRenderNode, text: string) => void;
  cancelExpression: () => void;
  startName: (node: BoxedRenderNode) => void;
  setNameDraft: (value: string) => void;
  commitName: (node: BoxedRenderNode) => void;
  duplicate: (node: BoxedRenderNode) => void;
  remove: (node: BoxedRenderNode) => void;
  openInput: (node: BoxedRenderNode) => void;
  openAdd: (path: string) => void;
  openSignature: (node: BoxedRenderNode) => void;
  openMetadata: (node: BoxedRenderNode) => void;
  openInvocation: (node: BoxedRenderNode) => void;
  openListItem: (node: BoxedRenderNode) => void;
  duplicateListItem: (node: BoxedRenderNode) => void;
  removeListItem: (node: BoxedRenderNode) => void;
  moveListItem: (node: BoxedRenderNode, direction: -1 | 1) => void;
  loadMore: (node: BoxedRenderNode) => void;
  openColumn: (node: BoxedRenderNode, action: 'add' | 'rename' | 'delete', source?: string) => void;
  onOpenNode?: (target: BoxedEditorOpenTarget) => void;
}

export interface BoxedEditorDialogsProps {
  errors: Record<string, string>;
  addDraft: AddFieldDraft | null;
  setAddDraft: Dispatch<SetStateAction<AddFieldDraft | null>>;
  commitAdd: () => void;
  inputDraft: InputDraft | null;
  setInputDraft: Dispatch<SetStateAction<InputDraft | null>>;
  commitInput: () => void;
  signatureDraft: SignatureDraft | null;
  setSignatureDraft: Dispatch<SetStateAction<SignatureDraft | null>>;
  commitSignature: () => void;
  invocationDraft: InvocationDraft | null;
  setInvocationDraft: Dispatch<SetStateAction<InvocationDraft | null>>;
  commitInvocation: () => void;
  listItemDraft: ListItemDraft | null;
  setListItemDraft: Dispatch<SetStateAction<ListItemDraft | null>>;
  commitListItem: () => void;
  columnDraft: RelationColumnDraft | null;
  setColumnDraft: Dispatch<SetStateAction<RelationColumnDraft | null>>;
  commitColumn: () => void;
  metadataDraft: MetadataDraft | null;
  setMetadataDraft: Dispatch<SetStateAction<MetadataDraft | null>>;
  commitMetadata: () => void;
}
