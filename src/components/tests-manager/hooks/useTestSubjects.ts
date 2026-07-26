import { useMemo } from 'react';
import { listTestSubjects } from '../model/subjects';
import type { MutableDecisionService, TestSubject } from '../tests-manager-types';

// Memoized `listTestSubjects` for the current model revision — re-derives only when the host
// signals the model itself changed, not on every render.
export function useTestSubjects(service: MutableDecisionService, revision?: string | number): TestSubject[] {
  return useMemo(() => listTestSubjects(service), [service, revision]);
}
