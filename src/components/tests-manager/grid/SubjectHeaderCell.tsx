import {Select} from '@mantine/core';
import type {ReactElement} from 'react';
import type {TestSubject, TestSubjectId} from '../tests-manager-types';

// The Path column header: a drop-down that selects the test subject.
export function SubjectHeaderCell({
    subjects,
    value,
    onChange,
    readOnly,
}: {
    subjects: TestSubject[];
    value: TestSubjectId;
    onChange: (id: TestSubjectId) => void;
    readOnly?: boolean;
}): ReactElement {
    return (
        <Select
            size="xs"
            variant="unstyled"
            allowDeselect={false}
            checkIconPosition="right"
            value={value}
            disabled={readOnly}
            data={subjects.map((subject) => ({value: subject.id, label: subject.name}))}
            onChange={(next) => {
                if (next !== null) onChange(next);
            }}
            aria-label="Test subject"
            comboboxProps={{withinPortal: true}}
            styles={{input: {minWidth: 120}}}
        />
    );
}
