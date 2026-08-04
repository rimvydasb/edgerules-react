import AddIcon from '@mui/icons-material/Add';
import CodeIcon from '@mui/icons-material/Code';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DataObjectIcon from '@mui/icons-material/DataObject';
import DeleteIcon from '@mui/icons-material/Delete';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import FunctionsIcon from '@mui/icons-material/Functions';
import ListAltIcon from '@mui/icons-material/ListAlt';
import PlaylistAddIcon from '@mui/icons-material/PlaylistAdd';
import RuleIcon from '@mui/icons-material/Rule';
import SettingsIcon from '@mui/icons-material/Settings';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import TableChartIcon from '@mui/icons-material/TableChart';
import TuneIcon from '@mui/icons-material/Tune';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import type { SvgIconComponent } from '@mui/icons-material';

// Single source of truth for every action id the three-dot menu can dispatch and the icon it
// renders with — ported 1:1 from the wireframe's `boxed/actions.ts` (`docs/boxed-editor/
// phase-05-context-menus-and-actions.md` §3), plus the few ids the wireframe left iconless
// (`convert-to-*`) or didn't need (`view-as-code`, `toggle-expand`, both variable per row state).
export const rowActionRegistry = [
  { id: 'duplicate', icon: ContentCopyIcon },
  { id: 'delete', icon: DeleteIcon },
  { id: 'convert-to-field', icon: undefined },
  { id: 'convert-to-context', icon: undefined },
  { id: 'convert-to-relation', icon: undefined },
  { id: 'convert-to-list', icon: undefined },
  { id: 'add-field', icon: AddIcon },
  { id: 'add-complex-type', icon: DataObjectIcon },
  { id: 'add-argument', icon: AddIcon },
  { id: 'add-variable', icon: AddIcon },
  { id: 'add-constraint', icon: AddIcon },
  { id: 'add-setting', icon: SettingsIcon },
  { id: 'add-rule', icon: PlaylistAddIcon },
  { id: 'add-condition-column', icon: ViewColumnIcon },
  { id: 'add-action-column', icon: ViewColumnIcon },
  { id: 'add-column', icon: ViewColumnIcon },
  { id: 'delete-column', icon: DeleteIcon },
  { id: 'delete-argument', icon: DeleteIcon },
  { id: 'rename-argument', icon: DriveFileRenameOutlineIcon },
  { id: 'rename-column', icon: DriveFileRenameOutlineIcon },
  { id: 'add-function', icon: FunctionsIcon },
  { id: 'add-relation', icon: TableChartIcon },
  { id: 'add-ruleset', icon: RuleIcon },
  { id: 'add-list', icon: ListAltIcon },
  { id: 'add-optimisation', icon: TuneIcon },
  { id: 'switch-objective-direction', icon: SwapVertIcon },
  { id: 'switch-rule-form', icon: SwapVertIcon },
  { id: 'model-settings', icon: SettingsIcon },
  { id: 'view-as-code', icon: CodeIcon },
  { id: 'expand', icon: UnfoldMoreIcon },
  { id: 'collapse', icon: UnfoldLessIcon },
] as const satisfies { id: string; icon?: SvgIconComponent }[];

export type RowActionId = (typeof rowActionRegistry)[number]['id'];

// Derived once from the registry above — the only place an id-to-icon lookup exists.
export const rowActionIcons: Partial<Record<RowActionId, SvgIconComponent>> = Object.fromEntries(
  rowActionRegistry.flatMap(({ id, icon }) => (icon ? [[id, icon]] : [])),
);
