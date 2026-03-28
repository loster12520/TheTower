import { test, expect } from '@playwright/test';

const backendBase = 'http://127.0.0.1:8080/api/v1';

const createRealTemplate = async (
  request: { post: Function; delete: Function },
  steps: unknown[],
  description: string,
  schemaVersion = '0.0.6',
) => {
  const templateName = `真实联调模板-${Date.now()}`;
  const response = await request.post(`${backendBase}/templates`, {
    data: {
      name: templateName,
      description,
      schemaVersion,
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
      try {
        await request.delete(`${backendBase}/templates/${payload.data.id}`);
      } catch {
        // Ignore cleanup errors when the Playwright request context is already closing.
      }
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

const getFormInputByLabel = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('input').first();

const getFormTextareaByLabel = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('textarea').first();

const clickPrimaryRunButton = async (page: import('@playwright/test').Page) => {
  await page.locator('.editor-toolbar').getByRole('button', { name: /运行/ }).first().click();
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

const realArtifactsSteps = [
  {
    id: 'step-artifact-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开示例页',
      config: {
        url: 'https://example.com',
      },
    },
  },
  {
    id: 'step-artifact-extract-001',
    type: 'extract',
    position: { x: 120, y: 180 },
    data: {
      label: '提取标题',
      config: { selector: 'h1', saveAs: 'title', extractType: 'text' },
    },
  },
  {
    id: 'step-artifact-shot-001',
    type: 'screenshotPage',
    position: { x: 120, y: 280 },
    data: {
      label: '截图页面',
      config: { name: 'real-backend-shot', format: 'png', fullPage: true },
    },
  },
];

const realContextPageSteps = [
  {
    id: 'step-browser-ctx-001',
    type: 'startBrowser',
    position: { x: 120, y: 80 },
    data: {
      label: '浏览器上下文',
      config: {
        onError: 'abort',
        onComplete: 'close',
        body: [
          {
            id: 'step-browser-new-tab1-001',
            type: 'newPage',
            position: { x: 120, y: 120 },
            data: {
              label: '新建主标签页',
              config: { pageAlias: 'tab1', switchToNew: true },
            },
          },
          {
            id: 'step-browser-open-tab1-001',
            type: 'openUrl',
            position: { x: 120, y: 220 },
            data: {
              label: '打开主标签页',
              config: {
                url: 'data:text/html,TabOneActive',
              },
            },
          },
          {
            id: 'step-browser-new-tab2-001',
            type: 'newPage',
            position: { x: 120, y: 320 },
            data: {
              label: '新建次标签页',
              config: { pageAlias: 'tab2', switchToNew: true },
            },
          },
          {
            id: 'step-browser-open-tab2-001',
            type: 'openUrl',
            position: { x: 120, y: 420 },
            data: {
              label: '打开次标签页',
              config: {
                url: 'data:text/html,TabTwoActive',
              },
            },
          },
          {
            id: 'step-browser-switch-tab1-001',
            type: 'switchPage',
            position: { x: 120, y: 520 },
            data: {
              label: '切回主标签页',
              config: { matchBy: 'alias', matchType: 'equals', value: 'tab1' },
            },
          },
          {
            id: 'step-browser-get-url-001',
            type: 'getUrl',
            position: { x: 120, y: 620 },
            data: {
              label: '记录当前地址',
              config: { saveAs: 'activeUrl' },
            },
          },
          {
            id: 'step-browser-close-tab2-001',
            type: 'closePage',
            position: { x: 120, y: 720 },
            data: {
              label: '关闭次标签页',
              config: { pageAlias: 'tab2' },
            },
          },
        ],
      },
    },
  },
];

const realDebugPreviewSteps = [
  {
    id: 'step-debug-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开调试页面',
      config: {
        url: 'data:text/html,<html><body style="font-family:sans-serif"><h1 id="debug-title">Debug Preview Ready</h1><p id="tick">frame stream</p><script>let i=0;setInterval(()=>{document.getElementById("tick").textContent=`frame-${++i}`;},200);</script></body></html>',
      },
    },
  },
  {
    id: 'step-debug-wait-001',
    type: 'waitFor',
    position: { x: 120, y: 180 },
    data: {
      label: '等待调试帧稳定',
      config: { waitMs: 1400 },
    },
  },
];

const realBreakpointSteps = [
  {
    id: 'step-bp-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开断点测试页',
      config: {
        url: 'data:text/html,<html><body><h1 id="title">Breakpoint Ready</h1></body></html>',
      },
    },
  },
  {
    id: 'step-bp-extract-001',
    type: 'extract',
    position: { x: 120, y: 180 },
    data: {
      label: '断点提取标题',
      config: {
        selector: '#title',
        saveAs: 'pageTitle',
        extractType: 'text',
        breakpoint: true,
      },
    },
  },
  {
    id: 'step-bp-wait-001',
    type: 'waitFor',
    position: { x: 120, y: 280 },
    data: {
      label: '断点后等待',
      config: {
        waitMs: 30,
      },
    },
  },
];

const realCallWorkflowChildSteps = [
  {
    id: 'step-child-convert-001',
    type: 'convertJson',
    position: { x: 120, y: 80 },
    data: {
      label: '解析子流程输入',
      config: {
        value: '${payload}',
        direction: 'parse',
        saveAs: 'parsedPayload',
      },
    },
  },
  {
    id: 'step-child-extract-001',
    type: 'extractKey',
    position: { x: 120, y: 180 },
    data: {
      label: '提取子流程标题',
      config: {
        inputVar: 'parsedPayload',
        keyPath: 'data.items[0].title',
        saveAs: 'childTitle',
      },
    },
  },
];

const createRealCallWorkflowParentSteps = (workflowId: string) => ([
  {
    id: 'step-parent-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开父流程页面',
      config: {
        url: 'data:text/html,<html><body>parent ready</body></html>',
      },
    },
  },
  {
    id: 'step-parent-js-001',
    type: 'executeJs',
    position: { x: 120, y: 180 },
    data: {
      label: '生成子流程地址',
      config: {
        javascript: '() => JSON.stringify({ data: { items: [{ title: "Nested Works" }] } })',
        saveAs: 'childSource',
      },
    },
  },
  {
    id: 'step-parent-call-001',
    type: 'callWorkflow',
    position: { x: 120, y: 280 },
    data: {
      label: '调用子流程取标题',
      config: {
        workflowId,
        inputMapping: { payload: 'childSource' },
        outputVar: 'childResult',
      },
    },
  },
]);

const realDataStepTemplateSteps = [
  {
    id: 'step-data-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开数据步骤页',
      config: {
        url: 'data:text/html,<html><body>data steps ready</body></html>',
      },
    },
  },
  {
    id: 'step-data-js-001',
    type: 'executeJs',
    position: { x: 120, y: 180 },
    data: {
      label: '生成对象 JSON',
      config: {
        javascript: '() => JSON.stringify({ data: { items: [{ title: "Alpha" }] } })',
        saveAs: 'rawObject',
      },
    },
  },
  {
    id: 'step-data-convert-001',
    type: 'convertJson',
    position: { x: 120, y: 280 },
    data: {
      label: '转换对象文本',
      config: {
        value: '${rawObject}',
        direction: 'parse',
        saveAs: 'parsedObject',
      },
    },
  },
  {
    id: 'step-data-extract-001',
    type: 'extractKey',
    position: { x: 120, y: 380 },
    data: {
      label: '提取标题字段',
      config: {
        inputVar: 'parsedObject',
        keyPath: 'data.items[0].title',
        saveAs: 'firstTitle',
      },
    },
  },
  {
    id: 'step-data-js-002',
    type: 'executeJs',
    position: { x: 120, y: 480 },
    data: {
      label: '生成数组 JSON',
      config: {
        javascript: '() => JSON.stringify([{ name: "Solo" }])',
        saveAs: 'rawList',
      },
    },
  },
  {
    id: 'step-data-random-001',
    type: 'randomGet',
    position: { x: 120, y: 580 },
    data: {
      label: '随机取一个元素',
      config: {
        inputVar: 'rawList',
        saveAs: 'pickedItem',
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
    await clickPrimaryRunButton(page);

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
    await clickPrimaryRunButton(page);

    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

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
    await clickPrimaryRunButton(page);

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
    await expect(page.getByLabel('固定等待（毫秒）')).toBeVisible();
    await page.getByLabel('固定等待（毫秒）').fill('20');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('保存成功')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(1);

    await clickPrimaryRunButton(page);
    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('成功').first()).toBeVisible();
  } finally {
    await template.cleanup();
  }
});

test('editor should show grouped node library for 0.0.6 steps', async ({ page, request }) => {
  const template = await createBlankRealTemplate(request, 'grouped node library test');

  try {
    await page.goto(`/editor?id=${template.id}`);

    await expect(page.getByTestId('node-group-page')).toContainText('页面操作');
    await expect(page.getByTestId('node-group-page')).toContainText('新建标签页');
    await expect(page.getByTestId('node-group-wait')).toContainText('等待响应');
    await expect(page.getByTestId('node-group-data')).toContainText('获取 Cookies');
    await expect(page.getByTestId('node-group-flow')).toContainText('遍历数据');
  } finally {
    await template.cleanup();
  }
});

test('editor should render outputs and artifacts after real backend 0.0.6 run', async ({ page, request }) => {
  const template = await createRealTemplate(request, realArtifactsSteps, 'real outputs artifacts integration test');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await clickPrimaryRunButton(page);

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    const artifactCard = page.locator('.ant-card').filter({ hasText: '产物摘要' });

    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('输出摘要')).toBeVisible();
    await expect(page.getByText('产物摘要')).toBeVisible();
    await expect(outputCard.getByText('title', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('Example Domain', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(artifactCard.getByText('screenshot', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(artifactCard.getByText('real-backend-shot.png', { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run browser context multi-page workflow in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realContextPageSteps, 'real browser context multi-page test');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await clickPrimaryRunButton(page);

    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    await expect(page.getByText('运行监控')).toBeVisible();
    await expect(page.getByText('step-browser-ctx-001 / body / step-browser-switch-tab1-001').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('输出摘要')).toBeVisible();
    await expect(page.locator('.ant-card').filter({ hasText: '输出摘要' }).getByText('activeUrl', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ant-card').filter({ hasText: '输出摘要' }).getByText(/TabOneActive/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('成功').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should show debug preview fullscreen and debug controls in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realDebugPreviewSteps, 'real debug preview integration test', '0.0.6');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await page.getByRole('button', { name: '调试运行' }).click();

    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    await expect(page.getByText('运行监控')).toBeVisible();
    const debugCard = page.locator('.ant-card').filter({ hasText: '调试预览' });
    await expect(debugCard.getByText('调试预览', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('近实时浏览器预览')).toBeVisible({ timeout: 20_000 });
    const previewImage = page.locator('img[alt="调试预览"]');
    await expect(previewImage).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('可见浏览器', { exact: true })).toBeVisible();
    await expect(debugCard.getByText('DevTools', { exact: true })).toBeVisible();
    const firstFrame = await previewImage.getAttribute('src');
    await page.waitForTimeout(900);
    const secondFrame = await previewImage.getAttribute('src');
    expect(firstFrame).toBeTruthy();
    expect(secondFrame).toBeTruthy();
    expect(secondFrame).not.toBe(firstFrame);
    await debugCard.getByRole('button', { name: '打开浏览器调试' }).click();
    await expect(debugCard.getByText('调试预览', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: '全屏' }).click();
    await expect(page.getByRole('dialog').getByText('调试预览全屏')).toBeVisible();
    await expect(page.locator('img[alt="调试预览全屏"]')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/step-debug-open-001/).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog').getByText('调试预览全屏')).toHaveCount(0);

    await debugCard.getByRole('button', { name: '关闭调试预览' }).click();
    await expect(page.getByText('调试预览已关闭', { exact: true })).toBeVisible();
    await expect(page.locator('img[alt="调试预览"]')).toHaveCount(0);
  } finally {
    await template.cleanup();
  }
});

test('editor should pause on breakpoint and support step then continue in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realBreakpointSteps, 'real breakpoint integration test', '0.0.7');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.getByTestId('breakpoint-badge-step-bp-extract-001')).toBeVisible();

    await page.getByRole('button', { name: '调试运行' }).click();

    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    await expect(page.getByText('调试已暂停')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('step-bp-extract-001').first()).toBeVisible();

    await page.getByRole('button', { name: '单步' }).click();
    await expect(page.getByText('已发送单步执行')).toBeVisible();
    await expect(page.getByText('调试已暂停')).toBeVisible({ timeout: 20_000 });
    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('pageTitle', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('Breakpoint Ready', { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: '继续' }).click();
    await expect(page.getByText('调试运行已继续')).toBeVisible();
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should author and run 0.0.7 data steps in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realDataStepTemplateSteps, 'real 0.0.7 data steps authoring test', '0.0.7');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(6);

    await page.getByText('转换对象文本').first().click();
    await getFormInputByLabel(page, '输出变量').fill('parsedPayload');

    await page.getByText('提取标题字段').first().click();
    await getFormInputByLabel(page, '输入变量').fill('parsedPayload');

    await page.getByText('随机取一个元素').first().click();
    await getFormInputByLabel(page, '输出变量').fill('chosenItem');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('保存成功')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(6);

    await clickPrimaryRunButton(page);
    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('firstTitle', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('Alpha', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('chosenItem', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('{"name":"Solo"}', { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should author and run callWorkflow with input mapping in real backend mode', async ({ page, request }) => {
  const childTemplate = await createRealTemplate(request, realCallWorkflowChildSteps, 'real callWorkflow child test', '0.0.7');
  const parentTemplate = await createRealTemplate(request, createRealCallWorkflowParentSteps(childTemplate.id), 'real callWorkflow parent authoring test', '0.0.7');

  try {
    await page.goto(`/editor?id=${parentTemplate.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(3);

    await page.getByText('调用子流程取标题').first().click();
    await getFormTextareaByLabel(page, '参数映射 JSON').fill('{"payload":"childSource"}');
    await getFormInputByLabel(page, '结果变量').fill('childPayload');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('保存成功')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(3);

    await clickPrimaryRunButton(page);
    const warningDialog = page.getByRole('dialog', { name: '警告' });
    await Promise.race([
      warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
      page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    ]);
    if (await warningDialog.isVisible().catch(() => false)) {
      await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
    }

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    const childPayloadRow = outputCard.locator('tr').filter({ hasText: 'childPayload' });
    await expect(outputCard.getByText('childPayload', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(childPayloadRow.getByText(/"childTitle":"Nested Works"/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await parentTemplate.cleanup();
    await childTemplate.cleanup();
  }
});