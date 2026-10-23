import {useEffect, useRef, useState, type MutableRefObject, type ReactElement} from 'react';
import {isPortableError} from '#lib/portable';
import {CodeEditor, type CodeEditorService} from '../../code-editor';
import {useProjectSession, type ProjectSession} from '../../project-session';

// The Code view commits after this much time without an edit.
export const COMMIT_DELAY_MS = 500;

export interface CodeViewProps {
    root: string;
    languageService: CodeEditorService;
    readOnly?: boolean;
    drafts: Map<string, string>; // uncommitted code of context and function paths, kept across views and paths
    onCommitError: (root: string, message: string | undefined) => void; // context and function paths only
    flushRef: MutableRefObject<(() => void) | undefined>; // the Shell commits a pending edit before it navigates
}

function committedCode(session: ProjectSession, root: string): string {
    if (root === '*') return session.getDslDraft();
    const code = session.engine.getCode(root);
    return isPortableError(code) ? '' : code;
}

// Writes the code of a context or function path. `setCode` does not link, so a model that no longer links rolls
// back with the transaction.
function commitPath(session: ProjectSession, root: string, code: string): string | undefined {
    const result = session.transaction(() => {
        const written = session.engine.setCode(root, code);
        if (isPortableError(written)) throw new Error(written.message);
        session.engine.link();
    });
    return result.ok ? undefined : result.error.message;
}

/** The DSL code of the root path in a `CodeEditor`, committed after an idle time and before the Shell navigates. */
export function CodeView({
    root,
    languageService,
    readOnly,
    drafts,
    onCommitError,
    flushRef,
}: CodeViewProps): ReactElement {
    const session = useProjectSession();
    const [text, setText] = useState(() => drafts.get(root) ?? committedCode(session, root));
    const pending = useRef<string | undefined>(undefined);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // The latest props, so the timer and the unmount commit never use stale ones.
    const commit = useRef(() => {});
    commit.current = () => {
        clearTimeout(timer.current);
        timer.current = undefined;
        const code = pending.current;
        if (code === undefined) return;
        pending.current = undefined;
        if (root === '*') {
            // The session keeps an invalid draft and reports it in its snapshot.
            session.execute({type: 'commitDsl', source: code});
            return;
        }
        const message = code === committedCode(session, root) ? undefined : commitPath(session, root, code);
        if (message === undefined) drafts.delete(root);
        onCommitError(root, message);
    };

    useEffect(() => {
        const flush = () => commit.current();
        flushRef.current = flush;
        return () => {
            // Leaving the view or the path commits what is pending.
            flush();
            if (flushRef.current === flush) flushRef.current = undefined;
        };
    }, [flushRef]);

    const onChange = (code: string) => {
        setText(code);
        pending.current = code;
        if (root === '*') session.setDslDraft(code);
        else drafts.set(root, code);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => commit.current(), COMMIT_DELAY_MS);
    };

    return (
        <CodeEditor
            value={text}
            onChange={onChange}
            service={languageService}
            readOnly={readOnly}
            style={{height: '100%'}} // fills the Shell body
        />
    );
}
