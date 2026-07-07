import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { currentCompletions, startCompletion } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { CodeEditorCell } from '../CodeEditorCell';
import {
  CELL_EMBED_PREFIX,
  CELL_EMBED_SUFFIX,
} from '../../code-editor/testing/model.dsl';

// The real dev-build engine service — never mocked (see project testing policy).
const service = MutableDecisionService;
const embedContext = { prefix: CELL_EMBED_PREFIX, suffix: CELL_EMBED_SUFFIX };

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

describe('CodeEditorCell', () => {
  it('renders the value with syntax highlighting', async () => {
    const { container } = render(
      <CodeEditorCell value='applicant.age + 1' service={service} />,
    );
    expect(container.querySelector('.cm-content')?.textContent).toContain('applicant.age + 1');
    await waitFor(() => {
      expect(container.querySelector('.tok-number')).not.toBeNull();
      expect(container.querySelector('.tok-propertyName')).not.toBeNull();
    });
  });

  it('commits on Enter without inserting a newline (single-line mode)', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { container } = render(
      <CodeEditorCell value="1 + 2" onCommit={onCommit} service={service} />,
    );

    const editable = queryEditable(container);
    await user.click(editable);
    await user.keyboard('{Enter}');

    expect(onCommit).toHaveBeenCalledWith('1 + 2');
    expect(getView(container).state.doc.lines).toBe(1);
  });

  it('cancels on Escape', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = render(
      <CodeEditorCell value="1 + 2" onCancel={onCancel} service={service} />,
    );

    await user.click(queryEditable(container));
    await user.keyboard('{Escape}');

    expect(onCancel).toHaveBeenCalled();
  });

  it('commits on blur', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { container } = render(
      <div>
        <CodeEditorCell value="42" onCommit={onCommit} service={service} />
        <button type="button">outside</button>
      </div>,
    );

    await user.click(queryEditable(container));
    await user.click(container.querySelector('button') as HTMLElement);

    await waitFor(() => {
      expect(onCommit).toHaveBeenCalledWith('42');
    });
  });

  it('flattens pasted multi-line content in single-line mode', () => {
    const { container } = render(<CodeEditorCell value="" service={service} />);
    const view = getView(container);

    view.dispatch({ changes: { from: 0, insert: 'a +\n  b' } });

    expect(view.state.doc.lines).toBe(1);
    expect(view.state.doc.toString()).toBe('a + b');
  });

  it('supports multiline mode: Enter inserts a newline, Mod-Enter commits', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn();
    const { container } = render(
      <CodeEditorCell value="1 +" onCommit={onCommit} service={service} multiline />,
    );

    const editable = queryEditable(container);
    await user.click(editable);
    const view = getView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    await user.keyboard('{Enter}2');
    expect(onCommit).not.toHaveBeenCalled();
    expect(view.state.doc.lines).toBe(2);

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(onCommit).toHaveBeenCalledWith('1 +\n2');
  });

  it('lints the cell against the surrounding model via embedContext', async () => {
    const { container } = render(
      <CodeEditorCell value="bogusReference" service={service} embedContext={embedContext} />,
    );

    await waitFor(() => {
      expect(container.querySelector('.cm-lintRange-error, .cm-lintPoint-error')).not.toBeNull();
    });
  });

  it('reports no lint errors for a cell valid in the surrounding model', async () => {
    const { container } = render(
      <CodeEditorCell
        value="applicant.age + 1"
        service={service}
        embedContext={embedContext}
      />,
    );

    // Wait a lint cycle, then assert nothing was marked.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(container.querySelector('.cm-lintRange-error, .cm-lintPoint-error')).toBeNull();
  });

  it('completes from the surrounding model scope via embedContext', async () => {
    const { container } = render(
      <CodeEditorCell
        value="applicant."
        service={service}
        embedContext={embedContext}
      />,
    );

    const view = getView(container);
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    view.focus();
    startCompletion(view);

    await waitFor(() => {
      const labels = currentCompletions(view.state).map((option) => option.label);
      expect(labels).toContain('age');
      expect(labels).toContain('address');
    });
  });

  it('updates when the value prop changes', async () => {
    const { container, rerender } = render(<CodeEditorCell value="1" service={service} />);
    rerender(<CodeEditorCell value="2 + 3" service={service} />);
    await waitFor(() => {
      expect(container.querySelector('.cm-content')?.textContent).toContain('2 + 3');
    });
  });

  it('does not allow edits when readOnly', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditorCell value="1" onChange={onChange} service={service} readOnly />,
    );

    const editable = container.querySelector('.cm-content');
    expect(editable?.getAttribute('contenteditable')).toBe('false');
    await user.click(editable as HTMLElement);
    await user.keyboard('9');
    expect(onChange).not.toHaveBeenCalled();
  });
});
