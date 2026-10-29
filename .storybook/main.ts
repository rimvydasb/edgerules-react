import type {StorybookConfig} from '@storybook/react-vite';

const stories =
    process.env.BYPASS_BOXED_EDITOR_STORIES === '1'
        ? ['../stories/**/!(BoxedEditor).stories.@(ts|tsx)']
        : ['../stories/**/*.stories.@(ts|tsx)'];

const config: StorybookConfig = {
    framework: '@storybook/react-vite',
    stories,
    addons: [],
    // A `fixture` story is a starting state of an e2e spec, not a showcase: the sidebar hides it by default, the tag
    // filter shows it, and its URL always opens it.
    tags: {fixture: {defaultFilterSelection: 'exclude'}},
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
