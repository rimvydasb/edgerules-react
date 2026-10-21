import {ProjectError} from '../errors';
import {PROJECT_FORMAT_VERSION, type ProjectBundle, type ProjectLocator} from './types';

type Raw = Record<string, unknown>;

// Upgrades a bundle of format version N (the key) to N + 1. Pure and ordered.
export type ProjectMigrations = Record<number, (bundle: Record<string, unknown>) => Record<string, unknown>>;

// Empty until format 2 exists.
const MIGRATIONS: ProjectMigrations = {};

const SECTIONS = new Set(['inputs', 'assertions', 'validations']);
const PROVIDERS = new Set(['indexeddb', 'github', 's3']);

function isRecord(value: unknown): value is Raw {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Collects every schema violation with its JSON path, so one error lists them all.
class Checker {
    readonly issues: string[] = [];

    record(value: unknown, at: string): value is Raw {
        if (isRecord(value)) return true;
        this.issues.push(`${at}: expected an object`);
        return false;
    }

    array(value: unknown, at: string): value is unknown[] {
        if (Array.isArray(value)) return true;
        this.issues.push(`${at}: expected an array`);
        return false;
    }

    string(value: unknown, at: string, {optional = false, nonEmpty = false} = {}): void {
        if (optional && value === undefined) return;
        if (typeof value !== 'string' || (nonEmpty && value === '')) {
            this.issues.push(`${at}: expected a ${nonEmpty ? 'non-empty ' : ''}string`);
        }
    }

    number(value: unknown, at: string, {optional = false} = {}): void {
        if (optional && value === undefined) return;
        if (typeof value !== 'number' || !Number.isFinite(value)) this.issues.push(`${at}: expected a number`);
    }

    boolean(value: unknown, at: string, {optional = false} = {}): void {
        if (optional && value === undefined) return;
        if (typeof value !== 'boolean') this.issues.push(`${at}: expected a boolean`);
    }

    equals(value: unknown, expected: unknown, at: string): void {
        if (value !== expected) this.issues.push(`${at}: expected ${JSON.stringify(expected)}`);
    }

    stringMap(value: unknown, at: string): void {
        if (!this.record(value, at)) return;
        for (const [key, entry] of Object.entries(value)) this.string(entry, `${at}.${key}`);
    }
}

function checkManifest(c: Checker, manifest: unknown): void {
    if (!c.record(manifest, 'manifest')) return;
    c.equals(manifest.kind, 'EdgeRulesProject', 'manifest.kind');
    c.string(manifest.projectId, 'manifest.projectId', {nonEmpty: true});
    c.string(manifest.name, 'manifest.name', {nonEmpty: true});
    c.string(manifest.description, 'manifest.description', {optional: true});
    if (manifest.tags !== undefined && c.array(manifest.tags, 'manifest.tags')) {
        manifest.tags.forEach((tag, i) => c.string(tag, `manifest.tags[${i}]`));
    }
    if (c.record(manifest.model, 'manifest.model')) {
        c.equals(manifest.model.format, 'dsl', 'manifest.model.format');
        c.string(manifest.model.source, 'manifest.model.source', {nonEmpty: true});
    }
}

function checkDocumentation(c: Checker, documentation: unknown): void {
    if (!c.record(documentation, 'documentation')) return;
    c.equals(documentation.schemaVersion, 1, 'documentation.schemaVersion');
    c.stringMap(documentation.byPath, 'documentation.byPath');
}

function checkTests(c: Checker, tests: unknown): void {
    if (!c.record(tests, 'tests')) return;
    c.equals(tests.schemaVersion, 1, 'tests.schemaVersion');
    if (!c.record(tests.subjects, 'tests.subjects')) return;
    for (const [subjectId, suite] of Object.entries(tests.subjects)) {
        const at = `tests.subjects.${subjectId}`;
        if (!c.record(suite, at)) continue;
        if (c.array(suite.cases, `${at}.cases`)) {
            suite.cases.forEach((testCase, i) => {
                const caseAt = `${at}.cases[${i}]`;
                if (!c.record(testCase, caseAt)) return;
                c.string(testCase.id, `${caseAt}.id`, {nonEmpty: true});
                c.string(testCase.name, `${caseAt}.name`);
                c.number(testCase.order, `${caseAt}.order`);
                c.stringMap(testCase.inputs, `${caseAt}.inputs`);
                c.stringMap(testCase.assertions, `${caseAt}.assertions`);
            });
        }
        if (c.array(suite.rows, `${at}.rows`)) {
            suite.rows.forEach((row, i) => {
                const rowAt = `${at}.rows[${i}]`;
                if (!c.record(row, rowAt)) return;
                c.string(row.path, `${rowAt}.path`);
                if (!SECTIONS.has(row.section as string)) c.issues.push(`${rowAt}.section: expected a test section`);
                c.number(row.order, `${rowAt}.order`);
                c.string(row.type, `${rowAt}.type`, {optional: true});
                c.boolean(row.present, `${rowAt}.present`);
                c.boolean(row.custom, `${rowAt}.custom`, {optional: true});
            });
        }
    }
}

function checkCanvasNodes(c: Checker, nodes: unknown, at: string): void {
    if (!c.array(nodes, at)) return;
    nodes.forEach((node, i) => {
        if (!c.record(node, `${at}[${i}]`)) return;
        c.string(node.id, `${at}[${i}].id`, {nonEmpty: true});
        c.string(node.label, `${at}[${i}].label`, {optional: true});
        if (node.source !== undefined && c.record(node.source, `${at}[${i}].source`)) {
            c.string(node.source.node, `${at}[${i}].source.node`);
            c.string(node.source.handle, `${at}[${i}].source.handle`);
        }
    });
}

function checkFlow(c: Checker, flow: unknown): void {
    if (!c.record(flow, 'flow')) return;
    c.equals(flow.schemaVersion, 1, 'flow.schemaVersion');
    const layout = flow.layout;
    if (!c.record(layout, 'flow.layout')) return;
    if (c.record(layout.positions, 'flow.layout.positions')) {
        for (const [id, position] of Object.entries(layout.positions)) {
            if (!c.record(position, `flow.layout.positions.${id}`)) continue;
            c.number(position.x, `flow.layout.positions.${id}.x`);
            c.number(position.y, `flow.layout.positions.${id}.y`);
        }
    }
    checkCanvasNodes(c, layout.outputs, 'flow.layout.outputs');
    if (layout.charts !== undefined) checkCanvasNodes(c, layout.charts, 'flow.layout.charts');
}

function migrate(bundle: Raw, migrations: ProjectMigrations, currentVersion: number): Raw {
    const manifest = isRecord(bundle.manifest) ? bundle.manifest : {};
    let version = manifest.formatVersion;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        throw new ProjectError('invalid-bundle', 'Invalid project bundle', {
            issues: ['manifest.formatVersion: expected a positive integer'],
        });
    }
    if (version > currentVersion) {
        throw new ProjectError(
            'unsupported-format',
            `Project format ${version} is newer than the supported format ${currentVersion}; upgrade edgerules-react`,
        );
    }
    let migrated = bundle;
    while (version < currentVersion) {
        const step = migrations[version];
        if (!step) throw new ProjectError('unsupported-format', `No migration from project format ${version}`);
        migrated = step(migrated);
        version += 1;
        if (isRecord(migrated.manifest)) migrated.manifest.formatVersion = version;
    }
    return migrated;
}

/**
 * Migrates `value` to the current format version, checks it against the schema and returns a copy that shares
 * nothing with `value`. Throws `ProjectError` with code `invalid-bundle` (listing every issue) or
 * `unsupported-format` (written by a newer format). Does not check the DSL itself; the engine does.
 */
// `migrations` and `currentVersion` exist for tests of the migration chain.
export function parseProjectBundle(
    value: unknown,
    migrations: ProjectMigrations = MIGRATIONS,
    currentVersion = PROJECT_FORMAT_VERSION,
): ProjectBundle {
    if (!isRecord(value)) throw new ProjectError('invalid-bundle', 'Invalid project bundle: expected an object');
    const bundle = migrate(structuredClone(value), migrations, currentVersion);
    const c = new Checker();
    checkManifest(c, bundle.manifest);
    c.string(bundle.model, 'model');
    checkDocumentation(c, bundle.documentation);
    checkTests(c, bundle.tests);
    checkFlow(c, bundle.flow);
    if (c.issues.length > 0) {
        throw new ProjectError('invalid-bundle', `Invalid project bundle: ${c.issues[0]}`, {issues: c.issues});
    }
    return bundle as unknown as ProjectBundle;
}

export function parseProjectLocator(value: unknown): ProjectLocator {
    const c = new Checker();
    if (c.record(value, 'locator')) {
        if (!PROVIDERS.has(value.provider as string))
            c.issues.push('locator.provider: expected indexeddb, github or s3');
        c.string(value.resource, 'locator.resource', {nonEmpty: true});
        c.string(value.projectPath, 'locator.projectPath', {nonEmpty: true});
    }
    if (c.issues.length > 0) {
        throw new ProjectError('invalid-locator', `Invalid project locator: ${c.issues[0]}`, {issues: c.issues});
    }
    const {provider, resource, projectPath} = value as unknown as ProjectLocator;
    return {provider, resource, projectPath};
}
