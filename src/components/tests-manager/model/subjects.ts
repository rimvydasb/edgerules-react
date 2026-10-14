import { listCallables } from '../../../lib/callables';
import type { MutableDecisionService, TestSubject } from '../tests-manager-types';

// `'*'` plus every fully typed callable from `listCallables`.
export function listTestSubjects(service: MutableDecisionService): TestSubject[] {
  const portableRoot = service.toPortable();
  const modelName =
    typeof portableRoot['@model-name'] === 'string' ? (portableRoot['@model-name'] as string) : 'Model';

  const subjects: TestSubject[] = [{ id: '*', kind: 'model', name: modelName }];

  for (const { path, kind } of listCallables(service)) {
    subjects.push({ id: path, kind, name: path });
  }

  return subjects;
}
