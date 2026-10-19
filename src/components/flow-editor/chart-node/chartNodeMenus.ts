import {IconAdjustmentsHorizontal, IconChartLine, IconRestore, IconTrash} from '@tabler/icons-react';
import type {RowMenuItem} from '../../../ui/RowActionsMenu';
import {startGroup} from '../core-node';
import type {ChartNodeMenuContext} from './types';

/** The ChartNode menu: "This chart", then "Remove". Read-only mode offers nothing: every item changes the canvas. */
export function chartNodeMenuItems(context: ChartNodeMenuContext): RowMenuItem[] {
    if (context.readOnly) return [];
    const chart: RowMenuItem[] = [
        context.flipped
            ? {id: 'show-chart', label: 'Show chart', icon: IconChartLine, onSelect: context.onToggleConfigure}
            : {
                  id: 'configure',
                  label: 'Configure',
                  icon: IconAdjustmentsHorizontal,
                  disabled: !context.configurable,
                  reason: context.configurable ? undefined : 'Wire a list of records or numbers first',
                  onSelect: context.onToggleConfigure,
              },
        {
            id: 'reset-config',
            label: 'Reset to automatic',
            icon: IconRestore,
            disabled: !context.custom,
            reason: context.custom ? undefined : 'The chart is configured automatically',
            onSelect: context.onResetConfig,
        },
    ];
    return [
        ...startGroup(chart, 'This chart'),
        ...startGroup(
            [{id: 'remove', label: 'Remove chart', icon: IconTrash, danger: true, onSelect: context.onRemove}],
            'Remove',
        ),
    ];
}
