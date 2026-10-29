import '@mantine/core/styles.css';
import type {Preview} from '@storybook/react-vite';
import {MantineProvider} from '@mantine/core';

const preview: Preview = {
    parameters: {
        options: {
            storySort: {
                // Sort the stories of a component by `order` too, not only the groups and the components.
                includeNames: true,
                order: [
                    'Models',
                    ['Loan Repayment', 'Loan Origination', 'Client Outreach'],
                    'Components',
                    [
                        'Shell',
                        'Boxed Editor',
                        ['Full Model', 'Blank Model', 'Test Cases And Test Runner', 'Read Only', '*'],
                        'Decision Table Editor',
                        'Flow Editor',
                        ['Canvas', 'Input Node', 'Function Node', 'Output Node', 'Chart Node'],
                        'Code Editor',
                        ['Code Editor', 'Code Editor Cell'],
                        'Tests Manager',
                        'Project Explorer',
                    ],
                    'Services',
                ],
            },
        },
    },
    decorators: [
        (Story) => (
            <MantineProvider>
                <Story />
            </MantineProvider>
        ),
    ],
};

export default preview;
