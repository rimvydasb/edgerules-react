import {
  useState,
  type ReactElement,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import type { SxProps, Theme } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view/SimpleTreeView';
import { TreeItem } from '@mui/x-tree-view/TreeItem';
import type { MutableDecisionService } from '@edgerules/web/mutable';
import type {
  PortableContext,
  PortableError,
  PortableNode,
} from '@edgerules/portable';
import { isPortableError } from '../../lib/portable';
import {
  groupContextChildren,
  listTypeEntries,
  ROOT_FETCH_PATH,
  ROOT_PATH,
  type NamedEntry,
} from './tree-model';
import { KindIcon, type IconKind } from './icons';

export interface ProjectExplorerProps {
  /** The engine service to read the model from. Only `get` is used today; `set`/`remove`/`rename` support is coming. */
  service: MutableDecisionService;
  /** Heading rendered above the tree; not a tree node itself. */
  rootLabel?: string;
  onOpenVariables?: (contextPath: string) => void;
  onOpenFunction?: (functionPath: string) => void;
  onOpenDecisionTable?: (tablePath: string) => void;
  onOpenTypes?: (focusTypeName?: string) => void;
  className?: string;
  sx?: SxProps<Theme>;
}

function typesGroupItemId(): string {
  return `${ROOT_PATH}::types`;
}

function varsGroupItemId(contextPath: string): string {
  return `${contextPath}::vars`;
}

function typeEntryItemId(name: string): string {
  return `@types.${name}`;
}

function isFetchableContextPath(itemId: string): boolean {
  return !itemId.includes('::') && !itemId.startsWith('@types.');
}

function renderLabel(
  kind: IconKind,
  text: string,
  error?: PortableError,
): ReactNode {
  return (
    <Box
      component="span"
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}
    >
      <KindIcon kind={kind} error={error} />
      <Typography variant="body2" component="span">
        {text}
      </Typography>
    </Box>
  );
}

/**
 * Renders a tree view of an EdgeRules Portable Format model (docs/PROJECT_EXPLORER_STORY.md).
 * `[ctx]` nodes are fetched lazily (one `service.get(path)` call per expansion); `[types]`/`[vars]`
 * group expansion is client-side only since their children arrive with the containing fetch.
 */
export function ProjectExplorer({
  service,
  rootLabel = 'Project',
  onOpenVariables,
  onOpenFunction,
  onOpenDecisionTable,
  onOpenTypes,
  className,
  sx,
}: ProjectExplorerProps): ReactElement {
  const [contextCache, setContextCache] = useState<
    Map<string, PortableNode | PortableError>
  >(() => new Map([[ROOT_PATH, service.get(ROOT_FETCH_PATH)]]));
  const [rootTypes] = useState<PortableNode | PortableError>(() =>
    service.get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS'),
  );
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  function handleExpandedItemsChange(
    _event: SyntheticEvent | null,
    itemIds: string[],
  ): void {
    const newlyExpanded = itemIds.filter((id) => !expandedItems.includes(id));
    const toFetch = newlyExpanded.filter(
      (id) => isFetchableContextPath(id) && !contextCache.has(id),
    );

    if (toFetch.length > 0) {
      const next = new Map(contextCache);
      for (const path of toFetch) {
        next.set(path, service.get(path));
      }
      setContextCache(next);
    }
    setExpandedItems(itemIds);
  }

  // Populated while building the tree below; consumed by SimpleTreeView's onItemClick.
  const actions = new Map<string, () => void>();

  function renderVarsGroup(contextPath: string, vars: NamedEntry[]): ReactNode {
    const itemId = varsGroupItemId(contextPath);
    actions.set(itemId, () => onOpenVariables?.(contextPath));

    return (
      <TreeItem
        key={itemId}
        itemId={itemId}
        label={renderLabel('vars', 'Variables')}
      >
        {vars.map((entry) => {
          actions.set(entry.path, () => onOpenVariables?.(contextPath));
          return (
            <TreeItem
              key={entry.path}
              itemId={entry.path}
              label={renderLabel('var', entry.name)}
            />
          );
        })}
      </TreeItem>
    );
  }

  function renderTypesGroup(): ReactNode {
    const itemId = typesGroupItemId();

    if (isPortableError(rootTypes)) {
      return (
        <TreeItem
          key={itemId}
          itemId={itemId}
          label={renderLabel('types', 'Types', rootTypes)}
        />
      );
    }

    actions.set(itemId, () => onOpenTypes?.());
    const entries = listTypeEntries(rootTypes as PortableContext);

    return (
      <TreeItem
        key={itemId}
        itemId={itemId}
        label={renderLabel('types', 'Types')}
      >
        {entries.map((entry) => {
          const entryItemId = typeEntryItemId(entry.name);
          actions.set(entryItemId, () => onOpenTypes?.(entry.name));
          return (
            <TreeItem
              key={entryItemId}
              itemId={entryItemId}
              label={renderLabel('type', entry.name)}
            />
          );
        })}
      </TreeItem>
    );
  }

  function renderOrderedEntry(entry: NamedEntry): ReactNode {
    if (entry.kind === 'func') {
      actions.set(entry.path, () => onOpenFunction?.(entry.path));
      return (
        <TreeItem
          key={entry.path}
          itemId={entry.path}
          label={renderLabel('func', `${entry.name}()`)}
        />
      );
    }

    if (entry.kind === 'dt') {
      actions.set(entry.path, () => onOpenDecisionTable?.(entry.path));
      return (
        <TreeItem
          key={entry.path}
          itemId={entry.path}
          label={renderLabel('dt', `${entry.name}()`)}
        />
      );
    }

    // entry.kind === 'ctx'
    const cached = contextCache.get(entry.path);
    const error =
      cached !== undefined && isPortableError(cached) ? cached : undefined;
    const label = renderLabel('ctx', entry.name, error);

    if (error) {
      // Treat as a leaf until the underlying model is fixed and the path resolves again.
      return <TreeItem key={entry.path} itemId={entry.path} label={label} />;
    }

    return (
      <TreeItem key={entry.path} itemId={entry.path} label={label}>
        {cached !== undefined ? (
          renderContextChildren(entry.path, false)
        ) : (
          <TreeItem itemId={`${entry.path}::placeholder`} label="" />
        )}
      </TreeItem>
    );
  }

  function renderContextChildren(
    contextPath: string,
    isRoot: boolean,
  ): ReactNode[] {
    const node = contextCache.get(contextPath) as PortableContext;
    const { vars, ordered } = groupContextChildren(contextPath, node);
    const children: ReactNode[] = [];

    if (isRoot) {
      children.push(renderTypesGroup());
    }
    if (vars.length > 0) {
      children.push(renderVarsGroup(contextPath, vars));
    }
    for (const entry of ordered) {
      children.push(renderOrderedEntry(entry));
    }
    return children;
  }

  const rootNode = contextCache.get(ROOT_PATH);

  return (
    <Box className={className} sx={sx}>
      {rootLabel ? (
        <Typography variant="subtitle2" sx={{ px: 1, py: 0.5 }}>
          {rootLabel}
        </Typography>
      ) : null}
      {isPortableError(rootNode) ? (
        <Alert severity="error">{rootNode.message}</Alert>
      ) : (
        <SimpleTreeView
          expandedItems={expandedItems}
          onExpandedItemsChange={handleExpandedItemsChange}
          onItemClick={(_event, itemId) => actions.get(itemId)?.()}
        >
          {renderContextChildren(ROOT_PATH, true)}
        </SimpleTreeView>
      )}
    </Box>
  );
}
