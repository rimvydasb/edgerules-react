import 'fake-indexeddb/auto';
import {act, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {createDocumentationService} from '../createDocumentationService';
import type {DocumentationService} from '../documentation-service-types';
import {useDescription} from '../useDescription';

function uniqueDbName(): string {
    return `use-description-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: DocumentationService): Promise<void> {
    return new Promise((resolve) => {
        const unsubscribe = service.subscribe(() => {
            unsubscribe();
            resolve();
        });
    });
}

function DescriptionProbe({service, path}: {service: DocumentationService; path: string}) {
    const description = useDescription(service, path);
    return <span data-testid="description">{description ?? 'none'}</span>;
}

describe('useDescription', () => {
    it('reflects the initial description', async () => {
        const service = createDocumentationService('model', {
            dbName: uniqueDbName(),
        });
        await waitForHydration(service);
        service.setDescription('age', 'Applicant age in years');

        render(<DescriptionProbe service={service} path="age" />);
        expect(screen.getByTestId('description').textContent).toBe('Applicant age in years');

        service.dispose();
    });

    it('re-renders when the service writes from outside the hook', async () => {
        const service = createDocumentationService('model', {
            dbName: uniqueDbName(),
        });
        await waitForHydration(service);

        render(<DescriptionProbe service={service} path="age" />);
        expect(screen.getByTestId('description').textContent).toBe('none');

        act(() => {
            service.setDescription('age', 'Applicant age in years');
        });
        expect(screen.getByTestId('description').textContent).toBe('Applicant age in years');

        service.dispose();
    });

    it('re-renders when the path is migrated by renamePath', async () => {
        const service = createDocumentationService('model', {
            dbName: uniqueDbName(),
        });
        await waitForHydration(service);
        service.setDescription('credit.balance', 'Outstanding balance');

        render(<DescriptionProbe service={service} path="credit.balance" />);
        expect(screen.getByTestId('description').textContent).toBe('Outstanding balance');

        act(() => {
            service.renamePath('credit.balance', 'wallet.balance');
        });
        expect(screen.getByTestId('description').textContent).toBe('none');

        service.dispose();
    });

    it('stops updating after unmount', async () => {
        const service = createDocumentationService('model', {
            dbName: uniqueDbName(),
        });
        await waitForHydration(service);

        const {unmount} = render(<DescriptionProbe service={service} path="age" />);
        unmount();

        // A write after unmount must not throw even though the component stopped listening.
        expect(() => service.setDescription('age', 'Applicant age in years')).not.toThrow();

        service.dispose();
    });
});
