import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { DecisionTableEditor } from '../DecisionTableEditor';
import {
  BEST_MATCH_MODEL_DSL,
  RISK_MODEL_DSL,
  SCORECARD_MODEL_DSL,
} from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const languageService = MutableDecisionService;

function renderRisk(extraProps: Partial<Parameters<typeof DecisionTableEditor>[0]> = {}) {
  const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
  const utils = render(
    <DecisionTableEditor service={service} path="risk" languageService={languageService} {...extraProps} />,
  );
  return { service, ...utils };
}

function queryCmContent(container: HTMLElement): HTMLElement {
  const editable = container.querySelector('.cm-content[contenteditable="true"]');
  if (!editable) {
    throw new Error('Expected an active CodeEditorCell');
  }
  return editable as HTMLElement;
}

/** Finds a display cell by its full text — highlighted cells split text across token spans. */
function cellByText(scope: HTMLElement, text: string): HTMLElement {
  const cell = Array.from(scope.querySelectorAll('[role="button"]')).find(
    (element) => element.textContent === text,
  );
  if (!cell) {
    throw new Error(`No display cell with text ${JSON.stringify(text)}`);
  }
  return cell as HTMLElement;
}

describe('DecisionTableEditor rendering', () => {
  it('renders input and output columns with type labels', () => {
    renderRisk();
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);
    expect(headers.join(' ')).toContain('age');
    expect(headers.join(' ')).toContain('income');
    expect(headers.join(' ')).toContain('segment');
    expect(headers.join(' ')).toContain('level');
    expect(headers.join(' ')).toContain('limit');
    expect(headers.join(' ')).toContain('annotation');
  });

  it('re-sugars unary tests for display and shows – for any', () => {
    const { container } = renderRisk();
    expect(container.textContent).toContain('18..25');
    expect(container.textContent).toContain('< 30000');
    expect(container.textContent).toContain('"retail"');
    // Row 2 omits the segment column → rendered as the matches-all dash.
    expect(container.textContent).toContain('–');
  });

  it('renders a boolean-expression when as a row-spanning cell', () => {
    const { container } = renderRisk();
    expect(container.textContent).toContain('age >= 65 or segment = "premium"');
    const spanning = container.querySelector('td[colspan="3"]');
    expect(spanning).not.toBeNull();
  });

  it('renders the pinned default row', () => {
    const { container } = renderRisk();
    expect(container.textContent).toContain('default');
    expect(container.textContent).toContain("'none'");
  });

  it('shows the hit policy and statically highlighted cells without mounting CodeMirror', () => {
    const { container } = renderRisk();
    expect(screen.getByLabelText('Hit policy')).toBeDefined();
    expect(container.querySelector('.tok-number')).not.toBeNull();
    expect(container.querySelector('.cm-editor')).toBeNull();
  });

  it('detects a scorecard: one score column and a scorecard badge', () => {
    const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
    const { container } = render(
      <DecisionTableEditor service={service} path="scoreFactors" languageService={languageService} />,
    );
    expect(container.textContent).toContain('scorecard');
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('score'))).toBe(true);
  });

  it('shows a priority column for best-match', () => {
    const service = MutableDecisionService.fromCode(BEST_MATCH_MODEL_DSL);
    const { container } = render(
      <DecisionTableEditor service={service} path="tier" languageService={languageService} />,
    );
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('priority'))).toBe(true);
    expect(container.textContent).toContain('1');
    expect(container.textContent).toContain('2');
  });

  it('renders an error for a path that is not a ruleset', () => {
    const service = MutableDecisionService.fromCode(RISK_MODEL_DSL);
    render(<DecisionTableEditor service={service} path="nonexistent" />);
    expect(screen.getByRole('alert').textContent).toContain('nonexistent');
  });

  it('hides editing affordances when readOnly', () => {
    renderRisk({ readOnly: true });
    expect(screen.queryByRole('button', { name: /add rule/i })).toBeNull();
    expect(screen.queryByLabelText('rule 1 menu')).toBeNull();
  });
});

describe('DecisionTableEditor editing', () => {
  it('edits an output cell through the engine and fires onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { service, container } = renderRisk({ onChange });

    const limitCell = cellByText(container.querySelectorAll('tbody tr')[0] as HTMLElement, '1000');
    await user.dblClick(limitCell);

    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}1500{Enter}');

    await waitFor(() => {
      expect(service.execute('decision')).toEqual({ level: 'high', limit: 1500 });
    });
    expect(onChange).toHaveBeenCalled();
    // Editor unmounts after commit; the display shows the new value.
    expect(container.querySelector('.cm-editor')).toBeNull();
    expect(container.textContent).toContain('1500');
  });

  it('edits a when cell with unary-test sugar', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
    await user.dblClick(cellByText(firstRow, '18..25'));

    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}21..30{Enter}');

    await waitFor(() => {
      expect(container.textContent).toContain('21..30');
    });
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1000 });
  });

  it('clearing a when cell means matches-any', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
    await user.dblClick(cellByText(firstRow, '< 30000'));
    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}{Backspace}{Enter}');

    await waitFor(() => {
      expect(container.querySelector('.cm-editor')).toBeNull();
    });
    const definition = service.get('risk.*') as { '@rules': Array<{ when?: Record<string, string> }> };
    expect(definition['@rules'][0].when).not.toHaveProperty('income');
  });

  it('restores the model and surfaces the engine error when an edit is rejected', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
    await user.dblClick(cellByText(firstRow, '18..25'));
    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}"not a number test"{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined();
    });
    // The failed edit must not poison the model (docs/BUG_REPORTS.md #2).
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1000 });
    expect(container.textContent).toContain('18..25');
  });

  it('adds and deletes a rule row', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    await user.click(screen.getByRole('button', { name: /add rule/i }));
    await waitFor(() => {
      expect((service.get('risk.*') as { '@rules': unknown[] })['@rules']).toHaveLength(4);
    });

    await user.click(screen.getByLabelText('rule 4 menu'));
    await user.click(screen.getByRole('menuitem', { name: /delete rule/i }));
    await waitFor(() => {
      expect((service.get('risk.*') as { '@rules': unknown[] })['@rules']).toHaveLength(3);
    });
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3 + 1 + 1); // rules + default + add-rule
  });

  it('reorders rules with move down', async () => {
    const user = userEvent.setup();
    const { service } = renderRisk();

    await user.click(screen.getByLabelText('rule 1 menu'));
    await user.click(screen.getByRole('menuitem', { name: /move down/i }));

    await waitFor(() => {
      const definition = service.get('risk.*') as {
        '@rules': Array<{ then: Record<string, unknown> }>;
      };
      expect(definition['@rules'][0].then.level).toBe("'medium'");
    });
  });

  it('changes the hit policy to best-match and gains a priority column', async () => {
    const user = userEvent.setup();
    const { service } = renderRisk();

    await user.click(screen.getByLabelText('Hit policy'));
    await user.click(screen.getByRole('option', { name: /best match/i }));

    await waitFor(() => {
      expect((service.get('risk.*') as { '@hitPolicy': string })['@hitPolicy']).toBe('best-match');
    });
    const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent ?? '');
    expect(headers.some((text) => text.includes('priority'))).toBe(true);
  });

  it('edits the default row through the engine', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    const rows = container.querySelectorAll('tbody tr');
    const defaultRow = rows[rows.length - 2] as HTMLElement; // last data row before add-rule
    await user.dblClick(cellByText(defaultRow, '0'));
    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}99{Enter}');

    await waitFor(() => {
      const definition = service.get('risk.*') as { '@default': Record<string, unknown> };
      expect(definition['@default'].limit).toBe(99);
    });
  });

  it('edits the annotation (rule name)', async () => {
    const user = userEvent.setup();
    const { service, container } = renderRisk();

    const firstRow = container.querySelectorAll('tbody tr')[0] as HTMLElement;
    const cells = firstRow.querySelectorAll('td');
    const annotationCell = cells[cells.length - 2] as HTMLElement; // before the row-menu cell
    await user.dblClick(annotationCell.querySelector('[role="button"]') as HTMLElement);
    await user.keyboard('young low income{Enter}');

    await waitFor(() => {
      const definition = service.get('risk.*') as { '@rules': Array<{ name?: string }> };
      expect(definition['@rules'][0].name).toBe('young low income');
    });
  });

  it('adds an input column via the table menu without breaking the existing call site', async () => {
    const user = userEvent.setup();
    const { service } = renderRisk();

    await user.click(screen.getByLabelText('table menu'));
    await user.click(screen.getByRole('menuitem', { name: /add input column/i }));
    await user.type(screen.getByLabelText('Parameter name'), 'channel');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      const definition = service.get('risk.*') as {
        '@parameters': Record<string, unknown>;
      };
      expect(definition['@parameters']).toHaveProperty('channel');
    });
    // The `decision` call site still only passes age/income/segment — the new
    // defaulted parameter must not break it.
    expect(service.execute('decision')).toEqual({ level: 'high', limit: 1000 });
  });

  it('adds an output column via the table menu', async () => {
    const user = userEvent.setup();
    const { service } = renderRisk();

    await user.click(screen.getByLabelText('table menu'));
    await user.click(screen.getByRole('menuitem', { name: /add output column/i }));
    await user.type(screen.getByLabelText('Output field name'), 'reason');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      const definition = service.get('risk.*') as {
        '@rules': Array<{ then: Record<string, unknown> }>;
      };
      expect(definition['@rules'][0].then).toHaveProperty('reason');
    });
  });

  it('edits a scorecard score cell', async () => {
    const user = userEvent.setup();
    const service = MutableDecisionService.fromCode(SCORECARD_MODEL_DSL);
    const { container } = render(
      <DecisionTableEditor service={service} path="scoreFactors" languageService={languageService} />,
    );

    const secondRow = container.querySelectorAll('tbody tr')[1] as HTMLElement;
    await user.dblClick(cellByText(secondRow, '10'));
    const editable = queryCmContent(container);
    await user.click(editable);
    await user.keyboard('{Control>}a{/Control}12{Enter}');

    await waitFor(() => {
      expect(service.execute('total')).toBe(32);
    });
  });
});
