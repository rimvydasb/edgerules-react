import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// A real, Node-loadable build of the same engine `@edgerules/web` ships to the browser (see the
// plan's "WASM loading" note) — not a mock. `@edgerules/web`'s async, fetch-based `init()` isn't
// reliably usable under Vitest/Node, so tests exercise the identical engine core via this build.
import { MutableDecisionService } from '@edgerules/node/mutable';
import { ProjectExplorer } from './ProjectExplorer';
import { MODEL_DSL } from './testing/model.dsl';

function buildService() {
  return MutableDecisionService.fromCode(MODEL_DSL);
}

describe('ProjectExplorer', () => {
  it('renders Types, Variables, and ordered ctx/func/dt entries at the root, collapsed by default', () => {
    render(<ProjectExplorer service={buildService()} />);

    expect(screen.getByText('Types')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
    expect(screen.getByText('nested')).toBeInTheDocument();
    // `risk` is a `firstMatch` decision table in the DSL, and the real engine now projects
    // `@kind: 'invocation'` on `get()` (see docs/BUG_REPORTS.md, Bug 1 — fixed upstream), so it
    // renders as `[dt]` with the `risk()` label, same as a `[func]` leaf.
    expect(screen.getByText('risk()')).toBeInTheDocument();
    expect(screen.getByTestId('icon-dt')).toBeInTheDocument();

    // Collapsed: group contents not yet in the DOM.
    expect(screen.queryByText('globalConst')).not.toBeInTheDocument();
    expect(screen.queryByText('list')).not.toBeInTheDocument();
    expect(screen.queryByText('Person')).not.toBeInTheDocument();
  });

  it('expands Variables client-side with no additional get() call', async () => {
    const service = buildService();
    const getSpy = vi.spyOn(service, 'get');
    const user = userEvent.setup();
    render(<ProjectExplorer service={service} />);
    getSpy.mockClear();

    await user.click(screen.getByText('Variables'));

    expect(screen.getByText('globalConst')).toBeInTheDocument();
    expect(screen.getByText('list')).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('expands Types client-side with no additional get() call', async () => {
    const service = buildService();
    const getSpy = vi.spyOn(service, 'get');
    const user = userEvent.setup();
    render(<ProjectExplorer service={service} />);
    getSpy.mockClear();

    await user.click(screen.getByText('Types'));

    expect(screen.getByText('Person')).toBeInTheDocument();
    expect(screen.getByText('PeopleList')).toBeInTheDocument();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it('lazily fetches a [ctx] node exactly once, on first expansion, and caches it', async () => {
    const service = buildService();
    const getSpy = vi.spyOn(service, 'get');
    const user = userEvent.setup();
    render(<ProjectExplorer service={service} />);
    getSpy.mockClear();

    await user.click(screen.getByText('nested'));
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith('nested');

    // `get('nested')` now nests `deep()`'s function schema under `nested` correctly (see
    // docs/BUG_REPORTS.md, Bug 2 — fixed upstream), so expanding `nested` reveals it as a
    // `[func]` leaf.
    expect(screen.getByText('deep()')).toBeInTheDocument();

    // Collapse and re-expand: must not re-fetch an already-cached path.
    await user.click(screen.getByText('nested'));
    await user.click(screen.getByText('nested'));
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('fires onOpenVariables with the context path when clicking the group header or a leaf', async () => {
    const onOpenVariables = vi.fn();
    const user = userEvent.setup();
    render(<ProjectExplorer service={buildService()} onOpenVariables={onOpenVariables} />);

    await user.click(screen.getByText('Variables'));
    expect(onOpenVariables).toHaveBeenLastCalledWith('');

    await user.click(screen.getByText('globalConst'));
    expect(onOpenVariables).toHaveBeenLastCalledWith('');
  });

  it('fires onOpenTypes with no argument for the group and the type name for a leaf', async () => {
    const onOpenTypes = vi.fn();
    const user = userEvent.setup();
    render(<ProjectExplorer service={buildService()} onOpenTypes={onOpenTypes} />);

    await user.click(screen.getByText('Types'));
    expect(onOpenTypes).toHaveBeenLastCalledWith();

    await user.click(screen.getByText('Person'));
    expect(onOpenTypes).toHaveBeenLastCalledWith('Person');
  });

  it('fires onOpenFunction with the function path when clicking a [func] leaf', async () => {
    // A root-level function is unaffected by the nested-flattening gap above, so this exercises
    // the real click-through path end to end against the real engine.
    const service = MutableDecisionService.fromCode('{ func topFn(): 42 }');
    const onOpenFunction = vi.fn();
    const user = userEvent.setup();
    render(<ProjectExplorer service={service} onOpenFunction={onOpenFunction} />);

    await user.click(screen.getByText('topFn()'));
    expect(onOpenFunction).toHaveBeenCalledWith('topFn');
  });

  it('renders an error badge/tooltip and stops expanding once get() fails for a [ctx] node', async () => {
    const service = MutableDecisionService.fromCode('{ box: { a: 1 b: a + 1 } }');
    const user = userEvent.setup();
    render(<ProjectExplorer service={service} />);

    // A real CRUD edit that leaves the AST dirty (docs/PROJECT_EXPLORER_STORY.md's Error
    // Handling section) — not a mock. The broken reference only surfaces on the next `get()`.
    service.remove('box.a');

    await user.click(screen.getByText('box'));

    // Treated as a leaf: no children rendered despite the error.
    expect(screen.queryByText('b')).not.toBeInTheDocument();

    await user.hover(screen.getByTestId('icon-ctx'));
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/unresolved reference/i);
  });
});
