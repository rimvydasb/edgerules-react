import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type {
  PortableError,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';
import type { CodeEditorService } from '../code-editor/language/service';
import { isPortableError } from '../../lib/portable';
import { BoxedEditorProvider } from './BoxedEditorProvider';
import { BoxedEntityNode, BoxedNode } from './BoxedNode';
import {
  AddFieldForm,
  FunctionSignatureForm,
  InputForm,
  InvocationForm,
  ListItemForm,
  MetadataForm,
  RelationColumnForm,
  addFieldError,
} from './forms/EditorForms';
import {
  isObject,
  renderNode,
  resolveAuthoredPath,
  type BoxedRenderNode,
  type BoxedSortableMetadata,
} from './boxed-model';
import type {
  AddFieldDraft,
  BoxedEditorProps,
  InputDraft,
  InvocationDraft,
  ListItemDraft,
  MetadataDraft,
  RelationColumnDraft,
  SignatureDraft,
} from './boxed-editor-types';
import {
  LIST_PAGE_SIZE,
  childPath,
  expressionText,
  findNode,
  indexedLists,
  invocationNode,
  metadataNode,
  parameterDrafts,
  parentPath,
  signatureNode,
  typeText,
  typedInput,
} from './boxed-editor-utils';

export type {
  BoxedEditorOpenTarget,
  BoxedEditorProps,
  BoxedEditorService,
  BoxedEditorTargetKind,
} from './boxed-editor-types';

const NOOP_LANGUAGE_SERVICE: CodeEditorService = { diagnostics: () => [] };

const siblingCollision: CollisionDetection = (args) => {
  const activeGroup = (
    args.active.data.current?.reorder as BoxedSortableMetadata | undefined
  )?.groupId;
  if (!activeGroup) return [];
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) =>
        (container.data.current?.reorder as BoxedSortableMetadata | undefined)
          ?.groupId === activeGroup,
    ),
  });
};

function reorderContextFields(
  authored: Record<string, unknown>,
  names: string[],
): PortableNode {
  const metadata = Object.entries(authored).filter(([name]) =>
    name.startsWith('@'),
  );
  const fields = new Map(
    Object.entries(authored).filter(([name]) => !name.startsWith('@')),
  );
  const reordered = names.flatMap((name) =>
    fields.has(name) ? ([[name, fields.get(name)]] as [string, unknown][]) : [],
  );
  const named = new Set(names);
  const remaining = [...fields].filter(([name]) => !named.has(name));
  return Object.fromEntries([
    ...metadata,
    ...reordered,
    ...remaining,
  ]) as PortableNode;
}

export function BoxedEditor({
  service,
  path,
  languageService,
  revision,
  readOnly = false,
  onChange,
  onOpenNode,
  className,
  sx,
}: BoxedEditorProps): ReactElement {
  const [model, setModel] = useState<BoxedRenderNode | null>(null);
  const [snapshot, setSnapshot] = useState<PortableRootContext | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingExpression, setEditingExpression] = useState<string | null>(
    null,
  );
  const [editingName, setEditingName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [addDraft, setAddDraft] = useState<AddFieldDraft | null>(null);
  const [inputDraft, setInputDraft] = useState<InputDraft | null>(null);
  const [signatureDraft, setSignatureDraft] = useState<SignatureDraft | null>(
    null,
  );
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft | null>(
    null,
  );
  const [invocationDraft, setInvocationDraft] =
    useState<InvocationDraft | null>(null);
  const [listItemDraft, setListItemDraft] = useState<ListItemDraft | null>(
    null,
  );
  const [columnDraft, setColumnDraft] = useState<RelationColumnDraft | null>(
    null,
  );
  const pageSizes = useRef(new Map<string, number>());
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const load = useCallback(
    (nextSnapshot: PortableRootContext, resetExpansion: boolean): boolean => {
      const selected = resolveAuthoredPath(nextSnapshot, path);
      if (!selected) {
        setFatalError(`Path not found: ${path}`);
        setModel(null);
        return false;
      }
      const schema = service.get(path, 'FIELDS');
      if (isPortableError(schema)) {
        setFatalError(schema.message);
        setModel(null);
        return false;
      }
      if (isObject(selected) && String(selected['@kind']) === 'function') {
        const definition = service.get(`${path}.*`, 'FUNCTION_DEFINITIONS');
        if (isPortableError(definition)) {
          setFatalError(definition.message);
          setModel(null);
          return false;
        }
      }
      const selectedName =
        path === '*'
          ? undefined
          : path
              .split('.')
              .at(-1)
              ?.replace(/\[\d+\]$/, '');
      const next = renderNode(
        selected,
        path,
        schema,
        selectedName,
        indexedLists(service, selected, path, schema, pageSizes.current),
      );
      setSnapshot(nextSnapshot);
      setModel(next);
      setFatalError(null);
      if (resetExpansion)
        setExpanded(
          new Set([
            next.id,
            ...(path !== '*'
              ? (next.children?.map((child) => child.id) ?? [])
              : []),
          ]),
        );
      return true;
    },
    [path, service],
  );

  useEffect(() => {
    try {
      load(service.toPortable(), true);
    } catch (cause) {
      setFatalError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [service, path, revision, load]);

  const refreshCommitted = useCallback((): boolean => {
    const nextSnapshot = service.toPortable();
    if (!load(nextSnapshot, false)) return false;
    onChange?.(nextSnapshot);
    setErrors({});
    setEditingExpression(null);
    setEditingName(null);
    return true;
  }, [load, onChange, service]);
  const showError = useCallback(
    (targetPath: string, error: PortableError | string): void =>
      setErrors((previous) => ({
        ...previous,
        [targetPath]: typeof error === 'string' ? error : error.message,
      })),
    [],
  );
  const toggle = useCallback(
    (id: string): void =>
      setExpanded((previous) => {
        const next = new Set(previous);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
    [],
  );
  const commitExpression = useCallback(
    (node: BoxedRenderNode, text: string): void => {
      let targetPath = node.path;
      let nextNode: PortableNode = text;
      if (node.invocation) {
        const invocation =
          snapshot && resolveAuthoredPath(snapshot, node.invocation.path);
        if (!isObject(invocation)) {
          setFatalError(`Invocation not found: ${node.invocation.path}`);
          return;
        }
        const argumentsValue = invocation['@arguments'];
        if (
          typeof node.invocation.argument === 'number' &&
          Array.isArray(argumentsValue)
        ) {
          const argumentsCopy = [...argumentsValue];
          argumentsCopy[node.invocation.argument] = text;
          nextNode = {
            ...invocation,
            '@arguments': argumentsCopy,
          } as PortableNode;
        } else if (
          typeof node.invocation.argument === 'string' &&
          isObject(argumentsValue)
        ) {
          nextNode = {
            ...invocation,
            '@arguments': {
              ...argumentsValue,
              [node.invocation.argument]: text,
            },
          } as PortableNode;
        } else {
          setFatalError(`Invocation argument not found: ${node.path}`);
          return;
        }
        targetPath = node.invocation.path;
      }
      const result = service.set(targetPath, nextNode);
      if (isPortableError(result)) {
        showError(node.path, result);
        return;
      }
      refreshCommitted();
    },
    [refreshCommitted, service, showError, snapshot],
  );
  const guardedRename = useCallback(
    (node: BoxedRenderNode, newName: string): void => {
      const oldName = node.name ?? '';
      if (!newName || newName === oldName) {
        setEditingName(null);
        return;
      }
      const renamed = service.rename(node.path, newName);
      if (isPortableError(renamed)) {
        showError(node.path, renamed);
        return;
      }
      const ownerPath = parentPath(node.path);
      const validation = service.get(ownerPath, 'FIELDS');
      if (!isPortableError(validation)) {
        refreshCommitted();
        return;
      }
      const rollback = service.rename(childPath(ownerPath, newName), oldName);
      if (isPortableError(rollback)) {
        setFatalError(`Could not restore ${node.path}: ${rollback.message}`);
        return;
      }
      showError(node.path, validation);
    },
    [refreshCommitted, service, showError],
  );
  const guardedRemove = useCallback(
    (node: BoxedRenderNode): void => {
      const removed = service.remove(node.path);
      if (isPortableError(removed)) {
        showError(node.path, removed);
        return;
      }
      const validation = service.get(parentPath(node.path), 'FIELDS');
      if (!isPortableError(validation)) {
        refreshCommitted();
        return;
      }
      const restored = service.set(node.path, node.authored);
      if (isPortableError(restored)) {
        setFatalError(`Could not restore ${node.path}: ${restored.message}`);
        return;
      }
      showError(node.path, validation);
    },
    [refreshCommitted, service, showError],
  );
  const duplicate = useCallback(
    (node: BoxedRenderNode): void => {
      const parent = parentPath(node.path);
      const base = node.name ?? 'copy';
      const fields = snapshot && resolveAuthoredPath(snapshot, parent);
      let name = `${base}Copy`;
      let index = 2;
      while (isObject(fields) && name in fields) {
        name = `${base}Copy${index}`;
        index += 1;
      }
      const result = service.set(childPath(parent, name), node.authored);
      if (isPortableError(result)) {
        showError(node.path, result);
        return;
      }
      refreshCommitted();
    },
    [refreshCommitted, service, showError, snapshot],
  );
  const commitAdd = useCallback((): void => {
    if (!addDraft || !addDraft.name.trim()) return;
    const target = childPath(addDraft.parentPath, addDraft.name.trim());
    const node: PortableNode =
      addDraft.kind === 'expression'
        ? '0'
        : addDraft.kind === 'input'
          ? { '@kind': 'type', type: 'string' }
          : addDraft.kind === 'context'
            ? { '@kind': 'context' }
            : [];
    const result = service.set(target, node);
    if (isPortableError(result)) {
      showError(target, result);
      return;
    }
    setAddDraft(null);
    refreshCommitted();
  }, [addDraft, refreshCommitted, service, showError]);
  const commitInput = useCallback((): void => {
    if (!inputDraft) return;
    const result = service.set(inputDraft.path, typedInput(inputDraft.value));
    if (isPortableError(result)) {
      showError(inputDraft.path, result);
      return;
    }
    setInputDraft(null);
    refreshCommitted();
  }, [inputDraft, refreshCommitted, service, showError]);
  const commitSignature = useCallback((): void => {
    if (!signatureDraft) return;
    const result = service.set(
      signatureDraft.path,
      signatureNode(signatureDraft),
    );
    if (isPortableError(result)) {
      showError(signatureDraft.path, result);
      return;
    }
    setSignatureDraft(null);
    refreshCommitted();
  }, [refreshCommitted, service, showError, signatureDraft]);
  const commitMetadata = useCallback((): void => {
    if (!metadataDraft) return;
    const result = service.set(metadataDraft.path, metadataNode(metadataDraft));
    if (isPortableError(result)) {
      showError(metadataDraft.path, result);
      return;
    }
    setMetadataDraft(null);
    refreshCommitted();
  }, [metadataDraft, refreshCommitted, service, showError]);
  const commitInvocation = useCallback((): void => {
    if (!invocationDraft || !invocationDraft.method.trim()) return;
    const result = service.set(
      invocationDraft.path,
      invocationNode(invocationDraft),
    );
    if (isPortableError(result)) {
      showError(invocationDraft.path, result);
      return;
    }
    setInvocationDraft(null);
    refreshCommitted();
  }, [invocationDraft, refreshCommitted, service, showError]);
  const commitListItem = useCallback((): void => {
    if (!listItemDraft) return;
    const existing = model && findNode(model, listItemDraft.path);
    const length = existing?.children?.length ?? 0;
    const target = `${listItemDraft.path}[${length}]`;
    const node: PortableNode = listItemDraft.relation
      ? ({
          '@kind': 'context',
          ...Object.fromEntries(
            listItemDraft.fields.map((field) => [field.name, field.value]),
          ),
        } as PortableNode)
      : listItemDraft.fields[0]?.value || '0';
    const result = service.set(`${listItemDraft.path}[${length}]`, node);
    if (isPortableError(result)) {
      showError(target, result);
      return;
    }
    setListItemDraft(null);
    refreshCommitted();
  }, [listItemDraft, model, refreshCommitted, service, showError]);
  const duplicateListItem = useCallback(
    (node: BoxedRenderNode): void => {
      if (!node.listItem || !model) return;
      const list = findNode(model, node.listItem.path);
      const result = service.set(
        `${node.listItem.path}[${list?.children?.length ?? 0}]`,
        node.authored,
      );
      if (isPortableError(result)) {
        showError(node.path, result);
        return;
      }
      refreshCommitted();
    },
    [model, refreshCommitted, service, showError],
  );
  const removeListItem = useCallback(
    (node: BoxedRenderNode): void => {
      if (!node.listItem || !model) return;
      const list = findNode(model, node.listItem.path);
      const original = list?.children?.map((child) => child.authored);
      const removed = service.remove(node.path);
      if (isPortableError(removed)) {
        showError(node.path, removed);
        return;
      }
      const validation = service.get(node.listItem.path, 'FIELDS');
      if (!isPortableError(validation)) {
        refreshCommitted();
        return;
      }
      const restored = original
        ? service.set(node.listItem.path, original as unknown as PortableNode)
        : validation;
      if (isPortableError(restored)) {
        setFatalError(`Could not restore ${node.path}: ${restored.message}`);
        return;
      }
      showError(node.path, validation);
    },
    [model, refreshCommitted, service, showError],
  );
  const reorderRootFields = useCallback(
    (
      names: string[],
      values: ReadonlyMap<string, PortableNode>,
    ): PortableError | undefined => {
      for (const name of names) {
        const value = values.get(name);
        if (value === undefined) continue;
        const removed = service.remove(name);
        if (isPortableError(removed)) return removed;
        const stored = service.set(name, value);
        if (isPortableError(stored)) return stored;
      }
      return undefined;
    },
    [service],
  );
  const reorderSiblings = useCallback(
    (activeId: string, overId: string): void => {
      if (!model || activeId === overId) return;
      const active = findNode(model, activeId);
      const over = findNode(model, overId);
      const activeSortable = active?.sortable;
      const overSortable = over?.sortable;
      if (
        !active ||
        !over ||
        !activeSortable ||
        !overSortable ||
        activeSortable.groupId !== overSortable.groupId
      )
        return;
      const owner = findNode(model, activeSortable.ownerPath);
      const siblings = owner?.children ?? [];
      const from = siblings.findIndex((child) => child.id === active.id);
      const to = siblings.findIndex((child) => child.id === over.id);
      if (!owner || from < 0 || to < 0 || from === to) return;
      const reordered = arrayMove(siblings, from, to);
      let result: PortableNode | PortableError | void;

      if (activeSortable.ownerKind === 'collection') {
        result = service.set(
          activeSortable.ownerPath,
          reordered.map((child) => child.authored) as unknown as PortableNode,
        );
      } else if (activeSortable.ownerKind === 'function-body') {
        if (!isObject(owner.authored)) return;
        const body = owner.authored['@body'];
        if (!isObject(body)) return;
        result = service.set(activeSortable.ownerPath, {
          ...owner.authored,
          '@body': reorderContextFields(
            body,
            reordered.flatMap((child) => (child.name ? [child.name] : [])),
          ),
        } as PortableNode);
      } else if (activeSortable.ownerPath === '*') {
        const originalNames = siblings.flatMap((child) =>
          child.name ? [child.name] : [],
        );
        const values = new Map(
          siblings.flatMap((child) =>
            child.name ? [[child.name, child.authored] as const] : [],
          ),
        );
        result = reorderRootFields(
          reordered.flatMap((child) => (child.name ? [child.name] : [])),
          values,
        );
        if (isPortableError(result)) {
          const rollback = reorderRootFields(originalNames, values);
          if (isPortableError(rollback)) {
            setFatalError(
              `Could not restore root field order: ${rollback.message}`,
            );
            return;
          }
        }
      } else {
        if (!isObject(owner.authored)) return;
        result = service.set(
          activeSortable.ownerPath,
          reorderContextFields(
            owner.authored,
            reordered.flatMap((child) => (child.name ? [child.name] : [])),
          ),
        );
      }

      if (isPortableError(result)) {
        showError(active.path, result);
        return;
      }
      refreshCommitted();
    },
    [model, refreshCommitted, reorderRootFields, service, showError],
  );
  const finishDrag = useCallback(
    ({ active, over }: DragEndEvent): void => {
      if (!over) return;
      reorderSiblings(String(active.id), String(over.id));
    },
    [reorderSiblings],
  );
  const commitColumn = useCallback((): void => {
    if (!columnDraft || !columnDraft.name.trim()) return;
    const name = columnDraft.name.trim();
    const next = columnDraft.items.map((item) => {
      if (!isObject(item)) return item;
      const { '@kind': kind = 'context', ...fields } = item;
      if (columnDraft.action === 'add')
        return {
          '@kind': kind,
          ...fields,
          [name]: columnDraft.value || '0',
        } as PortableNode;
      if (columnDraft.action === 'rename' && columnDraft.source) {
        const { [columnDraft.source]: value, ...remaining } = fields;
        return { '@kind': kind, ...remaining, [name]: value } as PortableNode;
      }
      const { [columnDraft.source ?? '']: _removed, ...remaining } = fields;
      return { '@kind': kind, ...remaining } as PortableNode;
    });
    const result = service.set(
      columnDraft.path,
      next as unknown as PortableNode,
    );
    if (isPortableError(result)) {
      showError(columnDraft.path, result);
      return;
    }
    setColumnDraft(null);
    refreshCommitted();
  }, [columnDraft, refreshCommitted, service, showError]);
  const loadMore = useCallback(
    (node: BoxedRenderNode): void => {
      if (node.kind !== 'list' && node.kind !== 'relation') return;
      pageSizes.current.set(node.path, node.list.loaded + LIST_PAGE_SIZE);
      load(service.toPortable(), false);
    },
    [load, service],
  );

  if (fatalError)
    return (
      <Alert severity="error" className={className} sx={sx}>
        {fatalError}
      </Alert>
    );
  if (!model || !snapshot)
    return <Box className={className} sx={sx} aria-busy="true" />;
  const openSignature = (node: BoxedRenderNode): void => {
    if (isObject(node.authored))
      setSignatureDraft({
        path: node.path,
        external: node.kind === 'external-function',
        parameters: parameterDrafts(node.authored),
        returnType: typeText(node.authored['@return']),
        node: node.authored,
      });
  };
  const openMetadata = (node: BoxedRenderNode): void => {
    if (isObject(node.authored))
      setMetadataDraft({
        path: node.path,
        node: node.authored,
        nodeKind: String(node.authored['@node'] ?? ''),
        nodeName: String(node.authored['@node-name'] ?? ''),
        description: String(node.authored['@description'] ?? ''),
      });
  };
  const openInvocation = (node: BoxedRenderNode): void => {
    if (!isObject(node.authored)) return;
    const argumentsValue = node.authored['@arguments'];
    setInvocationDraft({
      path: node.path,
      node: node.authored,
      method: String(node.authored['@method'] ?? ''),
      named: !Array.isArray(argumentsValue),
      arguments: Array.isArray(argumentsValue)
        ? argumentsValue.map((value) => ({
            name: '',
            value: expressionText(value as PortableNode),
          }))
        : isObject(argumentsValue)
          ? Object.entries(argumentsValue).map(([name, value]) => ({
              name,
              value: expressionText(value as PortableNode),
            }))
          : [],
    });
  };
  const openListItem = (node: BoxedRenderNode): void => {
    const fields =
      node.kind === 'relation' &&
      node.children?.[0] &&
      isObject(node.children[0].authored)
        ? Object.keys(node.children[0].authored)
            .filter((key) => !key.startsWith('@'))
            .map((name) => ({ name, value: '0' }))
        : [{ name: 'value', value: '0' }];
    setListItemDraft({
      path: node.path,
      relation: node.kind === 'relation',
      fields,
    });
  };
  return (
    <BoxedEditorProvider
      state={{
        readOnly,
        snapshot,
        languageService: languageService ?? NOOP_LANGUAGE_SERVICE,
        expanded,
        errors,
        toggle,
      }}
      expression={{
        activePath: editingExpression,
        activate: (node) => setEditingExpression(node.path),
        commit: commitExpression,
        cancel: () => {
          setEditingExpression(null);
          setErrors({});
        },
      }}
      field={{
        editingPath: editingName,
        nameDraft,
        setNameDraft,
        startRename: (node) => {
          setEditingName(node.path);
          setNameDraft(node.name ?? '');
        },
        commitRename: (node) => guardedRename(node, nameDraft.trim()),
        duplicate,
        remove: guardedRemove,
        add: (node) =>
          setAddDraft({ parentPath: node.path, name: '', kind: 'expression' }),
      }}
      metadata={{ edit: openMetadata }}
      input={{
        edit: (node) =>
          setInputDraft({ path: node.path, value: typedInput(node.authored) }),
      }}
      functions={{ editSignature: openSignature }}
      invocation={{ edit: openInvocation }}
      list={{
        addItem: openListItem,
        duplicateItem: duplicateListItem,
        removeItem: removeListItem,
        loadMore,
      }}
      relation={{
        editColumn: (node, action, source) =>
          setColumnDraft({
            path: node.path,
            items: node.children?.map((child) => child.authored) ?? [],
            action,
            source,
            name: action === 'add' ? '' : (source ?? ''),
            value: '0',
          }),
      }}
      navigation={{ open: onOpenNode }}
      renderer={BoxedEntityNode}
    >
      <DndContext
        sensors={sensors}
        collisionDetection={siblingCollision}
        onDragEnd={finishDrag}
      >
        <Box
          className={className}
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            ...sx,
          }}
          role="treegrid"
          aria-label={`Boxed editor ${path}`}
        >
          {path === '*' &&
            (snapshot['@model-name'] || snapshot['@model-version']) && (
              <Box
                sx={{
                  px: 1,
                  py: 0.5,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <Typography variant="subtitle2">
                  {snapshot['@model-name'] ?? 'Model'}
                  {snapshot['@model-version']
                    ? ` · ${snapshot['@model-version']}`
                    : ''}
                </Typography>
              </Box>
            )}
          <BoxedNode node={model} />
        </Box>
      </DndContext>
      <AddFieldForm
        draft={addDraft}
        setDraft={setAddDraft}
        error={addFieldError(addDraft, errors)}
        commit={commitAdd}
      />
      <InputForm
        draft={inputDraft}
        setDraft={setInputDraft}
        error={inputDraft ? errors[inputDraft.path] : undefined}
        commit={commitInput}
      />
      <FunctionSignatureForm
        draft={signatureDraft}
        setDraft={setSignatureDraft}
        error={signatureDraft ? errors[signatureDraft.path] : undefined}
        commit={commitSignature}
      />
      <InvocationForm
        draft={invocationDraft}
        setDraft={setInvocationDraft}
        error={invocationDraft ? errors[invocationDraft.path] : undefined}
        commit={commitInvocation}
      />
      <ListItemForm
        draft={listItemDraft}
        setDraft={setListItemDraft}
        commit={commitListItem}
      />
      <RelationColumnForm
        draft={columnDraft}
        setDraft={setColumnDraft}
        commit={commitColumn}
      />
      <MetadataForm
        draft={metadataDraft}
        setDraft={setMetadataDraft}
        error={metadataDraft ? errors[metadataDraft.path] : undefined}
        commit={commitMetadata}
      />
    </BoxedEditorProvider>
  );
}
