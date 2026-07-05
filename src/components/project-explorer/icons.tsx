import type { ReactElement } from 'react';
import Badge from '@mui/material/Badge';
import Tooltip from '@mui/material/Tooltip';
import CategoryIcon from '@mui/icons-material/Category';
import DataObjectIcon from '@mui/icons-material/DataObject';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import FolderIcon from '@mui/icons-material/Folder';
import FunctionsIcon from '@mui/icons-material/Functions';
import LabelIcon from '@mui/icons-material/Label';
import TableChartIcon from '@mui/icons-material/TableChart';
import ViewListIcon from '@mui/icons-material/ViewList';
import type { PortableError } from '@edgerules/portable';

export type IconKind = 'vars' | 'var' | 'ctx' | 'func' | 'dt' | 'types' | 'type';

const ICON_BY_KIND: Record<IconKind, typeof FolderIcon> = {
  vars: ViewListIcon,
  var: DataObjectIcon,
  ctx: FolderIcon,
  func: FunctionsIcon,
  dt: TableChartIcon,
  types: CategoryIcon,
  type: LabelIcon,
};

export interface KindIconProps {
  kind: IconKind;
  /** When present, renders an error badge + a tooltip surfacing the message/location. */
  error?: PortableError;
}

/** Icon for a tree node, per the story doc's icon table. Renders an error badge/tooltip when `error` is set. */
export function KindIcon({ kind, error }: KindIconProps): ReactElement {
  const Icon = ICON_BY_KIND[kind];
  const icon = <Icon fontSize="small" data-testid={`icon-${kind}`} />;

  if (!error) {
    return icon;
  }

  const location = error.location;
  const locationSuffix =
    location?.line !== undefined ? ` (${location.line}:${location.column ?? 0})` : '';

  return (
    <Tooltip title={`${error.message}${locationSuffix}`}>
      <Badge
        overlap="circular"
        badgeContent={<ErrorOutlineIcon color="error" sx={{ fontSize: 12 }} />}
      >
        {icon}
      </Badge>
    </Tooltip>
  );
}
