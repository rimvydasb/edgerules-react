import type { SxProps, Theme } from '@mui/material/styles';
import type { PortableRootContext } from '@edgerules/portable';
import type { CodeEditorService } from '../code-editor';
import type { DocumentationService } from '../documentation-service';
import type { TestCasesService, TestSubjectId } from '../test-cases-service';
import type { TestRunner } from '../tests-manager';
import type { BoxedEditorService } from './boxed-editor-types';

export type BoxedEditorTargetKind =
  | 'type-definition'
  | 'ruleset'
  | 'loop'
  | 'boxed-editor'
  | 'code-editor';

// `path` addresses the target node; `kind` says which host editor should open it.
// `ruleset` is the one target kind whose node is also fully editable inline; `optimise` is edited
// exclusively inline and never appears here.
export interface BoxedEditorOpenTarget {
  path: string;
  kind: BoxedEditorTargetKind;
}

export interface BoxedEditorProps {
  // --- model ---
  // The mutable model authority (`createBoxedEditorService(mutable)`). Never a second persisted model.
  service: BoxedEditorService;
  // The authored CRUD path to show. `'*'` for the whole model.
  path: string;
  // Host-controlled invalidation token; on change the editor calls `service.invalidate()`.
  revision?: string | number;
  // Disables name/value editing and ordering; navigation and visible handles remain.
  readOnly?: boolean;
  // Fired once per successful committed mutation.
  onChange?: (snapshot: PortableRootContext) => void;
  // Routes specialized nodes (types, rulesets, loops, nested boxed editors, code view) to another host editor.
  onOpenNode?: (target: BoxedEditorOpenTarget) => void;

  // --- editing ---
  // Diagnostics + completions for the one active expression cell.
  languageService?: CodeEditorService;

  // --- overlays (host-constructed, passed in — same convention as TestsManager) ---
  // DescriptionColumn. Empty + read-only when omitted.
  documentationService?: DocumentationService;
  // TestResultsColumn. Column hidden when omitted.
  testCasesService?: TestCasesService;
  // Recomputes the selected case after each commit.
  testRunner?: TestRunner;
  // Subject whose results are shown; defaults to `'*'`.
  testSubjectId?: TestSubjectId;
  // Whether a commit / case switch re-runs automatically. Defaults to true.
  autoRunTests?: boolean;

  // --- chrome ---
  // Model header row. Default true.
  showHeader?: boolean;
  // TestResultsColumn. Default true.
  showTestResults?: boolean;
  // DescriptionColumn. Default true.
  showDescription?: boolean;
  // Type tooltip (hover + Alt-reveal). Default true.
  showType?: boolean;
  // Initial global expand state only — each row keeps its own state after first render. Default true.
  expanded?: boolean;
  className?: string;
  sx?: SxProps<Theme>;
}
