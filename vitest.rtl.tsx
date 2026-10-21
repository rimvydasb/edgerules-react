// Aliased over `@testing-library/react` in vitest.config.ts: components need a `MantineProvider`
// ancestor, so every `render`/`renderHook` is wrapped in one (`env="test"` turns off transitions and
// portal animation so menus and dialogs open synchronously). Everything else is re-exported as is.
import type {ReactElement, ReactNode} from 'react';
import {MantineProvider} from '@mantine/core';
import * as rtl from './node_modules/@testing-library/react/dist/index.js';

export * from './node_modules/@testing-library/react/dist/index.js';

function Providers({children}: {children: ReactNode}): ReactElement {
    return <MantineProvider env="test">{children}</MantineProvider>;
}

export const render: typeof rtl.render = (ui, options) => rtl.render(ui, {wrapper: Providers, ...options} as never);

export const renderHook: typeof rtl.renderHook = (callback, options) =>
    rtl.renderHook(callback, {wrapper: Providers, ...options} as never);
