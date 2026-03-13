import { test, expect } from '@playwright/test';

test('home page should render template title and create button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作流模板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建模板' })).toBeVisible();
});

test('create template should navigate to editor page', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '新建模板' }).click();
  const dialog = page.getByRole('dialog', { name: '新建模板' });
  await expect(dialog).toBeVisible();

  const templateName = `E2E模板-${Date.now()}`;
  await dialog.locator('input[placeholder="例如：抓取网页标题"]').fill(templateName);
  await dialog.locator('textarea[placeholder="简要描述这个工作流的功能..."]').fill('Playwright 自动化创建');
  await dialog.getByRole('button', { name: /创\s*建/ }).click();

  await expect(page).toHaveURL(/\/editor\?id=/);
  await expect(page.getByText(templateName)).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
});

test('existing template should open editor from list', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('示例：抓取网页标题')).toBeVisible();
  await page.getByText('示例：抓取网页标题').first().click();

  await expect(page).toHaveURL(/\/editor\?id=tpl-001/);
  await expect(page.getByRole('button', { name: '返回' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
});
