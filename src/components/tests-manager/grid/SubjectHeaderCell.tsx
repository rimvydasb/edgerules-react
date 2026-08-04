import MenuItem from '@mui/material/MenuItem';
import Select, {type SelectChangeEvent} from '@mui/material/Select';
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
            size="small"
            variant="standard"
            value={value}
            disabled={readOnly}
            onChange={(event: SelectChangeEvent) => onChange(event.target.value)}
            inputProps={{'aria-label': 'Test subject'}}
            sx={{minWidth: 160}}
        >
            {subjects.map((subject) => (
                <MenuItem key={subject.id} value={subject.id}>
                    {subject.name}
                </MenuItem>
            ))}
        </Select>
    );
}
