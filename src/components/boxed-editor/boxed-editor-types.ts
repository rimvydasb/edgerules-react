import type { SxProps, Theme } from '@mui/material/styles';
import type {
  PortableError,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';
import type { GetFilter } from '@edgerules/web';
import type { CodeEditorService } from '../code-editor/language/service';

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

export interface ListItemDraft {
  path: string;
  value: string;
}

export interface RelationColumnDraft {
  path: string;
  items: PortableNode[];
  action: 'add' | 'delete';
  source?: string;
  name: string;
  value: string;
}
