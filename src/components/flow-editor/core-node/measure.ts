const UI_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MONO_FONT = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

export const FONTS = {
    title: `600 14px ${UI_FONT}`,
    field: `12px ${MONO_FONT}`,
    name: `14px ${UI_FONT}`,
    label: `600 11px ${UI_FONT}`,
    chip: `12.5px ${MONO_FONT}`,
    ret: `12px ${MONO_FONT}`,
    value: `13px ${MONO_FONT}`,
    placeholder: `italic 13px ${UI_FONT}`,
} as const;

let context: CanvasRenderingContext2D | null | undefined;

function canvasContext(): CanvasRenderingContext2D | null {
    if (context === undefined) {
        try {
            context = document.createElement('canvas').getContext('2d');
        } catch {
            context = null;
        }
    }
    return context;
}

/** Text width in px. Without a canvas (server rendering, tests) it estimates from the character count. */
export function measureText(text: string, font: string): number {
    const ctx = canvasContext();
    if (!ctx) return text.length * 7;
    ctx.font = font;
    return ctx.measureText(text).width;
}
