import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
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
import { SectionHeaderRow } from './SectionHeaderRow';
import { SubjectHeaderCell } from './SubjectHeaderCell';
import { TestCaseHeaderCell } from './TestCaseHeaderCell';
import { TestRowLine } from './TestRowLine';

const PATH_COLUMN_WIDTH = 160;

function RowDragSection({
  rows,
  visibleCases,
  onMove,
}: {
  rows: TestRow[];
  visibleCases: TestCase[];
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
          <TestRowLine key={row.path} row={row} visibleCases={visibleCases} />
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
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 3,
                  backgroundColor: 'background.paper',
                  width: PATH_COLUMN_WIDTH,
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
                  position: 'sticky',
                  left: PATH_COLUMN_WIDTH,
                  zIndex: 3,
                  backgroundColor: 'background.paper',
                }}
              >
                Description
              </TableCell>
              {visibleCases.map((testCase) => (
                <TableCell key={testCase.id}>
                  <TestCaseHeaderCell testCase={testCase} />
                </TableCell>
              ))}
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
              onMove={moveRow}
            />
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
