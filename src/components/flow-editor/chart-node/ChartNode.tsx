import {NodeResizeControl, useReactFlow, type NodeProps} from '@xyflow/react';
import {IconChartLine} from '@tabler/icons-react';
import {useMemo, useState, type ReactElement, type ReactNode} from 'react';
import {NodeMenuButton, Pin, TrackRow, useWiredReading} from '../core-node';
import {useFlowEditor} from '../FlowEditorProvider';
import {resolveConfig} from './autoConfig';
import {ChartConfigForm} from './ChartConfigForm';
import {chartNodeMenuItems} from './chartNodeMenus';
import {ChartView} from './ChartView';
import {toDataset} from './dataset';
import type {ChartConfig, ChartNodeType} from './types';
import styles from '../core-node/coreNode.module.css';
import chartStyles from './chartNode.module.css';

export const CHART_COLOR = '#7048e8';
/** Size of a new ChartNode, and the smallest size the resize handle allows. */
export const CHART_SIZE = {width: 440, height: 340};
export const CHART_MIN_SIZE = {width: 300, height: 240};
// The title row and the data row above the chart.
const HEAD_HEIGHT = 80;
// Room the chart leaves inside the body: its padding and the bottom frame line.
const BODY_INSET = 17;

function rowCount(count: number): string {
    return count === 1 ? '1 row' : `${count} rows`;
}

/**
 * The EdgeRules ChartNode: a chart of the value wired into its data pin. It writes nothing to the model; its
 * config and size are canvas data. Without a config it configures itself from the data; Configure flips the node
 * to the config form.
 */
export function ChartNode({id, data, selected, width, height}: NodeProps<ChartNodeType>): ReactElement {
    const {readOnly = false} = useFlowEditor();
    const flow = useReactFlow();
    const {source, reading} = useWiredReading('in:data');
    const [flipped, setFlipped] = useState(false);

    const readFailed = reading !== undefined && 'error' in reading;
    const parsed = useMemo(() => (reading && !('error' in reading) ? toDataset(reading.value) : undefined), [reading]);
    const dataset = parsed && 'dataset' in parsed ? parsed.dataset : undefined;
    const resolved = useMemo(() => (dataset ? resolveConfig(data.config, dataset) : undefined), [dataset, data.config]);
    const config = resolved?.config;
    const configurable = Boolean(dataset && config);
    // The form needs data to describe; the node shows the chart side whenever there is nothing to configure.
    const showForm = flipped && configurable && !readOnly;

    const title = data.label ?? 'Chart';
    const size = {width: width ?? CHART_SIZE.width, height: height ?? CHART_SIZE.height};
    const plotHeight = Math.max(80, size.height - HEAD_HEIGHT - BODY_INSET);

    // xyflow merges the patch into the node data; a host that owns the nodes receives it as a 'replace' change.
    const setConfig = (next: ChartConfig | undefined) => flow.updateNodeData(id, {config: next});

    const menuItems = chartNodeMenuItems({
        flipped: showForm,
        configurable,
        custom: data.config !== undefined,
        readOnly,
        onToggleConfigure: () => setFlipped(!showForm),
        onResetConfig: () => setConfig(undefined),
        onRemove: () => void flow.deleteElements({nodes: [{id}]}),
    });

    let front: ReactNode;
    if (!source) front = <div className={chartStyles.message}>Wire a list of records or numbers into data</div>;
    else if (readFailed) front = <div className={chartStyles.message}>Nothing to draw</div>;
    else if (!parsed) front = <div className={chartStyles.message}>…</div>;
    else if ('error' in parsed) front = <div className={chartStyles.message}>{parsed.error}</div>;
    else if (!config) front = <div className={chartStyles.message}>No numeric column to draw</div>;
    else front = <ChartView dataset={parsed.dataset} config={config} height={plotHeight} ariaLabel={title} />;

    const summary = dataset
        ? `${rowCount(dataset.rows.length)}${resolved?.origin === 'custom' ? '' : ' · auto'}`
        : undefined;

    return (
        <div
            className={`${styles.node} ${chartStyles.chartNode} ${selected ? styles.selected : ''}`}
            style={size}
            data-testid={`chart-node-${id}`}
        >
            <div className={styles.row}>
                <div className={styles.tile} style={{background: CHART_COLOR}} aria-hidden>
                    <IconChartLine size={19} stroke={2} />
                </div>
                <div className={`${styles.title} ${chartStyles.title}`}>
                    <strong className={styles.titleText}>{title}</strong>
                    {source && <span className={styles.fieldName}>{source}</span>}
                </div>
                <NodeMenuButton items={menuItems} ariaLabel="Chart actions" />
            </div>
            <TrackRow error={readFailed ? reading.error : undefined}>
                <Pin
                    id="in:data"
                    side="in"
                    type={reading && !readFailed ? reading.type : 'any'}
                    bound={source ? 'path' : undefined}
                    bad={readFailed}
                    title={source ? `${source} : ${reading && !readFailed ? reading.type : 'any'}` : 'Wire data here'}
                />
                <div className={chartStyles.dataName}>data</div>
                {summary && (
                    <div className={chartStyles.dataSummary} data-testid="chart-summary">
                        {summary}
                    </div>
                )}
            </TrackRow>
            <div className={`${chartStyles.flipper} ${showForm ? chartStyles.flipped : ''}`}>
                <div className={chartStyles.card}>
                    <div className={`${chartStyles.face} ${chartStyles.front}`} aria-hidden={showForm} inert={showForm}>
                        {front}
                    </div>
                    <div
                        className={`${chartStyles.face} ${chartStyles.back}`}
                        aria-hidden={!showForm}
                        inert={!showForm}
                    >
                        {dataset && resolved && !readOnly && (
                            <ChartConfigForm
                                dataset={dataset}
                                resolved={resolved}
                                onChange={setConfig}
                                onDone={() => setFlipped(false)}
                            />
                        )}
                    </div>
                </div>
            </div>
            {!readOnly && (
                <NodeResizeControl
                    position="bottom-right"
                    minWidth={CHART_MIN_SIZE.width}
                    minHeight={CHART_MIN_SIZE.height}
                    className={chartStyles.resize}
                >
                    <ResizeGrip />
                </NodeResizeControl>
            )}
        </div>
    );
}

/** The diagonal grip of a window corner. */
function ResizeGrip(): ReactElement {
    return (
        <svg width="12" height="12" viewBox="0 0 12 12" aria-label="Resize chart" role="img">
            <path d="M11 3 3 11M11 7l-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
    );
}
