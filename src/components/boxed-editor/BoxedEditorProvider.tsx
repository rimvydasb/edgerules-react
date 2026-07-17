import {
  createContext,
  useContext,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { PortableRootContext } from '@edgerules/portable';
import type { CodeEditorService } from '../code-editor/language/service';
import type {
  BoxedRenderNode,
  ContextRenderNode,
  ExternalFunctionRenderNode,
  FunctionRenderNode,
  InvocationRenderNode,
  ListRenderNode,
  RelationRenderNode,
} from './boxed-model';
import type { BoxedEditorOpenTarget } from './boxed-editor-types';

export interface BoxedEditorState {
  readOnly: boolean;
  snapshot: PortableRootContext;
  languageService: CodeEditorService;
  expanded: ReadonlySet<string>;
  errors: Readonly<Record<string, string>>;
  toggle: (id: string) => void;
}

export interface ExpressionActions {
  activePath: string | null;
  activate: (node: BoxedRenderNode) => void;
  commit: (node: BoxedRenderNode, text: string) => void;
  cancel: () => void;
}

export interface FieldActions {
  editingPath: string | null;
  nameDraft: string;
  setNameDraft: (value: string) => void;
  startRename: (node: BoxedRenderNode) => void;
  commitRename: (node: BoxedRenderNode) => void;
  duplicate: (node: BoxedRenderNode) => void;
  remove: (node: BoxedRenderNode) => void;
  add: (node: ContextRenderNode) => void;
}

export interface MetadataActions {
  activePath: string | null;
  activate: (node: BoxedRenderNode) => void;
  commit: (node: BoxedRenderNode, text: string) => void;
  cancel: () => void;
}
export interface FunctionActions {
  editSignature: (
    node: FunctionRenderNode | ExternalFunctionRenderNode,
  ) => void;
}
export interface InvocationActions {
  edit: (node: InvocationRenderNode) => void;
}
export interface ListActions {
  addItem: (node: ListRenderNode | RelationRenderNode) => void;
  duplicateItem: (node: BoxedRenderNode) => void;
  removeItem: (node: BoxedRenderNode) => void;
  loadMore: (node: ListRenderNode | RelationRenderNode) => void;
}
export interface RelationActions {
  editColumn: (
    node: RelationRenderNode,
    action: 'add' | 'rename' | 'delete',
    source?: string,
  ) => void;
}
export interface NavigationActions {
  open?: (target: BoxedEditorOpenTarget) => void;
}

const StateContext = createContext<BoxedEditorState | null>(null);
const ExpressionContext = createContext<ExpressionActions | null>(null);
const FieldContext = createContext<FieldActions | null>(null);
const MetadataContext = createContext<MetadataActions | null>(null);
const FunctionContext = createContext<FunctionActions | null>(null);
const InvocationContext = createContext<InvocationActions | null>(null);
const ListContext = createContext<ListActions | null>(null);
const RelationContext = createContext<RelationActions | null>(null);
const NavigationContext = createContext<NavigationActions | null>(null);
export type BoxedNodeRenderer = ComponentType<{
  node: BoxedRenderNode;
  depth: number;
  actions?: ReactNode;
  suppressFieldActions?: boolean;
}>;
const NodeRendererContext = createContext<BoxedNodeRenderer | null>(null);

interface BoxedEditorProviderProps {
  children: ReactNode;
  state: BoxedEditorState;
  expression: ExpressionActions;
  field: FieldActions;
  metadata: MetadataActions;
  functions: FunctionActions;
  invocation: InvocationActions;
  list: ListActions;
  relation: RelationActions;
  navigation: NavigationActions;
  renderer: BoxedNodeRenderer;
}

export function BoxedEditorProvider(
  props: BoxedEditorProviderProps,
): ReactElement {
  return (
    <StateContext.Provider value={props.state}>
      <ExpressionContext.Provider value={props.expression}>
        <FieldContext.Provider value={props.field}>
          <MetadataContext.Provider value={props.metadata}>
            <FunctionContext.Provider value={props.functions}>
              <InvocationContext.Provider value={props.invocation}>
                <ListContext.Provider value={props.list}>
                  <RelationContext.Provider value={props.relation}>
                    <NavigationContext.Provider value={props.navigation}>
                      <NodeRendererContext.Provider value={props.renderer}>
                        {props.children}
                      </NodeRendererContext.Provider>
                    </NavigationContext.Provider>
                  </RelationContext.Provider>
                </ListContext.Provider>
              </InvocationContext.Provider>
            </FunctionContext.Provider>
          </MetadataContext.Provider>
        </FieldContext.Provider>
      </ExpressionContext.Provider>
    </StateContext.Provider>
  );
}

function required<T>(value: T | null, name: string): T {
  if (!value)
    throw new Error(`${name} must be used within BoxedEditorProvider`);
  return value;
}

export const useBoxedEditorState = (): BoxedEditorState =>
  required(useContext(StateContext), 'useBoxedEditorState');
export const useExpressionActions = (): ExpressionActions =>
  required(useContext(ExpressionContext), 'useExpressionActions');
export const useFieldActions = (): FieldActions =>
  required(useContext(FieldContext), 'useFieldActions');
export const useMetadataActions = (): MetadataActions =>
  required(useContext(MetadataContext), 'useMetadataActions');
export const useFunctionActions = (): FunctionActions =>
  required(useContext(FunctionContext), 'useFunctionActions');
export const useInvocationActions = (): InvocationActions =>
  required(useContext(InvocationContext), 'useInvocationActions');
export const useListActions = (): ListActions =>
  required(useContext(ListContext), 'useListActions');
export const useRelationActions = (): RelationActions =>
  required(useContext(RelationContext), 'useRelationActions');
export const useEditorNavigation = (): NavigationActions =>
  required(useContext(NavigationContext), 'useEditorNavigation');
export const useBoxedNodeRenderer = (): BoxedNodeRenderer =>
  required(useContext(NodeRendererContext), 'useBoxedNodeRenderer');
