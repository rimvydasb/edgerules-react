import type {ReactElement} from 'react';
import {cellKind, COLUMN_LIMIT, formatCell, ROW_LIMIT, type OutputShape} from './outputShape';
import styles from './valueTable.module.css';

const MORE = '…';

export type TableShape = Exclude<OutputShape, {kind: 'scalar'}>;

/**
 * A list, a list of records or a record as a table of at most ROW_LIMIT rows and COLUMN_LIMIT value columns. A
 * longer table ends with a row of `…`, a wider one with a column of `…`; an empty list shows one Empty row. The
 * OutputNode and the ListInputNode draw their data with it. `testId` prefixes the test ids of the table and of the
 * `…` row.
 */
export function ValueTable({shape, testId}: {shape: TableShape; testId: string}): ReactElement {
    const {header, rows} = tableOf(shape);
    const moreRows = rows.length > ROW_LIMIT;
    const moreColumns = header.length - 1 > COLUMN_LIMIT;
    const shownHeader = header.slice(0, COLUMN_LIMIT + 1);
    const span = shownHeader.length + (moreColumns ? 1 : 0);
    return (
        <div className={styles.tableBox}>
            <table className={styles.table} data-testid={`${testId}-table`}>
                <thead>
                    <tr>
                        {shownHeader.map((name, index) => (
                            <th key={index} className={index === 0 ? styles.key : undefined} title={name}>
                                {name}
                            </th>
                        ))}
                        {moreColumns && <th className={styles.more}>{MORE}</th>}
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <tr>
                            <td colSpan={span} className={styles.emptyRow}>
                                Empty
                            </td>
                        </tr>
                    )}
                    {rows.slice(0, ROW_LIMIT).map(([key, cells], row) => (
                        <tr key={row}>
                            <th scope="row" className={styles.key}>
                                {key}
                            </th>
                            {cells.slice(0, COLUMN_LIMIT).map((cell, column) => {
                                const text = formatCell(cell);
                                return (
                                    <td key={column} className={styles[cellKind(cell)]} title={text}>
                                        {text}
                                    </td>
                                );
                            })}
                            {moreColumns && <td className={styles.more}>{MORE}</td>}
                        </tr>
                    ))}
                    {moreRows && (
                        <tr data-testid={`${testId}-more-rows`}>
                            {Array.from({length: span}, (_, index) => (
                                <td key={index} className={`${styles.more} ${index === 0 ? styles.key : ''}`}>
                                    {MORE}
                                </td>
                            ))}
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

// The header row and the body rows of a table; the first column holds the row number or the field name.
function tableOf(shape: TableShape): {header: string[]; rows: [string, unknown[]][]} {
    switch (shape.kind) {
        case 'list':
            return {header: ['#', 'value'], rows: shape.items.map((item, index) => [String(index + 1), [item]])};
        case 'table':
            return {
                header: ['#', ...shape.columns],
                rows: shape.rows.map((record, index) => [
                    String(index + 1),
                    shape.columns.map((column) => record[column]),
                ]),
            };
        case 'record':
            return {header: ['field', 'value'], rows: shape.entries.map(([name, item]) => [name, [item]])};
    }
}
