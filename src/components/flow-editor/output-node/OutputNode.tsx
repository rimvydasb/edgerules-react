import type {NodeProps} from '@xyflow/react';
import {IconLogout2} from '@tabler/icons-react';
import {useMemo, type ReactElement} from 'react';
import {Pin, TrackRow, useWiredReading} from '../core-node';
import {cellKind, formatCell, outputShape, shapeSummary, type OutputShape} from './outputShape';
import type {OutputNodeType} from './types';
import styles from '../core-node/coreNode.module.css';
import outputStyles from './outputNode.module.css';

export {sourcePath} from '../core-node';
export {formatValue} from './outputShape';

const OUTPUT_COLOR = '#2f9e44';
const WIDTH = 240;
// A longer list or table shows its first rows and says how many it leaves out.
const ROW_LIMIT = 500;

/**
 * The EdgeRules OutputNode: one value row with an input pin. It shows what the engine computes for the path that
 * is wired into it, in the shape of the value: a single value in the row; a list, a list of records or a record as
 * a table under the row. It writes nothing to the model, so it has no menu and no inline edit.
 */
export function OutputNode({id, data, selected}: NodeProps<OutputNodeType>): ReactElement {
    const {source, reading} = useWiredReading('in:value');

    const failed = reading && 'error' in reading;
    const value = reading && !failed ? reading.value : undefined;
    const type = reading && !failed ? reading.type : 'any';
    const title = data.label ?? 'Output';
    const shape = useMemo(() => (reading && !failed ? outputShape(value) : undefined), [reading, failed, value]);
    const tabular = shape !== undefined && shape.kind !== 'scalar';

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''} ${tabular ? outputStyles.tabular : ''}`}
            style={tabular ? undefined : {width: WIDTH}}
            data-testid={`output-node-${id}`}
            data-shape={shape?.kind}
        >
            <div className={styles.row}>
                <div className={styles.tile} style={{background: OUTPUT_COLOR}} aria-hidden>
                    <IconLogout2 size={19} stroke={2} />
                </div>
                <div className={styles.title}>
                    <strong className={styles.titleText}>{title}</strong>
                    {source && <span className={styles.fieldName}>{source}</span>}
                </div>
            </div>
            <TrackRow error={failed ? reading.error : undefined}>
                <Pin
                    id="in:value"
                    side="in"
                    type={type}
                    bound={source ? 'path' : undefined}
                    bad={failed}
                    title={source ? `${source} : ${type}` : 'Wire a result here'}
                />
                <div className={outputStyles.name}>value</div>
                <div
                    className={`${outputStyles.value} ${tabular ? outputStyles.summary : ''}`}
                    data-testid="output-value"
                    title={shape?.kind === 'scalar' ? shape.text : undefined}
                >
                    {shape ? shapeSummary(shape) : source ? (failed ? '' : '…') : '—'}
                </div>
            </TrackRow>
            {tabular && <OutputTable shape={shape} />}
        </div>
    );
}

/** A list, a list of records or a record as a table that scrolls inside the node. */
function OutputTable({shape}: {shape: Exclude<OutputShape, {kind: 'scalar'}>}): ReactElement {
    const {header, rows, total} = tableOf(shape);
    const shown = rows.slice(0, ROW_LIMIT);
    return (
        // `nodrag nowheel`: the wheel scrolls the table and a drag selects text, not the canvas.
        <div className={`${outputStyles.scroll} nodrag nowheel`}>
            <table className={outputStyles.table} data-testid="output-table">
                <thead>
                    <tr>
                        {header.map((name, index) => (
                            <th key={index} className={index === 0 ? outputStyles.key : undefined}>
                                {name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {shown.map(([key, cells], row) => (
                        <tr key={row}>
                            <th scope="row" className={outputStyles.key}>
                                {key}
                            </th>
                            {cells.map((cell, column) => {
                                const text = formatCell(cell);
                                return (
                                    <td key={column} className={outputStyles[cellKind(cell)]} title={text}>
                                        {text}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {total > shown.length && (
                <div className={outputStyles.more}>
                    {shown.length} of {total} rows
                </div>
            )}
        </div>
    );
}

// The header row and the body rows of a table; the first column holds the row number or the field name.
function tableOf(shape: Exclude<OutputShape, {kind: 'scalar'}>): {
    header: string[];
    rows: [string, unknown[]][];
    total: number;
} {
    switch (shape.kind) {
        case 'list':
            return {
                header: ['#', 'value'],
                rows: shape.items.map((item, index) => [String(index + 1), [item]]),
                total: shape.items.length,
            };
        case 'table':
            return {
                header: ['#', ...shape.columns],
                rows: shape.rows.map((record, index) => [
                    String(index + 1),
                    shape.columns.map((column) => record[column]),
                ]),
                total: shape.rows.length,
            };
        case 'record':
            return {
                header: ['field', 'value'],
                rows: shape.entries.map(([name, item]) => [name, [item]]),
                total: shape.entries.length,
            };
    }
}
