export type ProjectErrorCode =
    | 'invalid-bundle' // the bundle does not match the schema
    | 'unsupported-format' // the bundle was written by a newer format version
    | 'invalid-model' // the DSL does not parse or link
    | 'invalid-locator' // the locator does not belong to this repository
    | 'not-found'
    | 'already-exists'
    | 'conflict' // the stored revision is not the expected one
    | 'invalid-state' // the session cannot do this now (disposed, invalid DSL draft, …)
    | 'command-failed'; // a project command failed and was rolled back

export class ProjectError extends Error {
    readonly code: ProjectErrorCode;
    readonly issues: readonly string[];

    constructor(code: ProjectErrorCode, message: string, options: {issues?: string[]; cause?: unknown} = {}) {
        super(message, {cause: options.cause});
        this.name = 'ProjectError';
        this.code = code;
        this.issues = options.issues ?? [];
    }
}

export function isProjectError(error: unknown, code?: ProjectErrorCode): error is ProjectError {
    return error instanceof ProjectError && (code === undefined || error.code === code);
}

// Engine calls report failure either by throwing or by returning a `PortableError`; both become a message.
export function messageOf(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'object' && error !== null && 'message' in error) return String(error.message);
    return String(error);
}
