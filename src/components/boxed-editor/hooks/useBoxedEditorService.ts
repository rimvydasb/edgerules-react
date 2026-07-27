import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import type { BoxedEditorService } from '../boxed-editor-types';

export function useBoxedEditorService(): BoxedEditorService {
  return useBoxedEditorContext().service;
}
