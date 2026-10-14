export type TypeKind = 'number' | 'string' | 'boolean' | 'date' | 'record' | 'any';

const DATE_TYPES = new Set(['date', 'time', 'datetime', 'duration', 'period']);

export function isListType(type: string): boolean {
    return type.endsWith('[]');
}

/** Color family of a type; a list takes the family of its element type. */
export function typeKind(type: string): TypeKind {
    const base = type.replace(/\[\]$/, '');
    if (base === 'any' || base === '') return 'any';
    if (base === 'number' || base === 'string' || base === 'boolean') return base;
    if (DATE_TYPES.has(base)) return 'date';
    return 'record';
}
