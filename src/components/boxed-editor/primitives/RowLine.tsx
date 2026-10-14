import type {ReactElement} from 'react';
import * as classes from '../boxedEditor.module.css';

/** Bottom border rendered above adjoining cell borders so row separators never double up. */
export function RowLine(): ReactElement {
    return <div aria-hidden="true" className={classes.rowLine} />;
}
