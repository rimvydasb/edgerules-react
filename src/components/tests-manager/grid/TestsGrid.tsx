import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import AddIcon from '@mui/icons-material/Add';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import { closestCenter, DndContext } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ReactElement } from 'react';
import type { TestCase, TestRow } from '../../test-cases-service';
import { useTestsManagerContext } from '../context/TestsManagerContext';
import { useRowDrag } from '../dnd/useRowDrag';
import { useTestCaseColumns } from '../hooks/useTestCaseColumns';
import { useTestRows } from '../hooks/useTestRows';
import { useTestSubjects } from '../hooks/useTestSubjects';
import type { TestSubjectId } from '../tests-manager-types';
import { CELL_BORDER_SX } from './gridStyle';
import { computePathColumnWidth } from './PathCell';
import { SectionHeaderRow } from './SectionHeaderRow';
import { SubjectHeaderCell } from './SubjectHeaderCell';
import { TestCaseHeaderCell } from './TestCaseHeaderCell';
import { TestRowLine } from './TestRowLine';
import {
  DESCRIPTION_COLUMN_WIDTH,
  ICON_CELL_WIDTH,
  rowHeightForText,
  TEST_CASE_COLUMN_WIDTH,
} from './wrapping';

function RowDragSection({
  rows,
  visibleCases,
  pathColumnWidth,
  onMove,
}: {
  rows: TestRow[];
  visibleCases: TestCase[];
  pathColumnWidth: number;
  onMove: (path: string, toIndex: number) => void;
}): ReactElement {
  const { sensors, handleDragEnd, itemIds } = useRowDrag(rows, onMove);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {rows.map((row) => (
          <TestRowLine
            key={row.path}
            row={row}
            visibleCases={visibleCases}
            pathColumnWidth={pathColumnWidth}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}

// Grid shell: frozen Path/Description columns, column paging, and the three fixed sections.
export function TestsGrid({
  onSubjectChange,
}: {
  onSubjectChange: (id: TestSubjectId) => void;
}): ReactElement {
  const { service, testCases, runner, subject, readOnly, revision, pageSize } =
    useTestsManagerContext();
  const subjects = useTestSubjects(service, revision);
  const allRows = useTestRows(testCases);
  const rows = allRows.filter((row) => row.present);
  const inputRows = rows.filter((row) => row.section === 'inputs');
  const assertionRows = rows.filter((row) => row.section === 'assertions');
  const validationRows = rows.filter((row) => row.section === 'validations');
  const { visibleCases, pageIndex, pageCount, nextPage, prevPage } =
    useTestCaseColumns(testCases, pageSize);

  const pathColumnWidth = computePathColumnWidth(rows.map((row) => row.path));
  const headerRowHeight = Math.max(
    40,
    ...visibleCases.map((testCase) =>
      rowHeightForText(testCase.name, TEST_CASE_COLUMN_WIDTH),
    ),
  );

  const needsSolver =
    service.requiresSolver() && service.solverHandler === undefined;
  const moveRow = (path: string, toIndex: number): void =>
    testCases.moveRow(path, toIndex);

  return (
    <Box data-testid="tests-grid">
      {needsSolver && (
        <Alert
          severity="warning"
          data-testid="missing-solver-banner"
          sx={{ mb: 1 }}
        >
          No optimisation solver registered for this model.
        </Alert>
      )}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        {!readOnly && (
          <Button size="small" onClick={() => testCases.addTestCase()}>
            Add test case
          </Button>
        )}
        <Button size="small" onClick={() => void runner.runAll()}>
          Run all
        </Button>
        {pageCount > 1 && (
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}
          >
            <Button
              size="small"
              onClick={prevPage}
              disabled={pageIndex === 0}
              aria-label="previous page"
            >
              ‹
            </Button>
            <span data-testid="page-indicator">
              Page {pageIndex + 1}/{pageCount}
            </span>
            <Button
              size="small"
              onClick={nextPage}
              disabled={pageIndex >= pageCount - 1}
              aria-label="next page"
            >
              ›
            </Button>
          </Box>
        )}
      </Box>
      <TableContainer sx={{ maxHeight: 640 }}>
        <Table
          size="small"
          stickyHeader
          sx={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 'auto' }}
        >
          <TableHead>
            <TableRow style={{ height: headerRowHeight }}>
              <TableCell
                sx={{
                  ...CELL_BORDER_SX,
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  backgroundColor: '#000',
                  width: ICON_CELL_WIDTH,
                  maxWidth: ICON_CELL_WIDTH,
                  padding: 0,
                  textAlign: 'center',
                }}
              >
                <FactCheckIcon sx={{ color: '#fff' }} fontSize="small" />
              </TableCell>
              <TableCell
                sx={{
                  ...CELL_BORDER_SX,
                  position: 'sticky',
                  left: ICON_CELL_WIDTH,
                  zIndex: 3,
                  backgroundColor: 'background.paper',
                  width: pathColumnWidth,
                }}
              >
                <SubjectHeaderCell
                  subjects={subjects}
                  value={subject.id}
                  onChange={onSubjectChange}
                  readOnly={readOnly}
                />
              </TableCell>
              <TableCell
                sx={{
                  ...CELL_BORDER_SX,
                  position: 'sticky',
                  left: ICON_CELL_WIDTH + pathColumnWidth,
                  zIndex: 3,
                  backgroundColor: 'background.paper',
                  width: DESCRIPTION_COLUMN_WIDTH,
                  maxWidth: DESCRIPTION_COLUMN_WIDTH,
                }}
              >
                Description
              </TableCell>
              {visibleCases.map((testCase) => (
                <TableCell
                  key={testCase.id}
                  sx={{
                    ...CELL_BORDER_SX,
                    position: 'relative',
                    width: TEST_CASE_COLUMN_WIDTH,
                    maxWidth: TEST_CASE_COLUMN_WIDTH,
                    padding: 0,
                  }}
                >
                  <TestCaseHeaderCell testCase={testCase} />
                </TableCell>
              ))}
              <TableCell
                sx={{
                  ...CELL_BORDER_SX,
                  width: ICON_CELL_WIDTH,
                  maxWidth: ICON_CELL_WIDTH,
                  padding: 0,
                  textAlign: 'center',
                }}
              >
                {!readOnly && (
                  <IconButton
                    size="small"
                    aria-label="Add test case at end"
                    onClick={() => testCases.addTestCase()}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                )}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <SectionHeaderRow
              sectionId="inputs"
              rows={inputRows}
              testCases={testCases}
              visibleCases={visibleCases}
              revision={revision}
            />
            <RowDragSection
              rows={inputRows}
              visibleCases={visibleCases}
              pathColumnWidth={pathColumnWidth}
              onMove={moveRow}
            />
            <SectionHeaderRow
              sectionId="assertions"
              rows={assertionRows}
              testCases={testCases}
              visibleCases={visibleCases}
              revision={revision}
            />
            <RowDragSection
              rows={assertionRows}
              visibleCases={visibleCases}
              pathColumnWidth={pathColumnWidth}
              onMove={moveRow}
            />
            <SectionHeaderRow
              sectionId="validations"
              rows={validationRows}
              testCases={testCases}
              visibleCases={visibleCases}
              revision={revision}
            />
            <RowDragSection
              rows={validationRows}
              visibleCases={visibleCases}
              pathColumnWidth={pathColumnWidth}
              onMove={moveRow}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
