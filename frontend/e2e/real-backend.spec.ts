import { test, expect } from '@playwright/test';

const backendBase = 'http://127.0.0.1:8080/api/v1';

const createRealTemplate = async (
  request: { post: Function; delete: Function },
  steps: unknown[],
  description: string,
) => {
  const templateName = `真实联调模板-${Date.now()}`;
  const response = await request.post(`${backendBase}/templates`, {
    data: {
      name: templateName,
      description,
      schemaVersion: '0.0.4',
      steps,
      otherStep: { nodes: [], edges: [] },
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return {
    id: payload.data.id as string,
    name: templateName,
    cleanup: async () => {
      await request.delete(`${backendBase}/templates/${payload.data.id}`);
    },
  };
};

const createBlankRealTemplate = async (
  request: { post: Function; delete: Function },
  description: string,
) => createRealTemplate(request, [], description);

const dragNodeToCanvas = async (page: import('@playwright/test').Page, label: string, targetPosition = { x: 240, y: 180 }) => {
  const source = page.locator('.editor-node-library__item', { hasText: label }).first();
  const pane = page.locator('.react-flow__pane').first();
  await source.dragTo(pane, { targetPosition });
};

const realIfSteps = [
  {
    id: 'step-real-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开测试页面',
      config: {
        url: 'data:text/html,<html><body><h1 id="title">Ready</h1><button id="continue">Continue</button></body></html>',
      },
    },
  },
  {
    id: 'step-real-extract-001',
    type: 'extract',
    position: { x: 120, y: 180 },
    data: {
      label: '提取标题',
      config: { selector: '#title', as: 'title', mode: 'text' },
    },
  },
  {
    id: 'step-if-real-001',
    type: 'if',
    position: { x: 120, y: 280 },
    data: {
      label: '判断提取结果',
      config: {
        condition: { left: '${title}', op: 'equals', right: 'Ready' },
        then: [
          {
            id: 'step-real-click-001',
            type: 'click',
            position: { x: 100, y: 120 },
            data: {
              label: '点击继续按钮',
              config: { selector: '#continue' },
            },
          },
        ],
        else: [
          {
            id: 'step-real-wait-001',
            type: 'waitFor',
            position: { x: 100, y: 120 },
            data: {
              label: '等待回退',
              config: { waitMs: 100 },
            },
          },
        ],
      },
    },
  },
];

const realWhileSteps = [
  {
    id: 'step-while-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开循环测试页',
      config: {
        url: 'data:text/html,<html><body><h1>Loop</h1></body></html>',
      },
    },
  },
  {
    id: 'step-while-real-001',
    type: 'while',
    position: { x: 120, y: 200 },
    data: {
      label: '循环等待两次',
      config: {
        condition: { left: '1', op: 'equals', right: '1' },
        maxIterations: 2,
        body: [
          {
            id: 'step-while-wait-001',
            type: 'waitFor',
            position: { x: 100, y: 120 },
            data: {
              label: '等待 10ms',
              config: { waitMs: 10 },
            },
          },
        ],
      },
    },
  },
];

const realFailureSteps = [
  {
    id: 'step-fail-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开失败测试页',
      config: {
        url: 'data:text/html,<html><body><h1 id="title">Ready</h1></body></html>',
      },
    },
  },
  {
    id: 'step-fail-if-001',
    type: 'if',
    position: { x: 120, y: 200 },
    data: {
      label: '判断失败分支',
      config: {
        condition: { left: 'ready', op: 'equals', right: 'ready' },
        then: [
          {
            id: 'step-fail-click-001',
            type: 'click',
            position: { x: 100, y: 120 },
            data: {
              label: '点击不存在按钮',
              config: { selector: '#missing-button' },
            },
          },
        ],
        else: [],
      },
    },
  },
];

test('editor should load real backend control-flow template', async ({ page, request }) => {
  const template = await createRealTemplate(request, realIfSteps, 'real backend integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);

    await expect(page.getByText('判断提取结果')).toBeVisible();
    await expect(page.getByTestId('subflow-preview-step-if-real-001-then')).toBeVisible();
    await expect(page.getByTestId('subflow-preview-node-step-if-real-001-then-0')).toHaveText('点击继续按钮');
    await expect(page.getByTestId('subflow-preview-node-step-if-real-001-else-0')).toHaveText('等待回退');
  } finally {
    await template.cleanup();
  }
});

test('editor should run real backend template and receive stepPath events', async ({ page, request }) => {
  const template = await createRealTemplate(request, realIfSteps, 'real backend integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await page.getByRole('button', { name: '运行' }).click();

    await expect(page.getByText('运行已启动')).toBeVisible();
    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('step-if-real-001 / then / step-real-click-001').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run real while template and show body stepPath events', async ({ page, request }) => {
  const template = await createRealTemplate(request, realWhileSteps, 'real while integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await page.getByRole('button', { name: '运行' }).click();

    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('step-while-real-001 / body / step-while-wait-001').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should surface failed subflow on collapsed container in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realFailureSteps, 'real failure integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await page.getByRole('button', { name: '运行' }).click();

    await expect(page.getByText('STEP_FAILED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('step-fail-if-001 / then / step-fail-click-001').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('container-status-step-fail-if-001')).toBeVisible();
    await expect(page.getByTestId('subflow-status-step-fail-if-001-then')).toContainText('失败');
    await page.getByTestId('locate-failed-step').click();
    await expect(page.getByText('子流程 / 判断失败分支 / THEN').first()).toBeVisible();
    await expect(page.getByText('点击不存在按钮').first()).toBeVisible();
  } finally {
    await template.cleanup();
  }
});

test('editor should author save and run a simple workflow in real backend mode', async ({ page, request }) => {
  const template = await createBlankRealTemplate(request, 'real authoring integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);

    await dragNodeToCanvas(page, '等待', { x: 240, y: 180 });
    await expect(page.locator('.react-flow__node')).toHaveCount(1);

    await page.locator('.react-flow__node').first().click();
    await page.getByText('固定时间').click();
    await expect(page.locator('input[placeholder="1000"]')).toBeVisible();
    await page.locator('input[placeholder="1000"]').fill('20');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('保存成功')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);

    await page.getByRole('button', { name: '运行' }).click();
    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await expect(warningDialog).toBeVisible();
    await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();

    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('成功').first()).toBeVisible();
  } finally {
    await template.cleanup();
  }
});