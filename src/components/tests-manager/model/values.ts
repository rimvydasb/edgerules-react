// Types whose cell text is bound/compared as the raw string itself — the engine's own ISO-8601
// wire form for temporal values, cast through the declared type on input and emitted unchanged on
// output (API_SPEC.md's value-serialization rules).
const PASSTHROUGH_STRING_TYPES = new Set(['string', 'date', 'time', 'datetime', 'duration', 'period']);

// A special value (`Missing('credit')`, `Invalid(number, 'x')`) reaches the host as a string
// regardless of the row's declared type — asserting one is just asserting that string.
const SPECIAL_VALUE_PATTERN = /^(Missing|Invalid|NotApplicable|Pending)\(/;

export class CellParseError extends Error {
  constructor(text: string, type: string | undefined) {
    super(`Cannot parse ${JSON.stringify(text)} as ${type ?? 'unknown type'}`);
    this.name = 'CellParseError';
  }
}

// Parses raw cell text per the row's declared type. Empty text means "not bound / not asserted"
// and always parses to `undefined`. Throws `CellParseError` for text that cannot be parsed for the
// given type — the cell is invalid and the row is not run until it is fixed.
export function parseCell(text: string, type: string | undefined): unknown {
  if (text === '') return undefined;
  if (SPECIAL_VALUE_PATTERN.test(text)) return text;

  if (type === undefined || PASSTHROUGH_STRING_TYPES.has(type)) {
    return text;
  }

  if (type === 'number') {
    const value = Number(text);
    if (Number.isNaN(value)) throw new CellParseError(text, type);
    return value;
  }

  if (type === 'boolean') {
    if (text === 'true') return true;
    if (text === 'false') return false;
    throw new CellParseError(text, type);
  }

  // 'array', a user-defined type, or 'any': the cell holds JSON.
  try {
    return JSON.parse(text);
  } catch {
    throw new CellParseError(text, type);
  }
}

// Renders an engine value for display. Special values (`Missing(...)`, `Invalid(...)`) and
// temporal values already arrive as strings and pass through unchanged; an array is summarized by
// its length rather than dumped as JSON, since a GUI cell has no room for one.
export function formatValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, index) => deepEqual(item, b[index]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a as Record<string, unknown>);
    const bKeys = Object.keys(b as Record<string, unknown>);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

// Whether `actual` (a `TestResult.value`) satisfies `expectedText` parsed per `type`. An empty
// expectation always matches — an empty Assertions cell asserts nothing and never renders red.
export function matches(expectedText: string, actual: unknown, type: string | undefined): boolean {
  if (expectedText === '') return true;
  let expected: unknown;
  try {
    expected = parseCell(expectedText, type);
  } catch {
    return false;
  }
  return deepEqual(expected, actual);
}
