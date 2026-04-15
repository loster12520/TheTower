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

const createBlankTemplateFromHome = async (page: import('@playwright/test').Page, name: string, description: string) => {
  await page.goto('/');
  await page.getByRole('button', { name: '新建模板' }).click();

  const dialog = page.getByRole('dialog', { name: '新建模板' });
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.locator('input[placeholder="例如：抓取网页标题"]').fill(name);
  await dialog.locator('textarea[placeholder="简要描述这个工作流的功能..."]').fill(description);
  await dialog.getByRole('button', { name: /创\s*建/ }).click();

  await expect(page).toHaveURL(/\/editor\?id=/);
};

const openHomeCardMenu = async (page: import('@playwright/test').Page, title: string) => {
  const card = page.locator('.template-card', { hasText: title }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.locator('.ant-card-actions .ant-btn-link').last().click();
  return card;
};

const dragNodeToCanvas = async (page: import('@playwright/test').Page, label: string, targetPosition = { x: 240, y: 180 }) => {
  const source = page.locator('.editor-node-library__item', { hasText: label }).first();
  const pane = page.locator('.react-flow__pane').first();
  await source.dragTo(pane, { targetPosition });
};

const dragNodeNearNodeToAutoConnect = async (page: import('@playwright/test').Page, draggedIndex: number, targetIndex: number) => {
  const nodes = page.locator('.react-flow__node');
  const targetBox = await nodes.nth(targetIndex).boundingBox();
  const draggedBox = await nodes.nth(draggedIndex).boundingBox();

  if (!targetBox || !draggedBox) {
    throw new Error('无法获取节点位置');
  }

  const startX = draggedBox.x + draggedBox.width / 2;
  const startY = draggedBox.y + draggedBox.height / 2;
  const targetX = targetBox.x + targetBox.width - 8 + draggedBox.width / 2;
  const targetY = targetBox.y + targetBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, targetY, { steps: 12 });
  await page.mouse.up();
};

const dragSecondNodeNearFirstToAutoConnect = async (page: import('@playwright/test').Page) => {
  await dragNodeNearNodeToAutoConnect(page, 1, 0);
};

const connectNodesByHandle = async (page: import('@playwright/test').Page, sourceIndex: number, targetIndex: number) => {
  const nodes = page.locator('.react-flow__node');
  const sourceHandle = nodes.nth(sourceIndex).locator('[data-handle-position="right"]').first();
  const targetHandle = nodes.nth(targetIndex).locator('[data-handle-position="left"]').first();
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('无法获取连线锚点位置');
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 });
  await page.mouse.up();
};

const getFormInputByLabel = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('input:not([type="radio"]):not([type="checkbox"])').first();

const getFormTextareaByLabel = (page: import('@playwright/test').Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('textarea').first();

const clickPrimaryRunButton = async (page: import('@playwright/test').Page) => {
  await page
    .locator('.editor-toolbar')
    .getByRole('button', { name: /运行/ })
    .filter({ hasNotText: '参数' })
    .filter({ hasNotText: '调试' })
    .filter({ hasNotText: '暂停' })
    .first()
    .click();
};

const clickCanvasNode = async (page: import('@playwright/test').Page, nodeId: string, label: string) => {
  await page.getByTestId(`rf__node-${nodeId}`).dispatchEvent('click');
  await expect(page.getByLabel('节点名称')).toHaveValue(label);
};

const acceptWarningDialogIfPresent = async (page: import('@playwright/test').Page) => {
  const warningDialog = page.getByRole('dialog', { name: '警告' });
  await Promise.race([
    warningDialog.waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
    page.getByText('运行监控').waitFor({ state: 'visible', timeout: 3_000 }).catch(() => null),
  ]);

  if (await warningDialog.isVisible().catch(() => false)) {
    await warningDialog.getByRole('button', { name: /OK|确\s*定/ }).click();
  }
};

const expandTechnicalDetails = async (page: import('@playwright/test').Page) => {
  const collapse = page.getByTestId('runpanel-technical-details');
  await expect(collapse).toBeVisible({ timeout: 20_000 });

  const item = collapse.locator('.ant-collapse-item').first();
  const isActive = await item.evaluate((element) => element.classList.contains('ant-collapse-item-active'));
  if (!isActive) {
    await collapse.locator('.ant-collapse-header').first().click();
  }

  await expect(collapse.getByText('变量检查器', { exact: true })).toBeVisible({ timeout: 20_000 });
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

const realAutoRunSteps = [
  {
    id: 'step-auto-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开自动运行测试页',
      config: {
        url: 'data:text/html,<html><body><h1 id="auto-title">Auto Run Ready</h1></body></html>',
      },
    },
  },
  {
    id: 'step-auto-wait-001',
    type: 'waitFor',
    position: { x: 120, y: 180 },
    data: {
      label: '短暂等待',
      config: {
        waitMs: 80,
      },
    },
  },
];

const realDebugRetainSteps = [
  {
    id: 'step-retain-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开保留现场页',
      config: {
        url: 'data:text/html,<html><body style="font-family:sans-serif"><h1 id="retain-title">Retain Debug</h1><p id="retain-status">ready</p><script>let tick=0;setInterval(()=>{document.getElementById("retain-status").textContent=`tick-${++tick}`;},150);</script></body></html>',
      },
    },
  },
  {
    id: 'step-retain-wait-001',
    type: 'waitFor',
    position: { x: 120, y: 180 },
    data: {
      label: '等待现场稳定',
      config: {
        waitMs: 900,
      },
    },
  },
];

const realNewStepsAuthoringTemplateSteps = [
  {
    id: 'step-new-open-keyboard-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开键盘测试页',
      config: {
        url: 'data:text/html,<html><body><input id="box" /><div id="status">idle</div><script>const box=document.getElementById("box");document.addEventListener("keydown",(e)=>{if(e.key==="Enter"){document.getElementById("status").textContent="enter-fired";}if(e.ctrlKey&&e.key.toLowerCase()==="k"){document.getElementById("status").textContent="ctrl-k-fired";e.preventDefault();}});</script></body></html>',
      },
    },
  },
  {
    id: 'step-new-focus-001',
    type: 'focus',
    position: { x: 120, y: 180 },
    data: {
      label: '聚焦输入框',
      config: { selector: '#box' },
    },
  },
  {
    id: 'step-new-keyboard-press-001',
    type: 'keyboardPress',
    position: { x: 120, y: 280 },
    data: {
      label: '按下按键测试',
      config: { key: 'Space' },
    },
  },
  {
    id: 'step-new-extract-press-001',
    type: 'extract',
    position: { x: 120, y: 380 },
    data: {
      label: '记录单键结果',
      config: { selector: '#status', saveAs: 'pressStatus', extractType: 'text' },
    },
  },
  {
    id: 'step-new-keyboard-hotkey-001',
    type: 'keyboardHotkey',
    position: { x: 120, y: 480 },
    data: {
      label: '组合热键测试',
      config: { modifiers: ['Alt'], key: 'x' },
    },
  },
  {
    id: 'step-new-extract-hotkey-001',
    type: 'extract',
    position: { x: 120, y: 580 },
    data: {
      label: '记录热键结果',
      config: { selector: '#status', saveAs: 'hotkeyStatus', extractType: 'text' },
    },
  },
  {
    id: 'step-new-js-001',
    type: 'executeJs',
    position: { x: 120, y: 680 },
    data: {
      label: '生成原始文本',
      config: { javascript: '() => "order=12345"', saveAs: 'rawText' },
    },
  },
  {
    id: 'step-new-text-extract-001',
    type: 'textExtract',
    position: { x: 120, y: 780 },
    data: {
      label: '文本提取测试',
      config: { input: '${rawText}', pattern: 'invoice=(\\d+)', groupIndex: 0, saveAs: 'badOrderId' },
    },
  },
  {
    id: 'step-new-open-page-one-001',
    type: 'openUrl',
    position: { x: 120, y: 880 },
    data: {
      label: '打开第一页',
      config: { url: 'data:text/html,page-one' },
    },
  },
  {
    id: 'step-new-open-page-two-001',
    type: 'openUrl',
    position: { x: 120, y: 980 },
    data: {
      label: '打开第二页',
      config: { url: 'data:text/html,page-two' },
    },
  },
  {
    id: 'step-new-go-back-001',
    type: 'goBack',
    position: { x: 120, y: 1080 },
    data: {
      label: '页面后退测试',
      config: {},
    },
  },
  {
    id: 'step-new-get-back-url-001',
    type: 'getUrl',
    position: { x: 120, y: 1180 },
    data: {
      label: '记录后退地址',
      config: { saveAs: 'backUrl' },
    },
  },
  {
    id: 'step-new-page-main-001',
    type: 'newPage',
    position: { x: 120, y: 1280 },
    data: {
      label: '创建主标签页',
      config: { pageAlias: 'main', switchToNew: true },
    },
  },
  {
    id: 'step-new-open-main-001',
    type: 'openUrl',
    position: { x: 120, y: 1380 },
    data: {
      label: '打开主标签页',
      config: { url: 'data:text/html,main-page' },
    },
  },
  {
    id: 'step-new-page-temp-001',
    type: 'newPage',
    position: { x: 120, y: 1480 },
    data: {
      label: '创建临时标签页',
      config: { pageAlias: 'temp', switchToNew: true },
    },
  },
  {
    id: 'step-new-open-temp-001',
    type: 'openUrl',
    position: { x: 120, y: 1580 },
    data: {
      label: '打开临时标签页',
      config: { url: 'data:text/html,temp-page' },
    },
  },
  {
    id: 'step-new-close-other-pages-001',
    type: 'closeOtherPages',
    position: { x: 120, y: 1680 },
    data: {
      label: '关闭其他标签页测试',
      config: { keep: 'current', pageAlias: '' },
    },
  },
  {
    id: 'step-new-switch-main-001',
    type: 'switchPage',
    position: { x: 120, y: 1780 },
    data: {
      label: '切换主标签页',
      config: { matchBy: 'alias', matchType: 'equals', value: 'main' },
    },
  },
  {
    id: 'step-new-get-main-url-001',
    type: 'getUrl',
    position: { x: 120, y: 1880 },
    data: {
      label: '记录保留地址',
      config: { saveAs: 'retainedUrl' },
    },
  },
];

const realElementRefOrderHtml = `data:text/html,<html><body><div id="status">idle</div><button class="action" onclick="document.getElementById('status').textContent='clicked-1'">First</button><button class="action" onclick="document.getElementById('status').textContent='clicked-2'">Second</button><button class="action" onclick="document.getElementById('status').textContent='clicked-3'">Third</button></body></html>`;

const realElementRefOrderSteps = [
  {
    id: 'step-element-ref-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开元素引用测试页',
      config: {
        url: realElementRefOrderHtml,
      },
    },
  },
  {
    id: 'step-element-ref-extract-001',
    type: 'extract',
    position: { x: 120, y: 180 },
    data: {
      label: '提取目标元素引用',
      config: {
        selector: '.action',
        saveAs: 'targetButton',
        extractType: 'elementRef',
        elementOrder: { type: 'index', index: 1 },
      },
    },
  },
  {
    id: 'step-element-ref-click-001',
    type: 'click',
    position: { x: 120, y: 280 },
    data: {
      label: '点击引用元素',
      config: {
        elementRefVar: 'targetButton',
      },
    },
  },
  {
    id: 'step-element-ref-status-001',
    type: 'extract',
    position: { x: 120, y: 380 },
    data: {
      label: '提取点击状态',
      config: {
        selector: '#status',
        saveAs: 'clickedStatus',
        extractType: 'text',
      },
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

const realRequestListenerSteps = [
  {
    id: 'step-listen-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开监听测试页',
      config: {
        url: 'data:text/html,<html><body><h1>Request Listener Ready</h1></body></html>',
      },
    },
  },
  {
    id: 'step-listen-trigger-001',
    type: 'listenRequestTrigger',
    position: { x: 120, y: 180 },
    data: {
      label: '开始监听健康检查',
      config: {
        listenerId: 'health-listener',
        urlPattern: '/api/v1/health',
        matchType: 'contains',
        method: 'GET',
      },
    },
  },
  {
    id: 'step-listen-fetch-001',
    type: 'executeJs',
    position: { x: 120, y: 280 },
    data: {
      label: '触发健康检查请求',
      config: {
        javascript: '() => fetch("http://127.0.0.1:8080/api/v1/health").then(async (response) => `${response.status}:${await response.text()}`)',
        saveAs: 'healthPayload',
      },
    },
  },
  {
    id: 'step-listen-result-001',
    type: 'listenRequestResult',
    position: { x: 120, y: 380 },
    data: {
      label: '读取监听结果',
      config: {
        listenerId: 'health-listener',
        saveAs: 'requestSnapshot',
      },
    },
  },
  {
    id: 'step-listen-stop-001',
    type: 'stopPageListen',
    position: { x: 120, y: 480 },
    data: {
      label: '停止监听',
      config: {
        listenerId: 'health-listener',
      },
    },
  },
];

const realFileExcelSteps = [
  {
    id: 'step-file-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开文件测试页',
      config: {
        url: 'data:text/html,<html><body><h1>File And Excel Ready</h1></body></html>',
      },
    },
  },
  {
    id: 'step-file-js-001',
    type: 'executeJs',
    position: { x: 120, y: 180 },
    data: {
      label: '生成表格数据',
      config: {
        javascript: '() => JSON.stringify([{ name: "Alpha", score: "9" }, { name: "Beta", score: "7" }])',
        saveAs: 'tableRows',
      },
    },
  },
  {
    id: 'step-file-save-excel-001',
    type: 'saveExcel',
    position: { x: 120, y: 280 },
    data: {
      label: '保存成绩表',
      config: {
        inputVar: 'tableRows',
        fileName: 'scores.xlsx',
        saveAs: 'excelArtifact',
      },
    },
  },
  {
    id: 'step-file-import-excel-001',
    type: 'importExcel',
    position: { x: 120, y: 380 },
    data: {
      label: '读取成绩表',
      config: {
        path: '${excelArtifact}',
        saveAs: 'importedRows',
      },
    },
  },
  {
    id: 'step-file-save-data-001',
    type: 'saveData',
    position: { x: 120, y: 480 },
    data: {
      label: '保存导入结果',
      config: {
        content: '${importedRows}',
        fileName: 'scores-imported.json',
        saveAs: 'savedJsonPath',
      },
    },
  },
];

const realActiveElementSteps = [
  {
    id: 'step-active-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开焦点元素测试页',
      config: {
        url: 'data:text/html,<html><body><label for="focus-box">Focus Box</label><input id="focus-box" value="Alpha Focus" /><p id="hint">ready</p></body></html>',
      },
    },
  },
  {
    id: 'step-active-focus-001',
    type: 'focus',
    position: { x: 120, y: 180 },
    data: {
      label: '聚焦输入框',
      config: {
        selector: '#focus-box',
      },
    },
  },
  {
    id: 'step-active-extract-value-001',
    type: 'extractActiveElement',
    position: { x: 120, y: 280 },
    data: {
      label: '提取焦点值',
      config: {
        extractType: 'value',
        saveAs: 'activeValue',
      },
    },
  },
  {
    id: 'step-active-extract-tag-001',
    type: 'extractActiveElement',
    position: { x: 120, y: 380 },
    data: {
      label: '提取焦点标签',
      config: {
        extractType: 'tagName',
        saveAs: 'activeTag',
      },
    },
  },
];

const realClipboardSteps = [
  {
    id: 'step-clipboard-open-001',
    type: 'openUrl',
    position: { x: 120, y: 80 },
    data: {
      label: '打开剪贴板测试页',
      config: {
        url: 'http://127.0.0.1:8011/',
      },
    },
  },
  {
    id: 'step-clipboard-write-001',
    type: 'executeJs',
    position: { x: 120, y: 180 },
    data: {
      label: '写入剪贴板文本',
      config: {
        javascript: 'async () => { await navigator.clipboard.writeText("Clipboard Hello"); return "written"; }',
        saveAs: 'clipboardWriteStatus',
      },
    },
  },
  {
    id: 'step-clipboard-read-001',
    type: 'getClipboardText',
    position: { x: 120, y: 280 },
    data: {
      label: '读取剪贴板文本',
      config: {
        saveAs: 'clipboardText',
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
    await expandTechnicalDetails(page);
    await expect(page.getByText('step-if-real-001 / then / step-real-click-001').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('home should navigate to editor and auto-start run for 0.0.8 template', async ({ page, request }) => {
  const template = await createRealTemplate(request, realAutoRunSteps, 'real 0.0.8 auto run integration test', '0.0.8');

  try {
    await page.goto('/');

    const templateCard = page.locator('.template-card').filter({ hasText: template.name }).first();
    await expect(templateCard).toBeVisible({ timeout: 20_000 });
    await templateCard.getByRole('button', { name: '运行' }).click();

    await expect(page).toHaveURL(new RegExp(`/editor\\?id=${template.id}`));
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('运行已启动')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('短暂等待', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('home should publish template to market and import it in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realAutoRunSteps, 'real market template integration test', '0.0.8');

  try {
    await page.goto('/');

    const templateCard = page.locator('.template-card').filter({ hasText: template.name }).first();
    await expect(templateCard).toBeVisible({ timeout: 20_000 });
    await templateCard.locator('.ant-card-actions .ant-btn-link').last().click();
    await page.locator('.ant-dropdown:visible').getByText('发布到市场').click();
    await expect(page.getByText('已发布到模板市场')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: '模板市场' }).click();
    const drawer = page.getByRole('dialog', { name: '模板市场' });
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText(template.name)).toBeVisible({ timeout: 20_000 });
    await drawer.getByRole('button', { name: /导\s*入/ }).first().click();

    await expect(page.getByText('市场模板已导入')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.template-card', { hasText: `${template.name} 导入副本` }).first()).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('home should create one-time schedule in real backend mode and observe triggered run status', async ({ page, request }) => {
  const template = await createRealTemplate(request, realAutoRunSteps, 'real schedule integration test', '0.0.8');

  try {
    await page.goto('/');

    const templateCard = page.locator('.template-card').filter({ hasText: template.name }).first();
    await expect(templateCard).toBeVisible({ timeout: 20_000 });
    await templateCard.locator('.ant-card-actions .ant-btn-link').last().click();
    await page.locator('.ant-dropdown:visible').getByText('创建调度').click();

    const drawer = page.getByRole('dialog', { name: '调度任务' });
    await expect(drawer).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText(template.name, { exact: true })).toBeVisible({ timeout: 20_000 });
    await drawer.getByLabel('延迟秒数').fill('1');
    await drawer.getByRole('button', { name: '创建调度' }).click();

    await expect(page.getByText('调度任务已创建')).toBeVisible({ timeout: 20_000 });
    await expect(drawer.locator('.ant-list-item').first().getByText(template.name)).toBeVisible({ timeout: 20_000 });
    await expect(drawer.getByText(/最近运行状态: (PENDING|RUNNING|SUCCEEDED)/)).toBeVisible({ timeout: 10_000 });
  } finally {
    await template.cleanup();
  }
});

test('home should isolate templates by workspace and reveal shared template in real backend mode', async ({ page }) => {
  const templateName = `真实权限协作-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
  await expect(accountDrawer.getByText('Alice 管理员')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端权限与协作闭环');
  await page.goto('/');
  await expect(page.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });

  await openHomeCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(page.getByText('协作成员已更新')).toBeVisible({ timeout: 20_000 });
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '账户权限' }).click();
  await accountDrawer.locator('.ant-select').click();
  await page.locator('.ant-select-dropdown:visible').getByText(/Beta 团队/).click();
  await expect(page.getByText('已切换工作空间')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.template-card', { hasText: templateName })).toHaveCount(0);

  await accountDrawer.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByText('已退出登录')).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('bob@thetower.local');
  await accountDrawer.getByLabel('密码').fill('bob123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
  await expect(accountDrawer.getByText('Bob 协作者')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });
});

test('editor should show online collaborators presence in real backend mode', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `真实在线协作-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端在线协作 presence');
  await page.goto('/');
  await openHomeCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  const alicePresence = page.getByTestId('editor-collaboration-presence');
  await expect(alicePresence).toContainText('在线 1', { timeout: 20_000 });
  await expect(alicePresence).toContainText('Alice 管理员', { timeout: 20_000 });

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(bobPage.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    const bobPresence = bobPage.getByTestId('editor-collaboration-presence');
    await expect(bobPresence).toContainText('在线 2', { timeout: 20_000 });
    await expect(bobPresence).toContainText('Alice 管理员', { timeout: 20_000 });
    await expect(bobPresence).toContainText('Bob 协作者', { timeout: 20_000 });

    await expect(alicePresence).toContainText('在线 2', { timeout: 20_000 });
    await expect(alicePresence).toContainText('Bob 协作者', { timeout: 20_000 });
  } finally {
    await bobContext.close();
  }
});

test('editor should auto reload when collaborator saves remote template in real backend mode', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `真实远端同步-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端远端保存后的自动同步');
  await page.goto('/');
  await openHomeCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(bobPage.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    await dragNodeToCanvas(bobPage, '打开网页', { x: 240, y: 180 });
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1, { timeout: 20_000 });
    await bobPage.locator('.react-flow__node').first().click();
    await bobPage.getByLabel('网址 URL').fill('https://example.com/real-remote-sync');
    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 20_000 });
  } finally {
    await bobContext.close();
  }
});

test('editor should show collaboration conflict in real backend mode when remote template changes while local edits are dirty', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `真实协作冲突-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端远端更新与本地未保存改动的冲突提示');
  await page.goto('/');
  await openHomeCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(bobPage.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    await dragNodeToCanvas(bobPage, '等待', { x: 240, y: 180 });
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1);

    await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.getByTestId('editor-collaboration-autosave-paused-tag')).toBeVisible();
    await expect(page.getByTestId('editor-collaboration-conflict-tag')).toHaveCount(0);

    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

    const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
    await expect(conflictAlert).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('editor-collaboration-conflict-tag')).toBeVisible();
    await expect(conflictAlert).toContainText('协作冲突');
    await expect(conflictAlert).toContainText('Bob');
    await expect(page.getByTestId('editor-collaboration-local-diff')).toContainText('本地变更');
    await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('远端变更');
    await page.locator('.react-flow__pane').click({ position: { x: 16, y: 16 } });
    await expect(page.getByLabel('网址 URL')).toHaveCount(0);
    await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
    const diffModal = page.getByTestId('editor-collaboration-diff-modal');
    await expect(diffModal).toBeVisible();
    await expect(diffModal).toContainText('本地变更');
    await expect(diffModal).toContainText('远端变更');
    await diffModal.getByRole('button', { name: /定位到 打开网页/ }).click();
    await expect(diffModal).toHaveCount(0);
    await expect(page.getByLabel('网址 URL')).toBeVisible();
    await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
    const reopenedDiffModal = page.getByTestId('editor-collaboration-diff-modal');
    await reopenedDiffModal.getByRole('button', { name: /预览远端 等待/ }).click();
    const remotePreviewModal = page.getByTestId('editor-collaboration-remote-preview-modal');
    await expect(remotePreviewModal).toBeVisible();
    await expect(remotePreviewModal).toContainText('等待');
    await expect(remotePreviewModal).toContainText('节点类型');
    await page.getByRole('dialog', { name: '远端节点预览' }).getByRole('button', { name: 'Close' }).click();
    await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
    const adoptDiffModal = page.getByTestId('editor-collaboration-diff-modal');
    await adoptDiffModal.getByRole('button', { name: /采纳远端 等待/ }).click();
    await expect(adoptDiffModal).toHaveCount(0);
    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.locator('.react-flow__node', { hasText: '等待' }).first()).toBeVisible();
    await expect(conflictAlert.getByRole('button', { name: '丢弃并同步' })).toBeVisible();
    await expect(conflictAlert.getByRole('button', { name: '覆盖保存' })).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toContainText(/打开网页|等待/);
  } finally {
    await bobContext.close();
  }
});

test('editor should adopt remote deleted node in real backend mode while keeping local conflict context', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `真实远端删除采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端远端删除节点的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-delete-real');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

  await page.goto('/');
  await openHomeCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible({ timeout: 20_000 });
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible({ timeout: 20_000 });
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(bobPage.locator('.template-card', { hasText: templateName }).first()).toBeVisible({ timeout: 20_000 });
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1);

    await expect(page.getByTestId('editor-collaboration-presence')).toContainText('在线 2', { timeout: 20_000 });
    await page.locator('.react-flow__node').first().click();
    await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-delete-real');
    await expect(page.getByTestId('editor-collaboration-autosave-paused-tag')).toBeVisible();

    await bobPage.locator('.react-flow__node').first().click();
    await bobPage.keyboard.press('Delete');
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(0);
    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

    const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
    await expect(conflictAlert).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('删除节点');
    await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
    const diffModal = page.getByTestId('editor-collaboration-diff-modal');
    await expect(diffModal).toBeVisible();
    await expect(page.getByTestId('editor-collaboration-remote-guidance-alert')).toContainText('建议优先处理远端删除项');
    await diffModal.getByRole('button', { name: /采纳远端删除 打开网页/ }).click();
    await expect(diffModal).toHaveCount(0);
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    await expect(conflictAlert).toHaveCount(0);
  } finally {
    await bobContext.close();
  }
});

test('editor should adopt remote added edge in real backend mode while keeping local conflict context', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `真实远端连线采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端远端新增连线的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 140 });
  await dragNodeToCanvas(page, '点击元素', { x: 220, y: 320 });
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.locator('.react-flow__node', { hasText: '打开网页' }).first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-edge-real');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready');
  await page.locator('.react-flow__node', { hasText: '点击元素' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#submit');
  await connectNodesByHandle(page, 0, 1);
  await dragNodeNearNodeToAutoConnect(page, 2, 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-edge-real');

  const baseGraph = await page.evaluate(() => window.__THETOWER_TEST__?.getRootGraph() || null);
  expect(baseGraph).not.toBeNull();
  if (!baseGraph) {
    throw new Error('无法获取当前画布图结构');
  }

  const injected = await page.evaluate(({ templateId, remoteNodes, remoteEdges, updatedAt }) => {
    return window.__THETOWER_TEST__?.injectCollaborationRemoteDiff({
      patch: {
        templateId,
        savedByUserId: 'remote-bob',
        savedByUserName: 'Bob',
        savedByWorkspaceId: 'remote-workspace',
        savedByWorkspaceName: '协作空间',
        updatedAt,
      },
      remoteNodes,
      remoteEdges,
    }) || false;
  }, {
    templateId: new URL(page.url()).searchParams.get('id') || '',
    remoteNodes: baseGraph.nodes,
    remoteEdges: [
      ...baseGraph.edges,
      {
        id: `remote-edge-real-${Date.now()}`,
        source: baseGraph.nodes[0].id,
        target: baseGraph.nodes[2].id,
        type: 'smoothstep',
      },
    ],
    updatedAt: new Date().toISOString(),
  });
  expect(injected).toBeTruthy();

  const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
  await expect(conflictAlert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('连线变化 +1 / -0');
  await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
  const diffModal = page.getByTestId('editor-collaboration-diff-modal');
  await expect(diffModal).toBeVisible();
  await expect(page.getByTestId('editor-collaboration-remote-guidance-alert')).toContainText('建议先确认远端修改项');
  await diffModal.getByRole('button', { name: /采纳远端新增连线 打开网页 -> 点击元素/ }).click();
  await expect(diffModal).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(3);
  await expect(conflictAlert).toHaveCount(0);
});

test('editor should adopt remote removed edge in real backend mode while keeping local conflict context', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `真实远端删线采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端远端删除连线的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 140 });
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.locator('.react-flow__node', { hasText: '打开网页' }).first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-edge-remove-real');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready-remove-real');
  await connectNodesByHandle(page, 0, 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-edge-remove-real');

  const baseGraph = await page.evaluate(() => window.__THETOWER_TEST__?.getRootGraph() || null);
  expect(baseGraph).not.toBeNull();
  if (!baseGraph) {
    throw new Error('无法获取当前画布图结构');
  }

  const injected = await page.evaluate(({ templateId, remoteNodes, remoteEdges, updatedAt }) => {
    return window.__THETOWER_TEST__?.injectCollaborationRemoteDiff({
      patch: {
        templateId,
        savedByUserId: 'remote-bob',
        savedByUserName: 'Bob',
        savedByWorkspaceId: 'remote-workspace',
        savedByWorkspaceName: '协作空间',
        updatedAt,
      },
      remoteNodes,
      remoteEdges,
    }) || false;
  }, {
    templateId: new URL(page.url()).searchParams.get('id') || '',
    remoteNodes: baseGraph.nodes,
    remoteEdges: [],
    updatedAt: new Date().toISOString(),
  });
  expect(injected).toBeTruthy();

  const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
  await expect(conflictAlert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('连线变化 +0 / -1');
  await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
  const diffModal = page.getByTestId('editor-collaboration-diff-modal');
  await expect(diffModal).toBeVisible();
  await diffModal.getByRole('button', { name: /采纳远端删除连线 打开网页 -> 等待/ }).click();
  await expect(diffModal).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(conflictAlert).toHaveCount(0);
});

test('editor should keep diff modal open for remaining remote changes in real backend mode after partial adoption', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `真实冲突连续采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible({ timeout: 20_000 });
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible({ timeout: 20_000 });

  await createBlankTemplateFromHome(page, templateName, '用于验证真实后端冲突详情可连续采纳多个远端差异');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 160 });
  await connectNodesByHandle(page, 0, 1);
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-multi-adopt-real');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready-multi-adopt-base-real');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible({ timeout: 20_000 });

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-multi-adopt-real');

  const baseGraph = await page.evaluate(() => window.__THETOWER_TEST__?.getRootGraph() || null);
  expect(baseGraph).not.toBeNull();
  if (!baseGraph) {
    throw new Error('无法获取当前画布图结构');
  }

  const injected = await page.evaluate(({ templateId, remoteNodes, remoteEdges, updatedAt }) => {
    return window.__THETOWER_TEST__?.injectCollaborationRemoteDiff({
      patch: {
        templateId,
        savedByUserId: 'remote-bob',
        savedByUserName: 'Bob',
        savedByWorkspaceId: 'remote-workspace',
        savedByWorkspaceName: '协作空间',
        updatedAt,
      },
      remoteNodes,
      remoteEdges,
    }) || false;
  }, {
    templateId: new URL(page.url()).searchParams.get('id') || '',
    remoteNodes: [
      {
        ...baseGraph.nodes[0],
        data: {
          ...baseGraph.nodes[0].data,
          config: {
            ...(baseGraph.nodes[0].data?.config || {}),
            url: 'https://example.com/remote-updated-multi-adopt-real',
          },
        },
      },
    ],
    remoteEdges: [],
    updatedAt: new Date().toISOString(),
  });
  expect(injected).toBeTruthy();

  const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
  await expect(conflictAlert).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('删除节点 1 个');
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('修改节点 1 个');

  await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
  const diffModal = page.getByTestId('editor-collaboration-diff-modal');
  await expect(diffModal).toBeVisible();
  await diffModal.getByRole('button', { name: /采纳远端 打开网页/ }).click();
  await expect(diffModal).toBeVisible();
  await expect(page.getByTestId('editor-collaboration-remote-resolved-alert')).toContainText('已解决 2 项远端差异');
  await expect(diffModal).not.toContainText('采纳远端 打开网页');
  await expect(diffModal).toContainText('采纳远端删除 等待');
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('删除节点 1 个');

  await diffModal.getByRole('button', { name: /采纳远端删除 等待/ }).click();
  await expect(diffModal).toHaveCount(0);
  await expect(page.locator('.react-flow__node')).toHaveCount(1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(conflictAlert).toHaveCount(0);
  await expect(page.getByTestId('editor-collaboration-merge-pending-tag')).toBeVisible();
  const mergePendingAlert = page.getByTestId('editor-collaboration-merge-pending-alert');
  await expect(mergePendingAlert).toBeVisible();
  await expect(mergePendingAlert).toContainText('远端冲突已解决，本地合并结果尚未保存');
  await mergePendingAlert.getByRole('button', { name: '保存合并结果' }).click();
  await expect(page.getByText('已保存本地版本')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('editor-collaboration-merge-pending-tag')).toHaveCount(0);
  await expect(mergePendingAlert).toHaveCount(0);
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
    await expandTechnicalDetails(page);
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

    await expandTechnicalDetails(page);
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
    await expandTechnicalDetails(page);
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
  await expandTechnicalDetails(page);
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
    await expandTechnicalDetails(page);
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
    await expect(page.getByRole('dialog').getByText('当前路径')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog').getByText('调试预览全屏')).toHaveCount(0);

    await debugCard.getByRole('button', { name: '关闭调试预览' }).click();
    await expect(page.getByText('调试预览已关闭', { exact: true })).toBeVisible();
    await expect(page.locator('img[alt="调试预览"]')).toHaveCount(0);
  } finally {
    await template.cleanup();
  }
});

test('editor should retain debug session after 0.0.8 run finishes and show step name', async ({ page, request }) => {
  const template = await createRealTemplate(request, realDebugRetainSteps, 'real 0.0.8 debug retain integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await page.getByRole('button', { name: '调试运行' }).click();
    await acceptWarningDialogIfPresent(page);

    const debugCard = page.locator('.ant-card').filter({ hasText: '调试预览' });
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('运行完成，等待关闭')).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('运行已结束，浏览器现场仍保留。')).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('等待现场稳定', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(debugCard.getByText('结束后保留')).toBeVisible();
    await expect(debugCard.getByText('是', { exact: true })).toBeVisible();
    await expect(page.locator('img[alt="调试预览"]')).toBeVisible({ timeout: 20_000 });

    await debugCard.getByRole('button', { name: '关闭调试预览' }).click();
    await expect(page.getByText('调试预览已关闭', { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should author save reload and run 0.0.8 new step forms in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realNewStepsAuthoringTemplateSteps, 'real 0.0.8 new step authoring test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(19);

    await clickCanvasNode(page, 'step-new-keyboard-press-001', '按下按键测试');
    await getFormInputByLabel(page, '按键').fill('Enter');

    await clickCanvasNode(page, 'step-new-keyboard-hotkey-001', '组合热键测试');
    await getFormInputByLabel(page, '修饰键').fill('Control');
    await getFormInputByLabel(page, '按键').fill('k');

    await clickCanvasNode(page, 'step-new-text-extract-001', '文本提取测试');
    await getFormTextareaByLabel(page, '正则表达式').fill('order=(\\d+)');
    await getFormInputByLabel(page, '分组序号').fill('1');
    await getFormInputByLabel(page, '结果变量').fill('orderId');

    await clickCanvasNode(page, 'step-new-go-back-001', '页面后退测试');
    await expect(page.getByLabel('节点名称')).toHaveValue('页面后退测试');

    await clickCanvasNode(page, 'step-new-close-other-pages-001', '关闭其他标签页测试');
    await page.getByRole('combobox', { name: '保留页面' }).click();
    await page.locator('.ant-select-dropdown').getByText('指定别名', { exact: true }).click();
    await getFormInputByLabel(page, '保留别名').fill('main');

    await page.getByRole('button', { name: '保存' }).click();
    await expect(page.getByText('保存成功')).toBeVisible();

    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(19);

    await clickCanvasNode(page, 'step-new-keyboard-hotkey-001', '组合热键测试');
    await expect(getFormInputByLabel(page, '修饰键')).toHaveValue('Control');
    await expect(getFormInputByLabel(page, '按键')).toHaveValue('k');

    await clickCanvasNode(page, 'step-new-text-extract-001', '文本提取测试');
    await expect(getFormTextareaByLabel(page, '正则表达式')).toHaveValue('order=(\\d+)');
    await expect(getFormInputByLabel(page, '分组序号')).toHaveValue('1');
    await expect(getFormInputByLabel(page, '结果变量')).toHaveValue('orderId');

    await clickCanvasNode(page, 'step-new-close-other-pages-001', '关闭其他标签页测试');
    await expect(getFormInputByLabel(page, '保留别名')).toHaveValue('main');

    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('pressStatus', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('enter-fired', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('hotkeyStatus', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('ctrl-k-fired', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('orderId', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('12345', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('backUrl', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText(/page-one/)).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('retainedUrl', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText(/main-page/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run 0.0.8 elementRefVar and elementOrder workflow in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realElementRefOrderSteps, 'real 0.0.8 element ref integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('clickedStatus', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('clicked-2', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('点击引用元素', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
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
    await expandTechnicalDetails(page);
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

test('editor should run request listener steps in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realRequestListenerSteps, 'real request listener integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(5);

    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('输出摘要')).toBeVisible({ timeout: 20_000 });

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('healthPayload', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText(/200:\{/, { exact: false })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('requestSnapshot', { exact: true })).toBeVisible({ timeout: 20_000 });

    const requestSnapshotRow = outputCard.locator('tr').filter({ hasText: 'requestSnapshot' });
    await expect(requestSnapshotRow.getByText(/"listenerId":"health-listener"/)).toBeVisible({ timeout: 20_000 });
    await expect(requestSnapshotRow.getByText(/"responseCount":1/)).toBeVisible({ timeout: 20_000 });
    await expect(requestSnapshotRow.getByText(/"status":200/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run file and excel steps in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realFileExcelSteps, 'real file excel integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(5);

    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('输出摘要')).toBeVisible({ timeout: 20_000 });

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('excelArtifact', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText(/scores\.xlsx/)).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('importedRows', { exact: true })).toBeVisible({ timeout: 20_000 });

    const importedRowsRow = outputCard.locator('tr').filter({ hasText: 'importedRows' });
    await expect(importedRowsRow.getByText(/"name":"Alpha"/)).toBeVisible({ timeout: 20_000 });
    await expect(importedRowsRow.getByText(/"score":"9"/)).toBeVisible({ timeout: 20_000 });

    const savedJsonRow = outputCard.locator('tr').filter({ hasText: 'savedJsonPath' });
    await expect(outputCard.getByText('savedJsonPath', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(savedJsonRow.getByText(/scores-imported\.json/)).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run extract active element steps in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realActiveElementSteps, 'real active element integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(4);

    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('输出摘要')).toBeVisible({ timeout: 20_000 });

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('activeValue', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('Alpha Focus', { exact: true })).toBeVisible({ timeout: 20_000 });

    const activeTagRow = outputCard.locator('tr').filter({ hasText: 'activeTag' });
    await expect(outputCard.getByText('activeTag', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(activeTagRow.getByText('input', { exact: true })).toBeVisible({ timeout: 20_000 });
  } finally {
    await template.cleanup();
  }
});

test('editor should run clipboard steps in real backend mode', async ({ page, request }) => {
  const template = await createRealTemplate(request, realClipboardSteps, 'real clipboard integration test', '0.0.8');

  try {
    await page.goto(`/editor?id=${template.id}`);
    await expect(page.locator('.react-flow__node')).toHaveCount(3);

    await clickPrimaryRunButton(page);
    await acceptWarningDialogIfPresent(page);
    await expect(page.getByText('运行监控')).toBeVisible({ timeout: 20_000 });
    await expandTechnicalDetails(page);
    await expect(page.getByText('RUN_SUCCEEDED').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('输出摘要')).toBeVisible({ timeout: 20_000 });

    const outputCard = page.locator('.ant-card').filter({ hasText: '输出摘要' });
    await expect(outputCard.getByText('clipboardWriteStatus', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(outputCard.getByText('written', { exact: true })).toBeVisible({ timeout: 20_000 });

    const clipboardRow = outputCard.locator('tr').filter({ hasText: 'clipboardText' });
    await expect(outputCard.getByText('clipboardText', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(clipboardRow.getByText('Clipboard Hello', { exact: true })).toBeVisible({ timeout: 20_000 });
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