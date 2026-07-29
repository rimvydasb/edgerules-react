import type {
  PortableError,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';

export type BoxedRowKind =
  | 'model'
  | 'field'
  | 'context'
  | 'complexType'
  | 'list'
  | 'list-item'
  | 'relation'
  | 'relation-item'
  | 'function'
  | 'function-result'
  | 'ruleset'
  | 'rule'
  | 'ruleset-default'
  | 'ruleset-hit-policy'
  | 'optimisation'
  | 'optimisation-setting'
  | 'optimisation-variable-group'
  | 'optimisation-variable'
  | 'optimisation-objective'
  | 'optimisation-constraint-group'
  | 'optimisation-constraint';

export interface BoxedRowData {
  kind: BoxedRowKind;
  depth: number;
  path: string;
  name: string;
  value?: string;
  type?: string;
  readOnly?: boolean;
  deletable?: boolean;
  children?: BoxedRowData[];
  /** `model` kind only — the root context's `@model-version` metadata (Model Settings). */
  modelVersion?: string;
}

export interface BoxedTableRowData extends BoxedRowData {
  parameters?: SignatureParameter[];
  columns?: string[];
  cells?: string[];
  conditionColumns?: string[];
  actionColumns?: string[];
  conditions?: string[];
  conditionsExpression?: string;
  actions?: string[];
  priority?: number;
}

export interface SignatureParameter {
  name: string;
  type?: string;
  required?: boolean;
}

export type Unsubscribe = () => void;

export interface BoxedEditorService {
  getBoxedRowsData(path: string): BoxedRowData[];
  getBoxedRowData(path: string): BoxedRowData | undefined;
  setBoxedRowData(
    path: string,
    row: BoxedRowData,
  ): PortableNode | PortableError;
  remove(path: string): void | PortableError;
  rename(path: string, newName: string): void | PortableError;
  move(
    fromPath: string,
    toParentPath: string,
    index: number,
  ): void | PortableError;
  subscribe(listener: () => void): Unsubscribe;
  invalidate(path?: string): void;
  toPortable(): PortableRootContext;
  /**
   * Explicit, on-demand relink check
   */
  link(): PortableError | void;
}
