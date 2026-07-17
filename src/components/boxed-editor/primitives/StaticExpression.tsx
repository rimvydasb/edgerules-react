import { useMemo, type ReactElement } from 'react';
import Box from '@mui/material/Box';
import type { PortableNode } from '@edgerules/portable';
import { highlightEdgeRules } from '../../code-editor/language/highlight';
import { expressionText } from '../boxed-editor-utils';

export function StaticExpression({ value }: { value: PortableNode }): ReactElement {
  const text = expressionText(value);
  const spans = useMemo(() => highlightEdgeRules(text), [text]);
  return <Box component="code" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
    {spans.map((span, index) => span.className
      ? <span key={`${span.text}-${index}`} className={span.className}>{span.text}</span>
      : span.text)}
  </Box>;
}
