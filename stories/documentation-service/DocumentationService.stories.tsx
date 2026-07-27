import { useMemo, type ReactElement } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { createDocumentationService } from '../../src/components/documentation-service/createDocumentationService';
import { useDescription } from '../../src/components/documentation-service/useDescription';
import type { DocumentationService } from '../../src/components/documentation-service/documentation-service-types';

function DescriptionEditor({
  label,
  service,
  path,
}: {
  label: string;
  service: DocumentationService;
  path: string;
}): ReactElement {
  const description = useDescription(service, path);
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="subtitle2">{label}</Typography>
      <TextField
        fullWidth
        multiline
        minRows={3}
        value={description ?? ''}
        onChange={(e) => service.setDescription(path, e.target.value)}
        placeholder={`Description for "${path}"…`}
      />
    </Box>
  );
}

function TwoConsumersDemo(): ReactElement {
  // One in-memory-only instance per mount, so each Storybook load starts from a clean slate.
  const service = useMemo(
    () => createDocumentationService(`storybook-${Date.now()}`),
    [],
  );
  return (
    <Box sx={{ display: 'flex', gap: 3, maxWidth: 720 }}>
      <DescriptionEditor
        label="Panel A"
        service={service}
        path="applicant.age"
      />
      <DescriptionEditor
        label="Panel B (same path)"
        service={service}
        path="applicant.age"
      />
    </Box>
  );
}

const meta: Meta = {
  title: 'Documentation Service/DocumentationService',
  parameters: {
    docs: {
      description: {
        component:
          'Two components sharing one `DocumentationService` instance via `useDescription`. Typing in ' +
          'either panel updates the other immediately, since both read the same in-memory cache through ' +
          '`subscribe`.',
      },
    },
  },
};

export default meta;

type Story = StoryObj;

export const SharedInstanceStaysInSync: Story = {
  render: () => <TwoConsumersDemo />,
};
