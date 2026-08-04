import {expect, type Page} from '@playwright/test';
import {columnHeaders} from './helpers';

export function columnHeader(page: Page, rowPath: string, name: string) {
    return page.getByTestId(`column-${rowPath}-${name}`);
}

export async function renameHeader(page: Page, rowPath: string, from: string, to: string): Promise<void> {
    await columnHeader(page, rowPath, from).getByRole('button', {name: from, exact: true}).click();
    const input = page.getByLabel(`Rename ${from}`);
    await input.fill(to);
    await input.press('Enter');
}

export async function retypeHeader(page: Page, rowPath: string, name: string, type: string): Promise<void> {
    await columnHeader(page, rowPath, name).getByLabel(`Edit type ${name}`).click();
    const input = page.getByLabel(`Change type of ${name}`);
    await input.fill(type);
    await input.press('Enter');
}

export async function moveHeader(
    page: Page,
    rowPath: string,
    name: string,
    direction: 'left' | 'right',
): Promise<void> {
    await columnHeader(page, rowPath, name).getByLabel(`Move ${name} ${direction}`).click();
}

export async function expectHeaders(page: Page, rowPath: string, expected: string[]): Promise<void> {
    await expect.poll(() => columnHeaders(page, rowPath)).toEqual(expected);
}
