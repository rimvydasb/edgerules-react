import { useMemo } from 'react';
import type { PortableError } from '@edgerules/portable';
import { isPortableError } from '../../../lib/portable';
import type { DocumentationService } from '../../documentation-service';
import type { TestCasesService, TestSubjectId } from '../../test-cases-service';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { useBoxedEditorTestContext } from '../context/BoxedEditorTestContext';
import { useOptionalBoxedEditorUi } from '../context/BoxedEditorUiContext';
import type { BoxedEditorService, BoxedRowData } from '../boxed-editor-types';
import { childPath, indexedPath, parentPath, unqualifyPath } from '../service/portable-utils';

export interface RowCommands {
  /**
   * Commits a whole row (including its `children`) at `path`. Every value/name/cell/column/
   * parameter/setting edit and every `Add…` / `Convert to…` action goes through this one call
   * (Phases 3-6 add the callers; this phase wires the value-cell commit).
   */
  setBoxedRowData(path: string, row: BoxedRowData, actingPath?: string): PortableError | undefined;
  /** Name-cell commit on a named kind. */
  rename(path: string, newName: string): PortableError | undefined;
  /** `Delete`, cleared-name special actions, `Delete "‹column›" Column`. */
  remove(path: string): PortableError | undefined;
  /** A drag-and-drop reorder/reparent, gated beforehand by `dnd/dropRules.ts`. */
  move(fromPath: string, toParentPath: string, index: number): PortableError | undefined;
}

/** Every path under (and including) `rootPath`, as of right now — captured before a rename/move
 * commits so the overlay migration below has the *old* shape to work from once the cache under
 * `rootPath` is gone. */
function collectSubtreePaths(service: BoxedEditorService, rootPath: string): string[] {
  const paths = [rootPath];
  for (const child of service.getBoxedRowsData(rootPath)) {
    paths.push(...collectSubtreePaths(service, child.path));
  }
  return paths;
}

/** The path this row (or one of its descendants) ends up at once its own subtree root moves from
 * `oldRoot` to `newRoot` — every path in the subtree shares `oldRoot` as a literal prefix, since a
 * descendant's own CRUD path is always built through `childPath`/`indexedPath` on its ancestors. */
function rewriteUnderNewRoot(path: string, oldRoot: string, newRoot: string): string {
  return newRoot + path.slice(oldRoot.length);
}

/**
 * After a successful rename/move, migrates both overlays for every path in the moved subtree
 * (Resolved Decision #7). `DocumentationService.renamePath` only migrates an exact-match path (no
 * prefix awareness), so every descendant needs its own call; `TestCasesService.renamePath` already
 * rewrites its own prefix matches internally, but calling it per-path too is harmless — a path
 * already migrated by an earlier call in the loop simply matches nothing on a later one.
 */
function migrateOverlayPaths(
  oldPaths: string[],
  oldRoot: string,
  newRoot: string,
  documentationService: DocumentationService | undefined,
  testCasesService: TestCasesService | undefined,
  testSubjectId: TestSubjectId | undefined,
): void {
  if (!documentationService && !testCasesService) return;
  const subject = testSubjectId ?? '*';
  for (const oldPath of oldPaths) {
    const newPath = rewriteUnderNewRoot(oldPath, oldRoot, newRoot);
    if (newPath === oldPath) continue;
    documentationService?.renamePath(oldPath, newPath);
    const oldRelative = unqualifyPath(subject, oldPath);
    const newRelative = unqualifyPath(subject, newPath);
    if (oldRelative !== undefined && newRelative !== undefined) {
      testCasesService?.renamePath(oldRelative, newRelative);
    }
  }
}

/** Purely positional kinds — array-indexed, so their destination path depends on `index`. Every
 * other movable kind is name-keyed (`optimisation-variable`/`-constraint` included: they live in
 * `@variables`/`@constraints` *objects*, not arrays), so the name alone determines the new path. */
function computeMovedPath(
  service: BoxedEditorService,
  fromPath: string,
  toParentPath: string,
  index: number,
): string {
  const row = service.getBoxedRowData(fromPath);
  if (!row) return fromPath;
  if (row.kind === 'rule') return indexedPath(childPath(toParentPath, 'rules'), index);
  if (row.kind === 'list-item' || row.kind === 'relation-item') {
    return indexedPath(toParentPath, index);
  }
  return childPath(toParentPath, row.name);
}

/**
 * The single dispatch point for every mutating action in the editor: commits through the
 * `BoxedEditorService` facade, returns a `PortableError` unchanged on rejection (so the calling
 * cell can keep focus and show it inline, per `docs/boxed-editor/phase-02-*`), and fires
 * `onChange` exactly once per successful commit — never on a rejected edit.
 */
export function useRowCommands(): RowCommands {
  const { service, onChange, documentationService, testCasesService, testSubjectId } =
    useBoxedEditorContext();
  const { scheduleTestRun } = useBoxedEditorTestContext();
  const ui = useOptionalBoxedEditorUi();

  return useMemo<RowCommands>(() => {
    // Fired once per successful commit (Triggers table, Phase 7): schedules a debounced, coalesced
    // re-run of the selected test case after `onChange` so a burst of edits produces one execution.
    const notifyChange = (): void => {
      onChange?.(service.toPortable());
      scheduleTestRun();
    };
    const migrate = (oldPaths: string[], oldRoot: string, newRoot: string): void =>
      migrateOverlayPaths(oldPaths, oldRoot, newRoot, documentationService, testCasesService, testSubjectId);
    const finish = (
      actingPath: string,
      result: PortableError | undefined,
      onSuccess?: () => void,
      reportError = true,
    ): PortableError | undefined => {
      if (result) {
        if (reportError) ui?.setRowError(actingPath, result);
        return result;
      }
      ui?.setRowError(actingPath, undefined);
      onSuccess?.();
      notifyChange();
      const modelLinkResult = service.link();
      ui?.setModelError(isPortableError(modelLinkResult) ? modelLinkResult : undefined);
      return undefined;
    };

    return {
      setBoxedRowData(path, row, actingPath) {
        const result = service.setBoxedRowData(path, row);
        return finish(
          actingPath ?? path,
          isPortableError(result) ? result : undefined,
          undefined,
          actingPath !== undefined,
        );
      },
      rename(path, newName) {
        const oldPaths = collectSubtreePaths(service, path);
        const result = service.rename(path, newName);
        return finish(
          path,
          isPortableError(result) ? result : undefined,
          () => {
            const newPath = childPath(parentPath(path) ?? '*', newName);
            migrate(oldPaths, path, newPath);
          },
        );
      },
      remove(path) {
        const result = service.remove(path);
        return finish(path, isPortableError(result) ? result : undefined);
      },
      move(fromPath, toParentPath, index) {
        const oldPaths = collectSubtreePaths(service, fromPath);
        const newPath = computeMovedPath(service, fromPath, toParentPath, index);
        const result = service.move(fromPath, toParentPath, index);
        return finish(fromPath, isPortableError(result) ? result : undefined, () =>
          migrate(oldPaths, fromPath, newPath),
        );
      },
    };
  }, [
    service,
    onChange,
    documentationService,
    testCasesService,
    testSubjectId,
    scheduleTestRun,
    ui,
  ]);
}
