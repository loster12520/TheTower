import { test, expect } from '@playwright/test';

const backendBase = 'http://127.0.0.1:8080/api/v1';

const createPerformanceTemplate = async (request: import('@playwright/test').APIRequestContext) => {
  const steps = Array.from({ length: 50 }, (_, index) => ({
    id: `perf-step-${index + 1}`,
    type: 'waitFor',
    position: {
      x: 120 + (index % 5) * 220,
      y: 80 + Math.floor(index / 5) * 120,
    },
    data: {
      label: `性能节点 ${index + 1}`,
      config: {
        waitMs: 10,
        saveAs: `waitResult${index + 1}`,
      },
    },
  }));

  const response = await request.post(`${backendBase}/templates`, {
    data: {
      name: `50 节点性能模板-${Date.now()}`,
      description: '用于验证 50 节点画布性能',
      schemaVersion: '0.0.8',
      steps,
      otherStep: { nodes: [], edges: [] },
    },
  });

  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  return {
    id: payload.data.id as string,
    cleanup: async () => {
      try {
        await request.delete(`${backendBase}/templates/${payload.data.id}`);
      } catch {
      }
    },
  };
};

test('editor should measure 50 node canvas responsiveness', async ({ page, request }) => {
  const template = await createPerformanceTemplate(request);

  try {
    const renderStartedAt = Date.now();
    await page.goto(`/editor?id=${template.id}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.react-flow__node')).toHaveCount(50, { timeout: 30_000 });
    const renderMs = Date.now() - renderStartedAt;

    const targetNode = page.getByTestId('rf__node-perf-step-50');
    const selectionStartedAt = Date.now();
    await targetNode.click();
    await expect(page.getByLabel('节点名称')).toHaveValue('性能节点 50');
    const selectionMs = Date.now() - selectionStartedAt;

    const dragNode = page.getByTestId('rf__node-perf-step-11');
    const pane = page.locator('.react-flow__pane').first();
    const beforeBox = await dragNode.boundingBox();
    const paneBox = await pane.boundingBox();
    if (!beforeBox) {
      throw new Error('无法获取拖拽前节点位置');
    }
    if (!paneBox) {
      throw new Error('无法获取画布位置');
    }

    const dragStartedAt = Date.now();
    await page.mouse.move(beforeBox.x + beforeBox.width / 2, beforeBox.y + beforeBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      paneBox.x + Math.round(beforeBox.x - paneBox.x + 140),
      paneBox.y + Math.round(beforeBox.y - paneBox.y + 40),
      { steps: 12 },
    );
    await page.mouse.up();
    await expect.poll(async () => {
      const box = await dragNode.boundingBox();
      return box ? Math.round(box.x - beforeBox.x) : 0;
    }).toBeGreaterThan(40);
    const dragMs = Date.now() - dragStartedAt;

    console.log(JSON.stringify({
      nodeCount: 50,
      renderMs,
      selectionMs,
      dragMs,
    }));

    expect(renderMs).toBeLessThan(5000);
  } finally {
    await template.cleanup();
  }
});