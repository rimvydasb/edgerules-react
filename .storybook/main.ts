import type { StorybookConfig } from '@storybook/react-vite';

const stories =
  process.env.BYPASS_BOXED_EDITOR_STORIES === '1'
    ? ['../stories/**/!(BoxedEditor).stories.@(ts|tsx)']
    : ['../stories/**/*.stories.@(ts|tsx)'];

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories,
  addons: [],
  async viteFinal(viteConfig) {
    // `@edgerules/web`'s wasm loader resolves its binary via `new URL('edgerules_wasm_bg.wasm',
    // import.meta.url)`. Vite's dependency pre-bundling (esbuild) rewrites that `import.meta.url`
    // to point into its `optimizeDeps` cache dir, but only copies JS there, not the wasm binary —
    // 404 on load. Excluding the package from pre-bundling keeps the URL pointing at its real
    // location in node_modules, where Vite's dev server serves it directly.
    viteConfig.optimizeDeps = {
      ...viteConfig.optimizeDeps,
      exclude: [...(viteConfig.optimizeDeps?.exclude ?? []), '@edgerules/web'],
    };
    return viteConfig;
  },
};

export default config;
