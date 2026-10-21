import {Chart} from '@tanstack/charts/react';
import {useMemo, type ReactElement} from 'react';
import {buildChartDefinition} from './chartDefinition';
import type {ChartViewProps} from './types';
import styles from './chartNode.module.css';

/** The front of a ChartNode: the TanStack chart of the dataset, as wide as its container. */
export function ChartView({dataset, config, height, ariaLabel}: ChartViewProps): ReactElement {
    // Definition identity is the TanStack update boundary: rebuild only when the data or the config changes.
    const built = useMemo(() => buildChartDefinition(dataset, config), [dataset, config]);
    const sizing = {ariaLabel, height, initialWidth: 400};
    return (
        <div className={styles.chart} data-testid="chart-view" data-chart-kind={config.kind}>
            {built.axis === 'continuous' ? (
                <Chart definition={built.definition} {...sizing} />
            ) : (
                <Chart definition={built.definition} {...sizing} />
            )}
        </div>
    );
}
