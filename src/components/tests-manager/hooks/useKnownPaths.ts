import { useMemo } from 'react';
import type { TestRow } from '../../test-cases-service';
import { collectKnownPaths } from '../model/paths';
import { deriveRows } from '../model/rows';
import type { MutableDecisionService, TestSubject } from '../tests-manager-types';

/**
 * Every path of the subject a row may legitimately address, canonicalized to `[0]` indexes (see
 * `model/paths.ts`). Two sources, matching the two ways a row is born:
 *
 * - the schema, re-derived for the current `revision`;
 * - the rows already on the grid that the schema did *not* produce — a `@kind: 'invocation'` call
 *   site's leaves are discovered from a run result and are no less real for it.
 *
 * User-authored (`custom`) and removed (`present: false`) rows are deliberately excluded: they are
 * precisely the rows whose path may be wrong, and including them would make the check vacuous.
 */
export function useKnownPaths(
  service: MutableDecisionService,
  subject: TestSubject,
  revision: string | number | undefined,
  rows: readonly TestRow[],
): ReadonlySet<string> {
  const derivedPaths = useMemo(
    () => deriveRows(service, subject).map((row) => row.path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [service, subject, revision],
  );

  return useMemo(
    () =>
      collectKnownPaths([
        ...derivedPaths,
        ...rows.filter((row) => row.present && !row.custom).map((row) => row.path),
      ]),
    [derivedPaths, rows],
  );
}
