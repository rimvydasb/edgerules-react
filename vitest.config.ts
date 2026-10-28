import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {'@testing-library/react': fileURLToPath(new URL('./vitest.rtl.tsx', import.meta.url))},
    },
    test: {
        environment: 'jsdom',
        globals: false,
        setupFiles: ['./vitest.setup.ts'],
        include: ['src/**/*.test.{ts,tsx}', 'models/**/*.test.{ts,tsx}'],
        // Process CSS Modules (class names kept as written) so class- and style-based assertions are real.
        css: {include: /\.module\.css$/, modules: {classNameStrategy: 'non-scoped'}},
    },
});
