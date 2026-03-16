import { test, expect, type Page } from '@playwright/test';

const createBlankTemplate = async (page: Page, name: string, description: string = 'Playwright 回归模板') => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建模板' }).click();

  const dialog = page.getByRole('dialog', { name: '新建模板' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[placeholder="例如：抓取网页标题"]').fill(name);
  await dialog.locator('textarea[placeholder="简要描述这个工作流的功能..."]').fill(description);
  await dialog.getByRole('button', { name: /创\s*建/ }).click();

  await expect(page).toHaveURL(/\/editor\?id=/);
};

const dragNodeToCanvas = async (page: Page, label: string, targetPosition = { x: 240, y: 180 }) => {
  const source = page.locator('.editor-node-library__item', { hasText: label }).first();
  const pane = page.locator('.react-flow__pane').first();
  await source.dragTo(pane, { targetPosition });
};

const openCardMenu = async (page: Page, title: string) => {
  const card = page.locator('.template-card', { hasText: title }).first();
  await expect(card).toBeVisible();
  await card.locator('.ant-card-actions .ant-btn-link').last().click();
  return card;
};

test('home should disable run button for empty template card', async ({ page }) => {
  await page.goto('/');

  const emptyCard = page.locator('.template-card', { hasText: '空白模板' }).first();
  await expect(emptyCard).toBeVisible();
  await expect(emptyCard.getByRole('button', { name: '运行' })).toBeDisabled();
});

test('home should rename a newly created template', async ({ page }) => {
  const templateName = `回归重命名-${Date.now()}`;
  const renamedTemplate = `${templateName}-已更新`;

  await createBlankTemplate(page, templateName, '用于验证重命名能力');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作流模板' })).toBeVisible();

  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('重命名').click();

  const dialog = page.locator('.ant-modal').filter({ hasText: '编辑模板信息' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('模板名称').fill(renamedTemplate);
  await dialog.getByLabel('描述').fill('回归测试已更新');
  await dialog.getByRole('button', { name: /保\s*存/ }).click();

  await expect(page.getByText('模板更新成功')).toBeVisible();
  await expect(page.locator('.template-card', { hasText: renamedTemplate }).first()).toBeVisible();
});

test('home should delete a newly created template', async ({ page }) => {
  const templateName = `回归删除-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证删除能力');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作流模板' })).toBeVisible();

  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('删除').click();
  const deleteDialog = page.locator('.ant-modal').filter({ hasText: '确定要删除这个模板吗？' });
  await expect(deleteDialog).toBeVisible();
  await deleteDialog.getByRole('button', { name: /删\s*除/ }).click();

  await expect(page.getByText('模板已删除')).toBeVisible();
  await expect(page.locator('.template-card', { hasText: templateName })).toHaveCount(0);
});

test('editor should create save and reload a linear workflow from blank template', async ({ page }) => {
  const templateName = `回归编排-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证空白模板编排');

  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.reload();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').first().click();
  await expect(page.getByLabel('网址 URL')).toHaveValue('https://example.com');
});

test('editor should block running an invalid workflow from blank template', async ({ page }) => {
  const templateName = `回归校验-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证运行前校验');

  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await page.locator('.react-flow__node').first().click();

  await page.getByRole('button', { name: '运行' }).click();

  const errorDialog = page.getByRole('dialog', { name: '配置有误，无法运行' });
  await expect(errorDialog).toBeVisible();
  await expect(errorDialog.getByText('打开网页: URL 不能为空')).toBeVisible();
});