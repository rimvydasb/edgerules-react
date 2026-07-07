import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { CodeEditor } from '../CodeEditor';
import { INVALID_MODEL_DSL, VALID_MODEL_DSL } from '../testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const service = MutableDecisionService;

function queryEditable(container: HTMLElement): HTMLElement {
  const editable = container.querySelector('.cm-content[contenteditable="true"]');
  if (!editable) {
    throw new Error('Could not find a contenteditable CodeMirror element');
  }
  return editable as HTMLElement;
}

function getView(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom as HTMLElement);
  if (!view) {
    throw new Error('Could not find the CodeMirror view');
  }
  return view;
}

describe('CodeEditor', () => {
  it('renders controlled value and updates when props change', async () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <CodeEditor value={VALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    expect(container.querySelector('.cm-content')?.textContent).toContain('applicant');

    rerender(<CodeEditor value="{ answer: 42 }" onChange={onChange} service={service} />);

    await waitFor(() => {
      expect(container.querySelector('.cm-content')?.textContent).toContain('answer');
    });
  });

  it('calls onChange when typing', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value="{ value: 1 }" onChange={onChange} service={service} />,
    );

    const editable = queryEditable(container);
    await user.click(editable);
    await user.keyboard('{ArrowRight}{ArrowRight}2');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it('highlights EdgeRules syntax with stable token classes', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value={VALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.tok-keyword')).not.toBeNull(); // func / type
      expect(container.querySelector('.tok-propertyName')).not.toBeNull(); // applicant:
      expect(container.querySelector('.tok-string')).not.toBeNull(); // "Vilnius"
      expect(container.querySelector('.tok-number')).not.toBeNull(); // 21
      expect(container.querySelector('.tok-typeName')).not.toBeNull(); // Customer
    });
  });

  it('surfaces real engine diagnostics as lint markers for invalid code', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value={INVALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.cm-lintRange-error, .cm-lintPoint-error')).not.toBeNull();
    });
  });

  it('shows engine completions on explicit request (Ctrl+Space path)', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value={VALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    const view = getView(container);
    const pos = VALID_MODEL_DSL.indexOf('limit: ') + 'limit: '.length;
    view.dispatch({ selection: { anchor: pos } });
    view.focus();
    startCompletion(view);

    await waitFor(() => {
      const options = currentCompletions(view.state);
      expect(options.length).toBeGreaterThan(0);
      const labels = options.map((option) => option.label);
      expect(labels).toContain('applicant');
      expect(labels).toContain('riskScore');
    });
  });

  it('navigates to a definition with F12', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value={VALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    const view = getView(container);
    const usage =
      VALID_MODEL_DSL.indexOf('riskScore(applicant') + 'riskScore('.length + 'app'.length;
    view.dispatch({ selection: { anchor: usage } });
    const editable = queryEditable(container);
    editable.focus();
    await user.keyboard('{F12}');

    await waitFor(() => {
      const selection = view.state.selection.main;
      expect(selection.from).toBe(VALID_MODEL_DSL.indexOf('applicant: {'));
      expect(view.state.doc.sliceString(selection.from, selection.to)).toBe('applicant');
    });
  });

  it('formats the document with Shift-Alt-F', async () => {
    const user = userEvent.setup();
    const messy = '{\na:1\n}';
    let latest = messy;
    const { container } = render(
      <CodeEditor
        value={messy}
        onChange={(next) => {
          latest = next;
        }}
        service={service}
      />,
    );

    const editable = queryEditable(container);
    editable.focus();
    await user.keyboard('{Shift>}{Alt>}f{/Alt}{/Shift}');

    await waitFor(() => {
      expect(latest).toBe('{\n  a: 1\n}');
    });
  });

  it('does not allow edits when readOnly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value="{ a: 1 }" onChange={onChange} service={service} readOnly />,
    );

    const editable = container.querySelector('.cm-content');
    expect(editable?.getAttribute('contenteditable')).toBe('false');
    await user.click(editable as HTMLElement);
    await user.keyboard('x');
    expect(onChange).not.toHaveBeenCalled();
  });
});
