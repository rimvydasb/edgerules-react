import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/code-editor/index': 'src/components/code-editor/index.ts',
    'components/project-explorer/index': 'src/components/project-explorer/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external: [
    'react',
    'react-dom',
    '@codemirror/lint',
    '@codemirror/state',
    '@codemirror/view',
    '@emotion/react',
    '@emotion/styled',
    '@mui/material',
    '@mui/icons-material',
    '@mui/x-tree-view',
  ],
});
