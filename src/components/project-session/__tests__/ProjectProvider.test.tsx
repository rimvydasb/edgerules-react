import 'fake-indexeddb/auto';
import {act, render, renderHook, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {ProjectProvider, useProjectSession, useProjectSlice, useProjectSnapshot} from '../react/ProjectProvider';
import type {ProjectSession} from '../session/types';
import {openFixtureProject} from '../testing/sessionFixture';

function wrapperFor(session: ProjectSession) {
    return ({children}: {children: React.ReactNode}) => <ProjectProvider session={session}>{children}</ProjectProvider>;
}

describe('ProjectProvider', () => {
    it('hands the stable session to descendants', async () => {
        const {session} = await openFixtureProject();
        const {result} = renderHook(() => useProjectSession(), {wrapper: wrapperFor(session)});
        expect(result.current).toBe(session);
    });

    it('throws outside a provider', () => {
        expect(() => renderHook(() => useProjectSession())).toThrow(/within a ProjectProvider/);
    });

    it('rerenders a slice consumer only when its slice changes', async () => {
        const {session} = await openFixtureProject();
        let renders = 0;
        function ModelVersion() {
            renders += 1;
            return <span>model {useProjectSlice('model').version}</span>;
        }
        render(
            <ProjectProvider session={session}>
                <ModelVersion />
            </ProjectProvider>,
        );
        expect(screen.getByText('model 0')).toBeInTheDocument();
        const initialRenders = renders;

        act(() => session.documentation.setDescription('decision', 'Not the model'));
        expect(renders).toBe(initialRenders);

        act(() => {
            session.engine.set('unused', {'@kind': 'expression', expression: '2'});
        });
        expect(screen.getByText('model 1')).toBeInTheDocument();
    });

    it('follows the session status', async () => {
        const {session} = await openFixtureProject();
        const {result} = renderHook(() => useProjectSnapshot(), {wrapper: wrapperFor(session)});
        expect(result.current.dirtySlices).toEqual([]);

        act(() => session.flow.setLayout({positions: {decision: {x: 1, y: 1}}, outputs: []}));
        expect(result.current.dirtySlices).toEqual(['flow']);

        await act(() => session.save());
        expect(result.current).toMatchObject({phase: 'ready', revision: '2', dirtySlices: []});
    });
});
