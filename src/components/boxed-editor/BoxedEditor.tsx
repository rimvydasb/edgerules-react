import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import type { ReactElement } from 'react';
import type { BoxedEditorProps } from './BoxedEditorProps';
import { BoxedEditorProvider } from './context/BoxedEditorContext';
import { BoxedEditorUiProvider } from './context/BoxedEditorUiContext';
import { useBoxedEditorService } from './hooks/useBoxedEditorService';
import { useBoxedRows } from './hooks/useBoxedRows';
import { ModelHeaderRow } from './rows/ModelHeaderRow';
import { NewRow } from './rows/NewRow';
import { RowSwitch } from './rows/RowSwitch';

interface BoxedEditorGridProps {
  path: string;
  showHeader: boolean;
}

function BoxedEditorGrid({ path, showHeader }: BoxedEditorGridProps): ReactElement {
  const service = useBoxedEditorService();
  const rows = useBoxedRows(path);
  const rootRow = service.getBoxedRowData(path);

  if (rootRow === undefined) {
    return (
      <Alert severity="error">
        Cannot load &quot;{path}&quot; — the path does not exist in this model.
      </Alert>
    );
  }

  return (
    <Box
      role="treegrid"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: 'fit-content',
        border: (theme) => `1px solid ${theme.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      {showHeader && rootRow.kind === 'model' && <ModelHeaderRow row={rootRow} />}
      {rows.map((row) => (
        <RowSwitch key={row.path} row={row} />
      ))}
      <NewRow row={{ ...rootRow, children: rows }} />
    </Box>
  );
}

/**
 * The structured, visual authoring surface for EdgeRules models: a single flat treegrid of rows.
 * Renders no rule-evaluation logic of its own — the `BoxedEditorService` facade over
 * `MutableDecisionService` is the single source of truth; this component derives and displays
 * its row tree, never storing a copy in React state.
 */
export function BoxedEditor(props: BoxedEditorProps): ReactElement {
  const {
    service,
    path,
    revision,
    readOnly = false,
    onChange,
    languageService,
    documentationService,
    testCasesService,
    testRunner,
    testSubjectId,
    autoRunTests = true,
    showHeader = true,
    showTestResults = true,
    showDescription = true,
    showType = true,
    expanded = true,
    className,
    sx,
  } = props;

  return (
    <Box className={className} sx={sx}>
      <BoxedEditorProvider
        service={service}
        readOnly={readOnly}
        onChange={onChange}
        showDescription={showDescription}
        showTestResults={showTestResults}
        showType={showType}
        languageService={languageService}
        documentationService={documentationService}
        testCasesService={testCasesService}
        testRunner={testRunner}
        testSubjectId={testSubjectId}
        autoRunTests={autoRunTests}
        revision={revision}
      >
        <BoxedEditorUiProvider defaultExpanded={expanded}>
          <BoxedEditorGrid path={path} showHeader={showHeader} />
        </BoxedEditorUiProvider>
      </BoxedEditorProvider>
    </Box>
  );
}
