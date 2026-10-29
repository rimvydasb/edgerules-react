import {IconChartLine, IconLogout2} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {CHART_COLOR} from '../chart-node/ChartNode';
import {useModelReading} from '../core-node';
import type {FlowSelection} from '../editor/types';
import type {FlowEditorService} from '../flow-editor-types';
import {cellKind, formatCell, formatValue, isRecord} from '../output-node/outputShape';
import styles from './sinkSheet.module.css';

const OUTPUT_COLOR = '#2f9e44';
// A longer list or table shows its first rows and says how many it leaves out.
const ROW_LIMIT = 500;

export type SinkSelection = Extract<FlowSelection, {kind: 'output' | 'chart'}>;

export interface SinkSheetProps {
    service: FlowEditorService;
    sink: SinkSelection;
}

/**
 * The full value that flows into an Output or a Chart node, on the ruled sheet of the Boxed Editor: a header row with
 * the kind icon, the node title and the wired path, then one row per value. A record shows one row per field, a list
 * one row per item, and a list of records one table with a column per field. A nested record or list opens an
 * indented level under its row. The sheet reads again after every committed change of the service.
 */
export function SinkSheet({service, sink}: SinkSheetProps): ReactElement {
    const reading = useModelReading(service, sink.source);
    const chart = sink.kind === 'chart';
    const Icon = chart ? IconChartLine : IconLogout2;

    let body: ReactElement;
    if (!sink.source) {
        body = <div className={styles.message}>Wire a result into this node to see its data.</div>;
    } else if (!reading) {
        body = <div className={styles.message}>…</div>;
    } else if ('error' in reading) {
        body = (
            <div className={styles.error} role="alert">
                {reading.error}
            </div>
        );
    } else {
        body = (
            <>
                <div className={`${styles.row} ${styles.typeRow}`}>
                    <div className={styles.name}>type</div>
                    <div className={styles.type}>{reading.type}</div>
                </div>
                <ValueRows name="value" value={reading.value} depth={0} />
            </>
        );
    }

    return (
        <section className={styles.sheet} aria-label={`${chart ? 'Chart' : 'Output'} data`} data-testid="sink-sheet">
            <div className={`${styles.row} ${styles.header}`}>
                <div className={styles.icon} style={{background: chart ? CHART_COLOR : OUTPUT_COLOR}} aria-hidden>
                    <Icon size={19} stroke={2} />
                </div>
                <div className={styles.title}>
                    <strong>{sink.label ?? (chart ? 'Chart' : 'Output')}</strong>
                    {sink.source && <span className={styles.source}>{sink.source}</span>}
                </div>
            </div>
            {body}
        </section>
    );
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** The size of a nested value, in its own row above the level that lists it. */
function summary(value: unknown): string {
    if (Array.isArray(value)) return plural(value.length, 'item');
    if (isRecord(value)) return plural(Object.keys(value).length, 'field');
    return formatValue(value);
}

function isNested(value: unknown): boolean {
    return (Array.isArray(value) && value.length > 0) || (isRecord(value) && Object.keys(value).length > 0);
}

/** One row of `name` and `value`; a non-empty list or record adds an indented level of its items under the row. */
function ValueRows({name, value, depth}: {name: string; value: unknown; depth: number}): ReactElement {
    const nested = isNested(value);
    const indent = {paddingLeft: 12 + depth * 20};
    return (
        <>
            <div className={styles.row} data-depth={depth}>
                <div className={styles.name} style={indent} title={name}>
                    {name}
                </div>
                <div
                    className={`${styles.value} ${nested ? styles.summary : styles[cellKind(value)]}`}
                    title={nested ? undefined : formatValue(value)}
                >
                    {nested ? summary(value) : formatValue(value)}
                </div>
            </div>
            {nested && <NestedRows value={value} depth={depth + 1} />}
        </>
    );
}

function NestedRows({value, depth}: {value: unknown; depth: number}): ReactElement {
    if (Array.isArray(value)) {
        if (value.every(isRecord)) return <RecordTable records={value} depth={depth} />;
        const shown = value.slice(0, ROW_LIMIT);
        return (
            <>
                {shown.map((item, index) => (
                    <ValueRows key={index} name={`[${index + 1}]`} value={item} depth={depth} />
                ))}
                <More shown={shown.length} total={value.length} depth={depth} />
            </>
        );
    }
    return (
        <>
            {Object.entries(value as Record<string, unknown>).map(([field, item]) => (
                <ValueRows key={field} name={field} value={item} depth={depth} />
            ))}
        </>
    );
}

/** A list of records: one table row per record and one column per field name, in first-seen order. */
function RecordTable({records, depth}: {records: Record<string, unknown>[]; depth: number}): ReactElement {
    const columns = [...new Set(records.flatMap((record) => Object.keys(record)))];
    const shown = records.slice(0, ROW_LIMIT);
    return (
        // The table of the wired value itself spans the sheet; a nested table indents under its row.
        <div className={styles.tableRow} style={{paddingLeft: (depth - 1) * 20}}>
            <div className={styles.scroll}>
                <table className={styles.table} data-testid="sink-sheet-table">
                    <thead>
                        <tr>
                            <th className={styles.key}>#</th>
                            {columns.map((column) => (
                                <th key={column}>{column}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {shown.map((record, row) => (
                            <tr key={row}>
                                <th scope="row" className={styles.key}>
                                    {row + 1}
                                </th>
                                {columns.map((column) => {
                                    const cell = record[column];
                                    return (
                                        <td
                                            key={column}
                                            className={styles[cellKind(cell)]}
                                            title={cellKind(cell) === 'nested' ? formatValue(cell) : formatCell(cell)}
                                        >
                                            {formatCell(cell)}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <More shown={shown.length} total={records.length} depth={0} />
        </div>
    );
}

function More({shown, total, depth}: {shown: number; total: number; depth: number}): ReactElement | null {
    if (total <= shown) return null;
    return (
        <div className={styles.more} style={{paddingLeft: 12 + depth * 20}}>
            {shown} of {total} rows
        </div>
    );
}
