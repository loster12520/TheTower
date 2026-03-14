import { test, expect } from '@playwright/test';
import path from 'path';

test('export should trigger json download', async ({ page }) => {
  await page.goto('/');

  // 打开第一张卡片的“更多”菜单
  await page
    .locator('.template-card')
    .first()
    .locator('.ant-card-actions .ant-btn-link')
    .last()
    .click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: '导出' }).click();

  const download = await downloadPromise;
  await expect(download.suggestedFilename()).toMatch(/\.json$/);
});

test('import should create a new template', async ({ page }) => {
  await page.goto('/');

  const filePath = path.join(__dirname, 'fixtures', 'template-import.json');
  await page.locator('input[type="file"]').setInputFiles(filePath);

  await expect(page.getByText('导入成功')).toBeVisible();
  await expect(page.getByText('导入用例：WS Step Failed')).toBeVisible();
});
