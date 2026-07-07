import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import type { CodeEditorService } from './service';

const COMPLETION_TYPES = new Set([
  'variable',
  'function',
  'type',
  'keyword',
  'property',
  'constant',
]);

/**
 * Completion source backed by the EdgeRules `completions()` service.
 *
 * The engine returns rank-ordered, unfiltered options (user scope > built-ins > keywords) plus
 * the replace range of the identifier prefix; CodeMirror's fuzzy matcher does the filtering.
 * Rank is preserved through descending `boost` values. Fires while typing an identifier or right
 * after `.`, and always on explicit request (Ctrl+Space).
 */
export function edgeRulesCompletionSource(
  getService: () => CodeEditorService,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const service = getService();
    const completions = service.completions?.bind(service);
    if (!completions) {
      return null;
    }

    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    const afterDot = context.matchBefore(/\.\s*/);
    if (!context.explicit && !word && !afterDot) {
      return null;
    }

    const doc = context.state.doc.toString();
    const result = completions(doc, context.pos);
    if (!result || result.options.length === 0) {
      return null;
    }

    const docLength = doc.length;
    const from = Math.max(0, Math.min(result.from, docLength));
    const to = Math.max(from, Math.min(result.to, docLength));

    const options: Completion[] = result.options.map((option, index) => ({
      label: option.label,
      type: option.type && COMPLETION_TYPES.has(option.type) ? option.type : undefined,
      detail: option.detail,
      boost: Math.max(-99, 99 - index),
    }));

    return {
      from,
      to,
      options,
      validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
    };
  };
}

/**
 * Autocompletion extension for EdgeRules: engine-backed suggestions while typing and on
 * Ctrl+Space / Cmd+Space (bound by `@codemirror/autocomplete`'s default keymap).
 */
export function edgeRulesCompletion(getService: () => CodeEditorService): Extension {
  return autocompletion({
    override: [edgeRulesCompletionSource(getService)],
    defaultKeymap: true,
    icons: true,
  });
}
