import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { renderHook } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { MutableDecisionService } from '@edgerules/node/mutable';
import type { ReactNode } from 'react';
import { BoxedEditor } from '../BoxedEditor';
import { BoxedEditorProvider } from '../context/BoxedEditorContext';
import { useRowCommands } from '../commands/useRowCommands';
import { createBoxedEditorService } from '../service/createBoxedEditorService';

const MODEL = `{
  amount: 10
  other: 20
}`;

// The real dev-build engine service — never mocked (see project testing policy). The class
// itself satisfies `CodeEditorService` via its static `diagnostics`/`completions`.
const languageService = MutableDecisionService;

function queryEditable(container: HTMLElement): HTMLElement {
  const editable = container.querySelector('.cm-content[contenteditable="true"]');
  if (!editable) throw new Error('Could not find a contenteditable CodeMirror element');
  return editable as HTMLElement;
}

function getView(container: HTMLElement): EditorView {
  const dom = container.querySelector('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom as HTMLElement);
  if (!view) throw new Error('Could not find the CodeMirror view');
  return view;
}

function replaceDoc(container: HTMLElement, text: string): void {
  const view = getView(container);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
}

describe('commands: value commits', () => {
  it('commits a value edit, updates the model, and fires onChange exactly once', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    const { container } = render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('10'));
    await user.click(queryEditable(container));
    replaceDoc(container, '99');
    await user.keyboard('{Enter}');

    expect(mutable.toPortable()).toMatchObject({ amount: 99 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(service.toPortable());
    // The cell deactivates back to static text on a successful commit.
    expect(container.querySelector('.cm-editor')).toBeNull();
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('rejects an invalid edit, keeps the cell active with the message inline, and never fires onChange', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    const { container } = render(
      <BoxedEditor
        service={service}
        path="*"
        languageService={languageService}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('10'));
    await user.click(queryEditable(container));
    replaceDoc(container, 'undefinedName + 1');
    await user.keyboard('{Enter}');

    // Rejected: the model is untouched and onChange never fires.
    expect(mutable.toPortable()).toMatchObject({ amount: 10 });
    expect(onChange).not.toHaveBeenCalled();
    // The cell stays active (still mounts the editor) and shows the error inline.
    expect(container.querySelector('.cm-editor')).not.toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(/unresolved reference/i);
  });

  it('mounts only one CodeMirror editor across the tree at a time', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);

    const { container } = render(
      <BoxedEditor service={service} path="*" languageService={languageService} />,
    );

    await user.click(screen.getByText('10'));
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);

    await user.click(screen.getByText('20'));
    expect(container.querySelectorAll('.cm-editor')).toHaveLength(1);
    // The first cell reverted to static text once it lost the active-cell slot.
    expect(screen.getByText('10')).toBeInTheDocument();
  });
});

describe('commands: name commit', () => {
  const mutable = MutableDecisionService.fromCode(MODEL);
  const service = createBoxedEditorService(mutable);
  const onChange = vi.fn();

  function wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <BoxedEditorProvider
        service={service}
        readOnly={false}
        onChange={onChange}
        showDescription={false}
        showTestResults={false}
        showType={false}
        autoRunTests={false}
      >
        {children}
      </BoxedEditorProvider>
    );
  }

  it('renames a named kind and fires onChange exactly once', () => {
    const { result } = renderHook(() => useRowCommands(), { wrapper });

    let error: unknown;
    act(() => {
      error = result.current.rename('amount', 'renamedAmount');
    });

    expect(error).toBeUndefined();
    expect(mutable.toPortable()).toMatchObject({ renamedAmount: 10 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('passes a rejected rename through as a PortableError without firing onChange', () => {
    onChange.mockClear();
    const { result } = renderHook(() => useRowCommands(), { wrapper });

    let error: unknown;
    act(() => {
      // Colliding with the sibling "other" field.
      error = result.current.rename('renamedAmount', 'other');
    });

    expect(error).toMatchObject({ '@kind': 'error', type: 'DuplicateName' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
