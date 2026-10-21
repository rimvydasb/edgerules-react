import {basename, dirname, resolve} from 'node:path';
import {build as esbuild} from 'esbuild';
import {defineConfig} from 'tsdown';
import type {Plugin} from 'rolldown';

const CSS_MODULE_PREFIX = '\0css-module:';

// Every `*.module.css` is compiled with esbuild's `local-css` loader — class names are scoped and
// exported by name, which is why sources use `import * as classes from './x.module.css'` — and its
// CSS is injected into <head> the first time the module loads. Consumers import no stylesheet of
// ours, only `@mantine/core/styles.css`.
function cssModules(): Plugin {
    return {
        name: 'css-modules',
        resolveId(source, importer) {
            if (!source.endsWith('.module.css')) return null;
            // Not ending in `.css`: tsdown's CSS guard rejects every id with that suffix.
            return `${CSS_MODULE_PREFIX}${resolve(importer ? dirname(importer) : process.cwd(), source)}.js`;
        },
        async load(id) {
            if (!id.startsWith(CSS_MODULE_PREFIX)) return null;
            const file = id.slice(CSS_MODULE_PREFIX.length, -'.js'.length);
            const entry = JSON.stringify(file);
            const result = await esbuild({
                stdin: {
                    contents: `import classes from ${entry}; export default classes;`,
                    resolveDir: dirname(file),
                    loader: 'js',
                },
                bundle: true,
                format: 'esm',
                write: false,
                outdir: 'out',
                loader: {'.css': 'local-css'},
                logLevel: 'silent',
            });
            const js = result.outputFiles.find((output) => output.path.endsWith('.js'))?.text ?? '';
            // The bundled stub only maps local class name -> scoped name; evaluate it to read the map.
            const mapping = (await import(`data:text/javascript,${encodeURIComponent(js)}`)).default as Record<
                string,
                string
            >;
            const exports = Object.entries(mapping)
                .map(([name, scoped]) => `export const ${name} = ${JSON.stringify(scoped)};`)
                .join('\n');
            const css = result.outputFiles.find((output) => output.path.endsWith('.css'))?.text ?? '';
            const styleId = JSON.stringify(basename(file));
            const inject = `
(function (css, id) {
  if (typeof document === 'undefined' || document.querySelector('style[data-edgerules-css=' + JSON.stringify(id) + ']')) return;
  var style = document.createElement('style');
  style.setAttribute('data-edgerules-css', id);
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
})(${JSON.stringify(css)}, ${styleId});
`;
            return {
                code: `${exports}\nexport default { ${Object.keys(mapping).join(', ')} };\n${inject}`,
                moduleType: 'js',
            };
        },
    };
}

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'components/code-editor/index': 'src/components/code-editor/index.ts',
        'components/code-editor-cell/index': 'src/components/code-editor-cell/index.ts',
        'components/project-explorer/index': 'src/components/project-explorer/index.ts',
        'components/decision-table/index': 'src/components/decision-table/index.ts',
        'components/boxed-editor/index': 'src/components/boxed-editor/index.ts',
        'components/test-cases-service/index': 'src/components/test-cases-service/index.ts',
        'components/documentation-service/index': 'src/components/documentation-service/index.ts',
        'components/tests-manager/index': 'src/components/tests-manager/index.ts',
        'components/flow-editor/index': 'src/components/flow-editor/index.ts',
        'components/project-session/index': 'src/components/project-session/index.ts',
    },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: true,
    clean: true,
    plugins: [cssModules()],
    // `dependencies` and `peerDependencies` are external by default; the dnd-kit packages are listed
    // so they stay out of the bundle either way.
});
