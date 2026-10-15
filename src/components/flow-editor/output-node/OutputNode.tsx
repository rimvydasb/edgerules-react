import {useNodeConnections, type NodeProps} from '@xyflow/react';
import {IconLogout2} from '@tabler/icons-react';
import {useEffect, useState, type ReactElement} from 'react';
import {Pin, TrackRow} from '../core-node';
import {useFlowEditor} from '../FlowEditorProvider';
import type {OutputNodeType, OutputReading} from './types';
import styles from '../core-node/coreNode.module.css';
import outputStyles from './outputNode.module.css';

const OUTPUT_COLOR = '#2f9e44';
const WIDTH = 240;

/** The model path a wire into the node reads: `out:level` of `decision` reads `decision.level`. */
export function sourcePath(nodeId: string, handleId: string | null | undefined): string {
    const name = handleId?.replace(/^out:/, '');
    return !name || name === '*' || name === 'result' ? nodeId : `${nodeId}.${name}`;
}

export function formatValue(value: unknown): string {
    return typeof value === 'string' ? `'${value}'` : (JSON.stringify(value) ?? String(value));
}

/**
 * The EdgeRules OutputNode: one value row with an input pin. It shows what the engine computes for the path that
 * is wired into it. It writes nothing to the model, so it has no menu and no inline edit.
 */
export function OutputNode({id, data, selected}: NodeProps<OutputNodeType>): ReactElement {
    const {service} = useFlowEditor();
    const [connection] = useNodeConnections({handleType: 'target', handleId: 'in:value'});
    const source = connection ? sourcePath(connection.source, connection.sourceHandle) : undefined;
    const [reading, setReading] = useState<OutputReading | undefined>();

    useEffect(() => {
        if (!source) {
            setReading(undefined);
            return;
        }
        let current = true;
        const refresh = () => {
            void service.readOutput(source).then((next) => {
                if (current) setReading(next);
            });
        };
        refresh();
        const unsubscribe = service.subscribe(refresh);
        return () => {
            current = false;
            unsubscribe();
        };
    }, [service, source]);

    const failed = reading && 'error' in reading;
    const type = reading && !failed ? reading.type : 'any';
    const title = data.label ?? 'Output';

    return (
        <div
            className={`${styles.node} ${selected ? styles.selected : ''}`}
            style={{width: WIDTH}}
            data-testid={`output-node-${id}`}
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
                    className={outputStyles.value}
                    data-testid="output-value"
                    title={reading && !failed ? formatValue(reading.value) : undefined}
                >
                    {reading && !failed ? formatValue(reading.value) : source ? (failed ? '' : '…') : '—'}
                </div>
            </TrackRow>
        </div>
    );
}
