import '@mantine/core/styles.css';
import type {Preview} from '@storybook/react-vite';
import {MantineProvider} from '@mantine/core';

const preview: Preview = {
  decorators: [
    (Story) => (
      <MantineProvider>
        <Story />
      </MantineProvider>
    ),
  ],
};

export default preview;
