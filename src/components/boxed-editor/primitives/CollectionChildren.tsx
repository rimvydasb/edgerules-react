import { useState, type ReactElement, type ReactNode } from 'react';
import Box from '@mui/material/Box';
import type { BoxedRenderNode } from '../boxed-model';

export function CollectionChildren({ path, children, renderItem }: { path: string; children: BoxedRenderNode[]; renderItem: (child: BoxedRenderNode) => ReactNode }): ReactElement {
  const [scrollTop, setScrollTop] = useState(0);
  if (children.length <= 100) return <>{children.map(renderItem)}</>;
  const rowHeight = 42;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const end = Math.min(children.length, start + 18);
  return <Box aria-label={`Virtualized rows ${path}`} onScroll={event => setScrollTop(event.currentTarget.scrollTop)} sx={{ maxHeight: 420, overflowY: 'auto' }}>
    <Box sx={{ height: children.length * rowHeight, position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: '0 auto auto 0', width: '100%', transform: `translateY(${start * rowHeight}px)` }}>
        {children.slice(start, end).map(renderItem)}
      </Box>
    </Box>
  </Box>;
}
