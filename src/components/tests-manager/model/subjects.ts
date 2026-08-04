import { isPortableError } from '../../../lib/portable';
import type { MutableDecisionService, TestSubject } from '../tests-manager-types';

type PortableNodeLike = Record<string, unknown> & { '@kind'?: string };

function isRecord(value: unknown): value is PortableNodeLike {
  return typeof value === 'object' && value !== null;
}

// The engine reports an untyped callable parameter as the bare string `"any"` in a schema view.
// A row with no declared type has no parsing rule, so such a callable is not offered as a subject.
function hasOnlyTypedParameters(parameters: unknown): boolean {
  if (!isRecord(parameters)) return true;
  return Object.values(parameters).every((param) => param !== 'any');
}

// Recurses into `@kind: 'context'` nodes only — never into a `@body` — so a callable declared
// inside another callable's body is never reached: `get('*', 'ALL')` doesn't expose bodies at all.
function walkCallables(node: unknown, path: readonly string[], into: TestSubject[]): void {
  if (!isRecord(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@') || !isRecord(value)) continue;
    const kind = value['@kind'];
    const dottedPath = [...path, key].join('.');
    if (kind === 'context') {
      walkCallables(value, [...path, key], into);
    } else if (kind === 'function-schema' && hasOnlyTypedParameters(value['@parameters'])) {
      into.push({ id: dottedPath, kind: 'function', name: dottedPath });
    } else if (kind === 'ruleset-schema' && hasOnlyTypedParameters(value['@parameters'])) {
      into.push({ id: dottedPath, kind: 'ruleset', name: dottedPath });
    } else if (kind === 'loop-schema' && hasOnlyTypedParameters(value['@parameters'])) {
      into.push({ id: dottedPath, kind: 'loop', name: dottedPath });
    }
  }
}

// `optimise` declarations are root-only and absent from `FIELDS`/`ALL` entirely — their catalog
// row (the one carrying `@result`) lives only in the `EXTERNAL_DEFINITIONS` view.
function collectOptimiseSubjects(node: unknown): TestSubject[] {
  const subjects: TestSubject[] = [];
  if (!isRecord(node)) return subjects;
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@') || !isRecord(value)) continue;
    if (value['@kind'] === 'optimise' && hasOnlyTypedParameters(value['@parameters'])) {
      subjects.push({ id: key, kind: 'optimise', name: key });
    }
  }
  return subjects;
}

// `'*'` plus every fully typed callable — `func`/`ruleset`/`loop` at any context depth (the `ALL`
// view) and `optimise` (the `EXTERNAL_DEFINITIONS` view) — each excluded when it declares any
// untyped parameter.
export function listTestSubjects(service: MutableDecisionService): TestSubject[] {
  const portableRoot = service.toPortable();
  const modelName =
    typeof portableRoot['@model-name'] === 'string' ? (portableRoot['@model-name'] as string) : 'Model';

  const subjects: TestSubject[] = [{ id: '*', kind: 'model', name: modelName }];

  const allView = service.get('*', 'ALL');
  if (!isPortableError(allView)) {
    walkCallables(allView, [], subjects);
  }

  const externalView = service.get('*', 'EXTERNAL_DEFINITIONS');
  if (!isPortableError(externalView)) {
    subjects.push(...collectOptimiseSubjects(externalView));
  }

  return subjects;
}
