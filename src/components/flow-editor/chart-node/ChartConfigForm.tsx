import {Button, Checkbox, NativeSelect, SegmentedControl, Switch} from '@mantine/core';
import {useId, type ReactElement} from 'react';
import {canStack} from './autoConfig';
import {axisColumns, columnLabel, numericColumns, ROW_NUMBER} from './dataset';
import type {ChartConfig, ChartConfigFormProps, ChartKind} from './types';
import styles from './chartNode.module.css';

const KINDS: {value: ChartKind; label: string}[] = [
    {value: 'line', label: 'Line'},
    {value: 'area', label: 'Area'},
    {value: 'bar', label: 'Bar'},
];

const ORIGIN_TEXT = {
    auto: 'Configured automatically from the data',
    custom: 'Custom configuration',
    fallback: 'The custom configuration does not fit this data; the automatic one is shown',
};

/**
 * The back of a ChartNode: what TanStack needs to paint the chart. Every change applies at once; the first change
 * of an automatic config turns it into the node's own config.
 */
export function ChartConfigForm({dataset, resolved, onChange, onDone}: ChartConfigFormProps): ReactElement | null {
    const kindLabel = useId();
    const {config, origin} = resolved;
    if (!config) return null;
    const update = (patch: Partial<ChartConfig>) => onChange({...config, ...patch});

    const xOptions = [
        {value: ROW_NUMBER, label: columnLabel(ROW_NUMBER)},
        ...axisColumns(dataset).map((column) => ({value: column.name, label: `${column.name} (${column.kind})`})),
    ];
    const seriesOptions = numericColumns(dataset).filter((column) => column.name !== config.x);
    const changeX = (x: string) => {
        // A column on the horizontal axis is no longer a series; keep at least one series.
        const series = config.series.filter((name) => name !== x);
        const fallback = seriesOptions.find((column) => column.name !== x)?.name;
        update({x, series: series.length > 0 ? series : fallback ? [fallback] : config.series});
    };
    const toggleSeries = (name: string, checked: boolean) => {
        // Series keep the column order of the data, so the legend order does not depend on click order.
        const chosen = new Set(config.series);
        if (checked) chosen.add(name);
        else chosen.delete(name);
        update({series: seriesOptions.map((column) => column.name).filter((column) => chosen.has(column))});
    };

    return (
        <form
            className={`${styles.form} nodrag nowheel`}
            aria-label="Chart configuration"
            onSubmit={(event) => {
                event.preventDefault();
                onDone();
            }}
            onKeyDown={(event) => {
                if (event.key === 'Escape') onDone();
            }}
        >
            <div className={`${styles.origin} ${origin === 'fallback' ? styles.originWarn : ''}`}>
                {ORIGIN_TEXT[origin]}
            </div>
            <div className={styles.field}>
                <span className={styles.fieldLabel} id={kindLabel}>
                    Chart type
                </span>
                <SegmentedControl
                    size="xs"
                    fullWidth
                    aria-labelledby={kindLabel}
                    data={KINDS}
                    value={config.kind}
                    onChange={(kind) => update({kind: kind as ChartKind})}
                />
            </div>
            <NativeSelect
                size="xs"
                label="Horizontal axis"
                classNames={{label: styles.fieldLabel}}
                data={xOptions}
                value={config.x}
                onChange={(event) => changeX(event.currentTarget.value)}
            />
            <fieldset className={styles.field}>
                <legend className={styles.fieldLabel}>Series</legend>
                {seriesOptions.length === 0 ? (
                    <span className={styles.hint}>No numeric column is left to draw</span>
                ) : (
                    <div className={styles.seriesList}>
                        {seriesOptions.map((column) => {
                            const checked = config.series.includes(column.name);
                            return (
                                <Checkbox
                                    key={column.name}
                                    size="xs"
                                    label={column.name}
                                    checked={checked}
                                    // The last series stays: a chart needs something to draw.
                                    disabled={checked && config.series.length === 1}
                                    onChange={(event) => toggleSeries(column.name, event.currentTarget.checked)}
                                />
                            );
                        })}
                    </div>
                )}
            </fieldset>
            {canStack(config) && (
                <Switch
                    size="xs"
                    label="Stack series"
                    checked={Boolean(config.stacked)}
                    onChange={(event) => update({stacked: event.currentTarget.checked})}
                />
            )}
            <div className={styles.formActions}>
                <Button
                    size="compact-xs"
                    variant="subtle"
                    color="gray"
                    disabled={origin === 'auto'}
                    onClick={() => onChange(undefined)}
                >
                    Reset to automatic
                </Button>
                <Button size="compact-xs" type="submit">
                    Done
                </Button>
            </div>
        </form>
    );
}
