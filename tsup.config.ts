import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/code-editor/index': 'src/components/code-editor/index.ts',
    'components/code-editor-cell/index': 'src/components/code-editor-cell/index.ts',
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
    '@codemirror/autocomplete',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/highlight',
    '@emotion/react',
    '@emotion/styled',
    '@mui/material',
    '@mui/icons-material',
    '@mui/x-tree-view',
  ],
});
