import type {ReactElement, ReactNode} from 'react';
import styles from './coreNode.module.css';

/**
 * The node body is a grid of 40px rows split into two tracks: the input track (left, pins on the left edge) and the
 * output track (right, pins on the right edge). A node without inputs has only the output track.
 */

/** One body row. An `error` outlines the row and shows the message over its bottom edge. */
export function TrackRow({error, children}: {error?: string; children: ReactNode}): ReactElement {
    return (
        <div className={`${styles.row} ${error ? styles.rowError : ''}`}>
            {children}
            {error && (
                <span className={styles.errorMessage} role="alert">
                    {error}
                </span>
            )}
        </div>
    );
}

export function Track({width, children}: {width: number; children: ReactNode}): ReactElement {
    return (
        <div className={styles.track} style={{width}}>
            {children}
        </div>
    );
}

/** The uppercase band above a track: the noun in the singular for one row, in the plural otherwise. */
export function TrackBand({
    width,
    side,
    noun,
    count,
}: {
    width: number;
    side: 'in' | 'out';
    noun: string;
    count: number;
}): ReactElement {
    return (
        <div className={`${styles.track} ${styles.band} ${side === 'out' ? styles.bandOut : ''}`} style={{width}}>
            {count === 1 ? noun : `${noun}s`}
        </div>
    );
}

/** The hatched cell of a track that has fewer rows than the other track. */
export function TrackFiller({width}: {width: number}): ReactElement {
    return (
        <div className={styles.track} style={{width}}>
            <div className={styles.filler} />
        </div>
    );
}

/** The cell that holds a row name beside its pin. */
export function TrackName({
    side,
    title,
    className,
    children,
}: {
    side: 'in' | 'out';
    title?: string;
    className?: string;
    children: ReactNode;
}): ReactElement {
    return (
        <div
            className={`${styles.trackName} ${side === 'in' ? styles.inName : styles.outName} ${className ?? ''}`}
            title={title}
        >
            {children}
        </div>
    );
}

/** A row name that truncates with an ellipsis. */
export function TrackNameText({children}: {children: ReactNode}): ReactElement {
    return <span className={styles.nameText}>{children}</span>;
}

export function NodeEmptyState({children}: {children: ReactNode}): ReactElement {
    return <div className={styles.emptyBody}>{children}</div>;
}
