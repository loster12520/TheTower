import { test, expect } from '@playwright/test';

test('home page should render template title and create button', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '工作流模板' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建模板' })).toBeVisible();
  await expect(page.getByText('默认版本 0.0.8')).toBeVisible();
});

test('create template should navigate to editor page', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: '新建模板' }).click();
  const dialog = page.getByRole('dialog', { name: '新建模板' });
  await expect(dialog).toBeVisible();

  const templateName = `E2E模板-${Date.now()}`;
  await dialog.locator('input[placeholder="例如：抓取网页标题"]').fill(templateName);
  await dialog.locator('textarea[placeholder="简要描述这个工作流的功能..."]').fill('Playwright 自动化创建');
  await expect(dialog.getByText('schemaVersion 0.0.8')).toBeVisible();
  await dialog.getByRole('button', { name: /创\s*建/ }).click();

  await expect(page).toHaveURL(/\/editor\?id=/);
  await expect(page.getByText(templateName)).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
});

test('existing template should open editor from list', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('示例：抓取网页标题')).toBeVisible();
  await expect(page.locator('.template-card').filter({ hasText: '示例：抓取网页标题' }).getByText('Schema 0.0.1')).toBeVisible();
  await page.getByText('示例：抓取网页标题').first().click();

  await expect(page).toHaveURL(/\/editor\?id=tpl-001/);
  await expect(page.getByRole('button', { name: '返回' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存' })).toBeVisible();
});

test('editor should expose control-flow nodes in node library', async ({ page }) => {
  await page.goto('/editor?id=tpl-001');

  await expect(page.getByText('IF 条件')).toBeVisible();
  await expect(page.getByText('For 次数')).toBeVisible();
  await expect(page.getByText('While 循环')).toBeVisible();
  await expect(page.getByText('退出循环')).toHaveCount(0);
});

test('editor should add node after dragging from node library to canvas', async ({ page }) => {
  await page.goto('/editor?id=tpl-003');

  const beforeCount = await page.locator('.react-flow__node').count();
  const source = page.locator('.editor-node-library__item', { hasText: '打开网页' }).first();
  const pane = page.locator('.react-flow__pane').first();

  await source.dragTo(pane, {
    targetPosition: { x: 240, y: 180 },
  });

  await expect(page.locator('.react-flow__node')).toHaveCount(beforeCount + 1);
  await expect(page.getByText('打开网页').first()).toBeVisible();
});


test('editor should enter then subflow for control-flow template', async ({ page }) => {
  await page.goto('/editor?id=tpl-004');

  await expect(page.getByText('判断登录状态')).toBeVisible();
  await page.getByText('判断登录状态').first().click();

  await page.getByRole('button', { name: '编辑 THEN' }).first().click();

  await expect(page.getByText('子流程 / 判断登录状态 / THEN').first()).toBeVisible();
  await expect(page.getByText('点击继续')).toBeVisible();
});

test('editor should switch between then and else branches without mixing nodes', async ({ page }) => {
  await page.goto('/editor?id=tpl-004');

  await page.getByText('判断登录状态').first().click();
  await page.getByRole('button', { name: '编辑 THEN' }).first().click();
  await expect(page.getByText('点击继续')).toBeVisible();

  await page.getByRole('button', { name: 'ELSE' }).click();
  await expect(page.getByText('子流程 / 判断登录状态 / ELSE').first()).toBeVisible();
  await expect(page.getByText('跳转登录页')).toBeVisible();
  await expect(page.getByText('点击继续')).not.toBeVisible();
});

test('editor should render mini subflow previews before entering branch editor', async ({ page }) => {
  await page.goto('/editor?id=tpl-004');

  await expect(page.getByTestId('subflow-preview-step-if-001-then')).toBeVisible();
  await expect(page.getByTestId('subflow-preview-step-if-001-else')).toBeVisible();
  await expect(page.getByTestId('subflow-preview-node-step-if-001-then-0')).toHaveText('点击继续');
  await expect(page.getByTestId('subflow-preview-node-step-if-001-else-0')).toHaveText('跳转登录页');
});

test('editor should persist subflow node edits after save and reload', async ({ page }) => {
  await page.goto('/editor?id=tpl-004');

  await page.getByTestId('rf__node-step-if-001').click();
  await page.getByRole('button', { name: '编辑 THEN' }).first().click();
  await page.getByTestId('rf__node-step-then-001').click();

  const renamed = `继续按钮-${Date.now()}`;
  await page.getByLabel('节点名称').fill(renamed);
  await page.getByRole('button', { name: '保存' }).click();

  await expect(page.getByText('保存成功')).toBeVisible();
  await page.reload();

  await page.getByTestId('rf__node-step-if-001').click();
  await page.getByRole('button', { name: '编辑 THEN' }).first().click();
  await expect(page.getByText(renamed)).toBeVisible();
});

test('editor should preview and enter loop body subflow', async ({ page }) => {
  await page.goto('/editor?id=tpl-005');

  await expect(page.getByTestId('subflow-preview-step-for-001-body')).toBeVisible();
  await expect(page.getByTestId('subflow-preview-node-step-for-001-body-0')).toHaveText('重试点击登录');

  await page.getByText('重试三次').first().click();
  await page.getByRole('button', { name: '编辑 BODY' }).first().click();

  await expect(page.getByTestId('subflow-workbench')).toBeVisible();
  await expect(page.getByText('子流程 / 重试三次 / BODY').first()).toBeVisible();
  await expect(page.locator('.editor-node-library__label', { hasText: '退出循环' })).toBeVisible();
  await expect(page.getByText('重试点击登录')).toBeVisible();
  await expect(page.getByText('等待结果反馈')).toBeVisible();
});
