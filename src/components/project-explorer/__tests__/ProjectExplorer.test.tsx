import {describe, expect, it, vi} from 'vitest';
import {render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// A real, Node-loadable build of the same engine `@edgerules/web` ships to the browser — not a mock.
// `@edgerules/web`'s async, fetch-based `init()` isn't reliably usable under Vitest/Node, so tests exercise the
// identical engine core via this build.
import {MutableDecisionService} from '@edgerules/node/mutable';
import {ProjectExplorer} from '../ProjectExplorer';
import {MODEL_DSL} from '../testing/model.dsl';

function buildService(code = MODEL_DSL) {
    return MutableDecisionService.fromCode(code);
}

function sectionCount(label: string): string | null | undefined {
    return screen.getByText(label).nextSibling?.textContent;
}

describe('ProjectExplorer sections', () => {
    it('renders the five sections in order, expanded, with their member counts', () => {
        render(<ProjectExplorer service={buildService()} testSubjects={['*']} />);

        const tree = screen.getByRole('tree');
        const headers = within(tree)
            .getAllByRole('treeitem')
            .filter((item) => item.dataset.level === '1')
            .map((item) => item.querySelector('span span')?.textContent);
        expect(headers).toEqual(['Types', 'Methods', 'Variables', 'Workbooks', 'Tests']);
        expect(sectionCount('Types')).toBe('2');
        expect(sectionCount('Methods')).toBe('4');
        expect(sectionCount('Variables')).toBe('3');
        expect(sectionCount('Workbooks')).toBe('1');
        expect(sectionCount('Tests')).toBe('1');
        expect(screen.getAllByText('riskScore(...)')).toHaveLength(1);
    });

    it('filters the entries by the search, and hides the sections without matches', async () => {
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} testSubjects={['*']} />);

        await user.type(screen.getByRole('textbox', {name: 'Search project'}), 'DECI');
        expect(screen.getByText('decision')).toBeInTheDocument();
        expect(screen.getByText('loanBook')).toBeInTheDocument();
        expect(screen.queryByText('applicant')).toBeNull();
        expect(screen.queryByText('Types')).toBeNull();
        expect(sectionCount('Workbooks')).toBe('1');

        await user.clear(screen.getByRole('textbox', {name: 'Search project'}));
        await user.type(screen.getByRole('textbox', {name: 'Search project'}), 'nothing');
        expect(screen.getByText('No entries match “nothing”')).toBeInTheDocument();

        await user.click(screen.getByRole('button', {name: 'Clear search'}));
        expect(screen.getByText('Types')).toBeInTheDocument();
    });

    it('shows every method by its qualified path, nested ones included', () => {
        render(<ProjectExplorer service={buildService()} />);

        expect(screen.getByText('riskScore(...)')).toBeInTheDocument();
        expect(screen.getByText('risk(...)')).toBeInTheDocument();
        expect(screen.getByText('nested.deep()')).toBeInTheDocument();
        expect(screen.getByTestId('icon-service')).toBeInTheDocument();
    });

    it('expands a workbook to its nodes', async () => {
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} />);

        await user.click(screen.getByText('loanBook'));
        expect(screen.getByText('applicant')).toBeInTheDocument();
        expect(screen.getByText('decision')).toBeInTheDocument();
        expect(screen.getByText('result')).toBeInTheDocument();
        expect(screen.queryByText('helper')).toBeNull();
        expect(screen.getByTestId('icon-input-node')).toBeInTheDocument();
        expect(screen.getByTestId('icon-output-node')).toBeInTheDocument();
    });

    it('reads the model with two get() calls only, whatever is expanded', async () => {
        const service = buildService();
        const getSpy = vi.spyOn(service, 'get');
        const user = userEvent.setup();
        render(<ProjectExplorer service={service} />);
        expect(getSpy).toHaveBeenCalledTimes(2);

        await user.click(screen.getByText('loanBook'));
        expect(getSpy).toHaveBeenCalledTimes(2);
    });

    it('re-reads the model when the revision changes, keeping the sections expanded', () => {
        const service = buildService('{ a: 1; b: 2 }');
        const {rerender} = render(<ProjectExplorer service={service} revision={0} />);
        expect(screen.getByText('a')).toBeInTheDocument();

        service.remove('a');
        rerender(<ProjectExplorer service={service} revision={0} />);
        expect(screen.getByText('a')).toBeInTheDocument();

        rerender(<ProjectExplorer service={service} revision={1} />);
        expect(screen.queryByText('a')).toBeNull();
        expect(screen.getByText('b')).toBeInTheDocument();
    });

    it('keeps the sections when the model does not link', async () => {
        const user = userEvent.setup();
        const service = buildService();
        // `processApplication` and `loanBook.decision` still call it: an unresolved reference.
        service.remove('riskScore');
        expect(() => service.link()).toThrow();
        render(<ProjectExplorer service={service} testSubjects={['*']} />);

        expect(sectionCount('Types')).toBe('2');
        expect(sectionCount('Methods')).toBe('3');
        expect(sectionCount('Variables')).toBe('3');
        expect(sectionCount('Workbooks')).toBe('1');
        await user.click(screen.getByText('loanBook'));
        expect(screen.getByTestId('icon-input-node')).toBeInTheDocument();
        expect(screen.getByTestId('icon-output-node')).toBeInTheDocument();
    });
});

describe('ProjectExplorer open', () => {
    it.each([
        ['Types', 'Person', {kind: 'type', path: 'Person'}],
        ['Methods', 'nested.deep()', {kind: 'function', path: 'nested.deep'}],
        ['Methods', 'risk(...)', {kind: 'ruleset', path: 'risk'}],
        ['Variables', 'nested', {kind: 'context', path: 'nested'}],
        ['Variables', 'globalConst', {kind: 'variable', path: 'globalConst'}],
        ['Workbooks', 'loanBook', {kind: 'workbook', path: 'loanBook'}],
        ['Tests', 'Model', {kind: 'test', path: '*'}],
    ])('reports a click on %s › %s', async (section, label, target) => {
        const onOpen = vi.fn();
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} testSubjects={['*']} onOpen={onOpen} />);

        // A section header collapses and expands its section; it opens nothing.
        await user.click(screen.getByText(section));
        await user.click(screen.getByText(section));
        expect(onOpen).not.toHaveBeenCalled();
        await user.click(screen.getByText(label));
        expect(onOpen).toHaveBeenCalledWith(target);
    });

    it('reports a click on a node of a workbook', async () => {
        const onOpen = vi.fn();
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} onOpen={onOpen} />);

        await user.click(screen.getByText('loanBook'));
        await user.click(screen.getByText('decision'));
        expect(onOpen).toHaveBeenLastCalledWith({kind: 'function-node', path: 'loanBook.decision'});
    });
});

describe('ProjectExplorer create', () => {
    async function create(user: ReturnType<typeof userEvent.setup>, section: string, item?: string, name?: string) {
        await user.click(screen.getByRole('button', {name: `Add to ${section}`}));
        if (item) await user.click(await screen.findByRole('menuitem', {name: item}));
        const input = await screen.findByRole('textbox', {name: 'Name'});
        if (name !== undefined) {
            await user.clear(input);
            await user.type(input, name);
        }
        await user.click(screen.getByRole('button', {name: 'Create'}));
    }

    it.each([
        ['Types', undefined, 'NewType', {'@kind': 'type-definition'}, 'type'],
        ['Methods', 'Function', 'newFunction', {'@kind': 'function-schema'}, 'function'],
        ['Methods', 'Service', 'newService', {'@kind': 'function-schema', '@node': 'Service'}, 'service'],
        ['Methods', 'Ruleset', 'newRuleset', {'@kind': 'ruleset-schema'}, 'ruleset'],
        ['Variables', 'Value', 'newValue', {'@kind': 'type', type: 'number'}, 'variable'],
        ['Variables', 'Context', 'newContext', {'@kind': 'context'}, 'context'],
        ['Workbooks', undefined, 'newWorkbook', {'@kind': 'context', '@node': 'Workbook'}, 'workbook'],
    ])('creates a new entity of %s %s and opens it', async (section, item, name, node, kind) => {
        const service = buildService('{ a: 1 }');
        const onOpen = vi.fn();
        const user = userEvent.setup();
        render(<ProjectExplorer service={service} onOpen={onOpen} />);

        await create(user, section, item);

        const filter = kind === 'type' ? 'TYPE_DEFINITIONS' : undefined;
        expect(service.get(name, filter)).toMatchObject(node);
        expect(() => service.link()).not.toThrow();
        expect(onOpen).toHaveBeenCalledWith({kind, path: name});
        // The section expands and shows the new entry; a new ruleset has a `value` argument.
        const label =
            kind === 'ruleset' ? `${name}(...)` : kind === 'function' || kind === 'service' ? `${name}()` : name;
        expect(await screen.findByText(label)).toBeInTheDocument();
    });

    it('offers no input, output or chart node as a method', async () => {
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} />);

        await user.click(screen.getByRole('button', {name: 'Add to Methods'}));
        const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
        expect(items).toEqual(['Function', 'Service', 'Ruleset']);
    });

    it('refuses a name that is taken or not an identifier, and changes nothing', async () => {
        const service = buildService();
        const before = service.getCode('*');
        const onOpen = vi.fn();
        const user = userEvent.setup();
        render(<ProjectExplorer service={service} onOpen={onOpen} />);

        await create(user, 'Variables', 'Value', 'riskScore');
        expect(screen.getByText('"riskScore" already exists.')).toBeInTheDocument();

        const input = screen.getByRole('textbox', {name: 'Name'});
        await user.clear(input);
        await user.type(input, '2fast');
        await user.click(screen.getByRole('button', {name: 'Create'}));
        expect(screen.getByText(/A name starts with a letter/)).toBeInTheDocument();

        expect(service.getCode('*')).toBe(before);
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('proposes a free name', async () => {
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService('{ newWorkbook: 1 }')} />);

        await user.click(screen.getByRole('button', {name: 'Add to Workbooks'}));
        expect(await screen.findByRole('textbox', {name: 'Name'})).toHaveValue('newWorkbook2');
    });

    it('creates a test of a chosen subject through onCreateTest and opens it', async () => {
        const onCreateTest = vi.fn();
        const onOpen = vi.fn();
        const user = userEvent.setup();
        render(<ProjectExplorer service={buildService()} onCreateTest={onCreateTest} onOpen={onOpen} />);

        await user.click(screen.getByRole('button', {name: 'Add to Tests'}));
        const subjects = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
        expect(subjects).toEqual(['Model', 'nested.deep()', 'processApplication(...)', 'risk(...)', 'riskScore(...)']);

        await user.click(screen.getByRole('menuitem', {name: 'risk(...)'}));
        expect(onCreateTest).toHaveBeenCalledWith('risk');
        expect(onOpen).toHaveBeenCalledWith({kind: 'test', path: 'risk'});
    });

    it('lists a generic function as a disabled test subject, with its untyped arguments and why', async () => {
        const onCreateTest = vi.fn();
        const user = userEvent.setup();
        const service = buildService(`{
            func tierTotals(plan, tierName: string): { tier: tierName }
            func wealthBand(wealth: number): { band: wealth }
        }`);
        render(<ProjectExplorer service={service} onCreateTest={onCreateTest} />);

        await user.click(screen.getByRole('button', {name: 'Add to Tests'}));
        const generic = await screen.findByRole('menuitem', {name: /tierTotals/});
        expect(generic).toBeDisabled();
        expect(generic).toHaveTextContent('untyped: plan');
        expect(screen.getByRole('menuitem', {name: 'wealthBand(...)'})).toBeEnabled();
        expect(screen.getByTestId('explorer-untyped-hint')).toHaveTextContent(
            'Only functions with typed arguments can be tested.',
        );

        await user.click(generic);
        expect(onCreateTest).not.toHaveBeenCalled();
    });

    it('shows no add button when read-only, or where the service or host cannot create', () => {
        const {get} = buildService();
        const {rerender} = render(<ProjectExplorer service={{get}} />);
        expect(screen.queryByRole('button', {name: /^Add to/})).toBeNull();

        rerender(<ProjectExplorer service={buildService()} readOnly onCreateTest={() => {}} />);
        expect(screen.queryByRole('button', {name: /^Add to/})).toBeNull();
    });
});

describe('ProjectExplorer header', () => {
    it('renders a hide button only with onCollapsedChange', async () => {
        const onCollapsedChange = vi.fn();
        const user = userEvent.setup();
        const {rerender} = render(<ProjectExplorer service={buildService()} />);
        expect(screen.queryByRole('button', {name: 'Hide project explorer'})).toBeNull();

        rerender(<ProjectExplorer service={buildService()} onCollapsedChange={onCollapsedChange} />);
        await user.click(screen.getByRole('button', {name: 'Hide project explorer'}));
        expect(onCollapsedChange).toHaveBeenCalledWith(true);
    });

    it('shows a rail of section icons when collapsed; an icon expands only its section', async () => {
        const user = userEvent.setup();
        const service = buildService();
        const onCollapsedChange = vi.fn();
        const {rerender} = render(
            <ProjectExplorer service={service} collapsed onCollapsedChange={onCollapsedChange} />,
        );
        expect(screen.queryByRole('tree')).toBeNull();

        await user.click(screen.getByRole('button', {name: 'Show Workbooks'}));
        expect(onCollapsedChange).toHaveBeenCalledWith(false);

        rerender(<ProjectExplorer service={service} onCollapsedChange={onCollapsedChange} />);
        expect(screen.getByText('loanBook')).toBeInTheDocument();
        expect(screen.queryByText('Person')).toBeNull();
        expect(screen.queryByText('riskScore(...)')).toBeNull();
    });
});
