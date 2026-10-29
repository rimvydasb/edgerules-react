import highsLoader from 'highs';
import highsWasmUrl from 'highs/runtime?url';
import {
    mapHighsSolution,
    toCplexLp,
    type HighsSolutionLike,
    type LpOutcome,
    type LpProblem,
} from '@edgerules/web/mutable';
import type {ProjectEngine} from '../../src/components/project-session';

/** Registers highs-js as the engine's optimisation solver. EdgeRules ships none, so an `optimise` element needs it. */
export async function registerHighsSolver(engine: ProjectEngine): Promise<void> {
    const highs = await highsLoader({locateFile: () => highsWasmUrl});
    engine.registerSolver(
        (problem: LpProblem): LpOutcome => {
            const text = toCplexLp(problem);
            const options = problem.timeLimit === undefined ? {} : {time_limit: problem.timeLimit / 1000};
            return mapHighsSolution(highs.solve(text, options) as unknown as HighsSolutionLike, problem);
        },
        {name: 'highs-js'},
    );
}
