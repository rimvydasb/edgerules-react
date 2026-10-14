import { basename, dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';
import { defineConfig, type Options } from 'tsup';

// tsup's built-in CSS handling (PostCSS, no scoping) claims every `.css` file of the default
// namespace, so `*.module.css` is moved to its own namespace here. Each module is compiled with
// esbuild's `local-css` loader — class names are scoped and exported by name, which is why sources
// use `import * as classes from './x.module.css'` — and its CSS is injected into <head> the first
// time the module loads. Consumers import no stylesheet of ours, only `@mantine/core/styles.css`.
function cssModules(): NonNullable<Options['esbuildPlugins']>[number] {
  return {
    name: 'css-modules',
    setup(build) {
      build.onResolve({ filter: /\.module\.css$/ }, (args) => ({
        // Not ending in `.css`: tsup's PostCSS plugin matches every namespace by that suffix.
        path: `${resolve(args.resolveDir, args.path)}.js`,
        namespace: 'css-module',
      }));
      build.onLoad({ filter: /.*/, namespace: 'css-module' }, async (args) => {
        const file = args.path.slice(0, -'.js'.length);
        const entry = JSON.stringify(file);
        const result = await esbuild({
          stdin: { contents: `import classes from ${entry}; export default classes;`, resolveDir: dirname(file), loader: 'js' },
          bundle: true,
          format: 'esm',
          write: false,
          outdir: 'out',
          loader: { '.css': 'local-css' },
          minify: build.initialOptions.minify,
          logLevel: 'silent',
        });
        const js = result.outputFiles.find((file) => file.path.endsWith('.js'))?.text ?? '';
        // The bundled stub only maps local class name -> scoped name; evaluate it to read the map.
        const mapping = (await import(`data:text/javascript,${encodeURIComponent(js)}`)).default as Record<string, string>;
        const exports = Object.entries(mapping)
          .map(([name, scoped]) => `export const ${name} = ${JSON.stringify(scoped)};`)
          .join('\n');
        const css = result.outputFiles.find((file) => file.path.endsWith('.css'))?.text ?? '';
        const id = JSON.stringify(basename(file));
        const inject = `
(function (css, id) {
  if (typeof document === 'undefined' || document.querySelector('style[data-edgerules-css=' + JSON.stringify(id) + ']')) return;
  var style = document.createElement('style');
  style.setAttribute('data-edgerules-css', id);
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})(${JSON.stringify(css)}, ${id});
`;
        return { contents: `${exports}\nexport default { ${Object.keys(mapping).map((name) => name).join(', ')} };\n${inject}`, loader: 'js', resolveDir: dirname(file) };
      });
    },
  };
}

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'components/code-editor/index': 'src/components/code-editor/index.ts',
    'components/code-editor-cell/index':
      'src/components/code-editor-cell/index.ts',
    'components/project-explorer/index':
      'src/components/project-explorer/index.ts',
    'components/decision-table/index': 'src/components/decision-table/index.ts',
    'components/boxed-editor/index': 'src/components/boxed-editor/index.ts',
    'components/test-cases-service/index': 'src/components/test-cases-service/index.ts',
    'components/documentation-service/index': 'src/components/documentation-service/index.ts',
    'components/tests-manager/index': 'src/components/tests-manager/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  // CSS Modules (`*.module.css`) are bundled into the JS and injected at runtime, so consumers import
  // no stylesheet of ours — only `@mantine/core/styles.css`.
  injectStyle: true,
  esbuildPlugins: [cssModules()],
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
    '@mantine/core',
    '@mantine/hooks',
    '@tabler/icons-react',
    '@dnd-kit/core',
    '@dnd-kit/sortable',
    '@dnd-kit/utilities',
  ],
});
