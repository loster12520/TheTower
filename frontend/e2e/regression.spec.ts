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

const getFormInputByLabel = (page: Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('input').first();

const getFormTextareaByLabel = (page: Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('textarea').first();

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

  await page.locator('.editor-toolbar').getByRole('button', { name: /运行/ }).first().click();

  const errorDialog = page.getByRole('dialog', { name: '配置有误，无法运行' });
  await expect(errorDialog).toBeVisible();
  await expect(errorDialog.getByText('打开网页: URL 不能为空')).toBeVisible();
});

test('editor should render left right handles and keep node stable when selected', async ({ page }) => {
  const templateName = `回归端口布局-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证左右端口与无抖动选中态');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });

  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();
  await expect(node.locator('[data-handle-position="left"]')).toHaveCount(1);
  await expect(node.locator('[data-handle-position="right"]')).toHaveCount(1);

  const beforeSelect = await node.boundingBox();
  if (!beforeSelect) {
    throw new Error('无法获取选中前节点位置');
  }

  await node.click();
  const afterSelect = await node.boundingBox();
  if (!afterSelect) {
    throw new Error('无法获取选中后节点位置');
  }

  expect(Math.abs(afterSelect.x - beforeSelect.x)).toBeLessThan(1);
  expect(Math.abs(afterSelect.y - beforeSelect.y)).toBeLessThan(1);
  expect(Math.abs(afterSelect.width - beforeSelect.width)).toBeLessThan(1);
  expect(Math.abs(afterSelect.height - beforeSelect.height)).toBeLessThan(1);
});

test('editor should support copy paste undo and redo for selected nodes', async ({ page }) => {
  const templateName = `回归剪贴板-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证复制粘贴与历史');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(1);

  await nodes.first().click();
  await page.keyboard.press('ControlOrMeta+C');
  await page.keyboard.press('ControlOrMeta+V');
  await expect(nodes).toHaveCount(2);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(nodes).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(nodes).toHaveCount(2);
});

test('editor should auto connect nearby nodes after dragging', async ({ page }) => {
  const templateName = `回归自动连线-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证近距离自动连线');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 140 });

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);

  const firstBox = await nodes.nth(0).boundingBox();
  const secondBox = await nodes.nth(1).boundingBox();

  if (!firstBox || !secondBox) {
    throw new Error('无法获取节点位置');
  }

  const startX = secondBox.x + secondBox.width / 2;
  const startY = secondBox.y + secondBox.height / 2;
  const targetX = firstBox.x + firstBox.width - 8 + secondBox.width / 2;
  const targetY = firstBox.y + firstBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();

  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
});

test('editor should persist breakpoint and callWorkflow config after save and reload', async ({ page }) => {
  const templateName = `回归调用子流程-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证 0.0.7 子流程配置与断点持久化');

  await dragNodeToCanvas(page, '调用子流程', { x: 260, y: 160 });
  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();

  await node.click();
  await getFormInputByLabel(page, '模板 ID（手动）').fill('tpl-001');
  await getFormTextareaByLabel(page, '参数映射 JSON').fill('{"token":"sessionToken","account":"activeAccount"}');
  await getFormInputByLabel(page, '结果变量').fill('subflowResult');
  await page.locator('.ant-form-item').filter({ hasText: '断点' }).getByRole('switch').click();

  await expect(page.getByTestId(/breakpoint-badge-/)).toBeVisible();

  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.reload();
  const reloadedNode = page.locator('.react-flow__node').first();
  await expect(reloadedNode).toBeVisible();
  await expect(page.getByTestId(/breakpoint-badge-/)).toBeVisible();

  await reloadedNode.click();
  await expect(getFormInputByLabel(page, '模板 ID（手动）')).toHaveValue('tpl-001');
  await expect(getFormTextareaByLabel(page, '参数映射 JSON')).toHaveValue('{\n  "token": "sessionToken",\n  "account": "activeAccount"\n}');
  await expect(getFormInputByLabel(page, '结果变量')).toHaveValue('subflowResult');
  await expect(page.locator('.ant-form-item').filter({ hasText: '断点' }).getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('editor should persist data-step config after save and reload', async ({ page }) => {
  const templateName = `回归数据步骤-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证 0.0.7 数据步骤配置');

  await dragNodeToCanvas(page, '转换 JSON', { x: 220, y: 140 });
  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();

  await node.click();
  await getFormInputByLabel(page, '输入变量').fill('rawPayload');
  await getFormInputByLabel(page, '输出变量').fill('parsedPayload');

  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.reload();
  await page.locator('.react-flow__node').first().click();
  await expect(getFormInputByLabel(page, '输入变量')).toHaveValue('rawPayload');
  await expect(getFormInputByLabel(page, '输出变量')).toHaveValue('parsedPayload');
});

test('editor should render paused debug panel and allow step/continue actions', async ({ page }) => {
  const templateName = `回归调试暂停-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证 0.0.7 调试暂停与变量检查器');

  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  const node = page.locator('.react-flow__node').first();
  await expect(node).toBeVisible();

  await node.click();
  await getFormInputByLabel(page, '网址 URL').fill('https://example.com');

  const stepId = await node.getAttribute('data-id');
  if (!stepId) {
    throw new Error('无法获取步骤 ID');
  }

  const debugContext = {
    stepId,
    stepPath: [stepId],
    pageAlias: 'page-1',
    contextId: 'ctx-debug-001',
    variables: {
      sessionToken: 'token-001',
      accountName: 'demo-user',
    },
    updatedAt: '2026-04-01T10:00:00.000Z',
  };

  await page.route('**/api/v1/runs', async (route) => {
    const body = route.request().postDataJSON() as { templateId: string; debug?: { pauseOnStart?: boolean } };
    if (!body.debug?.pauseOnStart) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-debug-start',
        data: {
          run: {
            id: 'run-debug-001',
            templateId: body.templateId,
            status: 'RUNNING',
            currentStepId: stepId,
            startedAt: '2026-04-01T10:00:00.000Z',
            finishedAt: null,
            error: null,
            outputs: {},
            artifacts: [],
          },
          wsUrl: '',
          debug: {
            enabled: true,
            openVisibleBrowser: true,
            openDevtools: true,
            previewFps: 2,
            previewQuality: 60,
            pauseOnStart: true,
            breakpoints: [],
            status: 'PAUSED',
            currentStepId: stepId,
            currentStepPath: [stepId],
            pageAlias: 'page-1',
            contextId: 'ctx-debug-001',
            lastFrameTs: null,
            lastError: null,
            latestContext: debugContext,
          },
        },
        error: null,
      }),
    });
  });

  await page.route('**/api/v1/runs/run-debug-001/debug/step', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-debug-step',
        data: {
          enabled: true,
          openVisibleBrowser: true,
          openDevtools: true,
          previewFps: 2,
          previewQuality: 60,
          pauseOnStart: true,
          breakpoints: [],
          status: 'PAUSED',
          currentStepId: stepId,
          currentStepPath: [stepId],
          pageAlias: 'page-1',
          contextId: 'ctx-debug-001',
          lastFrameTs: null,
          lastError: null,
          latestContext: {
            ...debugContext,
            variables: {
              ...debugContext.variables,
              stepCounter: '1',
            },
            updatedAt: '2026-04-01T10:00:01.000Z',
          },
        },
        error: null,
      }),
    });
  });

  await page.route('**/api/v1/runs/run-debug-001/debug/continue', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        requestId: 'req-debug-continue',
        data: {
          enabled: true,
          openVisibleBrowser: true,
          openDevtools: true,
          previewFps: 2,
          previewQuality: 60,
          pauseOnStart: true,
          breakpoints: [],
          status: 'STREAMING',
          currentStepId: stepId,
          currentStepPath: [stepId],
          pageAlias: 'page-1',
          contextId: 'ctx-debug-001',
          lastFrameTs: null,
          lastError: null,
          latestContext: {
            ...debugContext,
            variables: {
              ...debugContext.variables,
              stepCounter: '2',
            },
            updatedAt: '2026-04-01T10:00:02.000Z',
          },
        },
        error: null,
      }),
    });
  });

  await page.getByRole('button', { name: '启动即暂停' }).click();

  await expect(page.getByText('调试运行已启动，并将在首个步骤前暂停')).toBeVisible();
  await expect(page.getByText('运行监控')).toBeVisible();
  await expect(page.getByText('调试已暂停')).toBeVisible();
  await expect(page.getByText('变量检查器')).toBeVisible();
  await expect(page.getByText('sessionToken')).toBeVisible();
  await expect(page.getByText('accountName')).toBeVisible();

  await page.getByRole('button', { name: '单步' }).click();
  await expect(page.getByText('已发送单步执行')).toBeVisible();
  await expect(page.getByText('stepCounter')).toBeVisible();

  await page.getByRole('button', { name: '继续' }).click();
  await expect(page.getByText('调试运行已继续')).toBeVisible();
  await expect(page.locator('.ant-tag').filter({ hasText: '运行中' }).first()).toBeVisible();
  await expect(page.getByText('调试已暂停')).toHaveCount(0);
});