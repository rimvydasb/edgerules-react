export { edgeRules, edgeRulesLanguage, edgeRulesHighlighter } from './language';
export { highlightEdgeRules, type HighlightedSpan } from './highlight';
export { edgeRulesLint, toCodeMirrorDiagnostics } from './lint';
export { edgeRulesCompletion, edgeRulesCompletionSource } from './completion';
export { edgeRulesGoToDefinition, findDefinition, type DefinitionTarget } from './navigation';
export { formatEdgeRules, formatDocument, edgeRulesFormatKeymap } from './format';
export { edgeRulesExtensions, type EdgeRulesExtensionOptions } from './extensions';
export {
  embedService,
  type CodeEditorService,
  type CodeEditorDiagnosticsService,
  type CodeEditorDiagnostic,
  type CodeEditorCompletion,
  type CodeEditorCompletionResult,
  type CodeEditorEmbedContext,
} from './service';
