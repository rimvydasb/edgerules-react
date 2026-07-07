import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CodeEditor, type CodeEditorDiagnosticsService } from '../CodeEditor';
import { INVALID_MODEL_DSL, VALID_MODEL_DSL } from '../testing/model.dsl';

function queryEditable(container: HTMLElement): HTMLElement {
  const editable = container.querySelector('.cm-content[contenteditable="true"]');
  if (!editable) {
    throw new Error('Could not find a contenteditable CodeMirror element');
  }
  return editable as HTMLElement;
}

describe('CodeEditor', () => {
  it('renders controlled value and updates when props change', async () => {
    const service: CodeEditorDiagnosticsService = { diagnostics: () => [] };
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
    const service: CodeEditorDiagnosticsService = { diagnostics: () => [] };
    const onChange = vi.fn();
    const { container } = render(<CodeEditor value="{ value: 1 }" onChange={onChange} service={service} />);

    const editable = queryEditable(container);
    await user.click(editable);
    await user.keyboard('{ArrowRight}{ArrowRight}2');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalled();
    });
  });

  it('runs EdgeRules diagnostics and surfaces lint markers for invalid code', async () => {
    const diagnosticsSpy = vi.fn(() => [
      {
        from: INVALID_MODEL_DSL.indexOf('age:') + 4,
        to: INVALID_MODEL_DSL.indexOf('age:') + 5,
        message: 'Expected expression',
        severity: 'error',
      },
    ]);
    const service: CodeEditorDiagnosticsService = { diagnostics: diagnosticsSpy };
    const onChange = vi.fn();
    const { container } = render(
      <CodeEditor value={INVALID_MODEL_DSL} onChange={onChange} service={service} />,
    );

    await waitFor(() => {
      expect(diagnosticsSpy).toHaveBeenCalledWith(INVALID_MODEL_DSL);
    });

    await waitFor(() => {
      expect(
        container.querySelector('.cm-lintRange-error, .cm-lintPoint-error'),
      ).not.toBeNull();
    });
  });
});
