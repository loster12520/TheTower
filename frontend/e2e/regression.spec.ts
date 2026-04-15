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

const dragNodeNearNodeToAutoConnect = async (page: Page, draggedIndex: number, targetIndex: number) => {
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

const dragSecondNodeNearFirstToAutoConnect = async (page: Page) => {
  await dragNodeNearNodeToAutoConnect(page, 1, 0);
};

const connectNodesByHandle = async (page: Page, sourceIndex: number, targetIndex: number) => {
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

const getFormInputByLabel = (page: Page, label: string) =>
  page.locator('.ant-form-item').filter({ hasText: label }).locator('input:not([type="radio"]):not([type="checkbox"])').first();

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

test('home should publish template to market and import it back', async ({ page }) => {
  const templateName = `回归市场-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证模板市场最小闭环');
  await page.goto('/');

  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('发布到市场').click();
  await expect(page.getByText('已发布到模板市场')).toBeVisible();

  await page.getByRole('button', { name: '模板市场' }).click();
  const drawer = page.getByRole('dialog', { name: '模板市场' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(templateName)).toBeVisible();
  await drawer.getByRole('button', { name: /导\s*入/ }).first().click();

  await expect(page.getByText('市场模板已导入')).toBeVisible();
  await expect(page.locator('.template-card', { hasText: `${templateName} 导入副本` }).first()).toBeVisible();
});

test('home should create one-time schedule and observe triggered run status', async ({ page }) => {
  const templateName = `回归调度-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证调度首版闭环');
  await page.goto('/');

  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('创建调度').click();

  const drawer = page.getByRole('dialog', { name: '调度任务' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByText(templateName, { exact: true })).toBeVisible();
  await drawer.getByLabel('延迟秒数').fill('1');
  await drawer.getByRole('button', { name: '创建调度' }).click();

  await expect(page.getByText('调度任务已创建')).toBeVisible();
  await expect(drawer.locator('.ant-list-item').first().getByText(templateName)).toBeVisible();
  await expect(drawer.getByText('最近运行状态: SUCCEEDED')).toBeVisible({ timeout: 5000 });
});

test('home should isolate templates by workspace and reveal shared template to collaborator', async ({ page }) => {
  const templateName = `回归权限协作-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();
  await expect(accountDrawer.getByText('Alice 管理员')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证权限与协作首版闭环');
  await page.goto('/');
  await expect(page.locator('.template-card', { hasText: templateName }).first()).toBeVisible();

  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await expect(collaborationDrawer).toBeVisible();
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(page.getByText('协作成员已更新')).toBeVisible();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible();
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: '账户权限' }).click();
  await accountDrawer.locator('.ant-select').click();
  await page.locator('.ant-select-dropdown:visible').getByText(/Beta 团队/).click();
  await expect(page.getByText('已切换工作空间')).toBeVisible();
  await expect(page.locator('.template-card', { hasText: templateName })).toHaveCount(0);

  await accountDrawer.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByText('已退出登录')).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('bob@thetower.local');
  await accountDrawer.getByLabel('密码').fill('bob123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();
  await expect(accountDrawer.getByText('Bob 协作者')).toBeVisible();
  await expect(page.locator('.template-card', { hasText: templateName }).first()).toBeVisible();
});

test('editor should show online collaborators presence for shared template', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `回归在线协作-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证在线协作 presence');
  await page.goto('/');
  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible();
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  const alicePresence = page.getByTestId('editor-collaboration-presence');
  await expect(alicePresence).toContainText('在线 1');
  await expect(alicePresence).toContainText('Alice 管理员');

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible();
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible();
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await expect(bobPage.locator('.template-card', { hasText: templateName }).first()).toBeVisible();
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    const bobPresence = bobPage.getByTestId('editor-collaboration-presence');
    await expect(bobPresence).toContainText('在线 2', { timeout: 12_000 });
    await expect(bobPresence).toContainText('Alice 管理员');
    await expect(bobPresence).toContainText('Bob 协作者');

    await expect(alicePresence).toContainText('在线 2', { timeout: 12_000 });
    await expect(alicePresence).toContainText('Bob 协作者');
  } finally {
    await bobContext.close();
  }
});

test('editor should auto reload when collaborator saves remote template', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `回归远端同步-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证远端保存后的自动同步');
  await page.goto('/');
  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible();
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible();
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible();
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    await dragNodeToCanvas(bobPage, '打开网页', { x: 240, y: 180 });
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1);
    await bobPage.locator('.react-flow__node').first().click();
    await bobPage.getByLabel('网址 URL').fill('https://example.com/remote-sync');
    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible();

    await expect(page.locator('.react-flow__node')).toHaveCount(1, { timeout: 12_000 });
  } finally {
    await bobContext.close();
  }
});

test('editor should show collaboration conflict when remote template changes while local edits are dirty', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `回归协作冲突-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证远端更新与本地未保存改动的冲突提示');
  await page.goto('/');
  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible();
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(0);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible();
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible();
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();

    await dragNodeToCanvas(bobPage, '等待', { x: 240, y: 180 });
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1);

    await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    await expect(page.getByTestId('editor-collaboration-conflict-tag')).toHaveCount(0);
    await expect(page.getByTestId('editor-collaboration-autosave-paused-tag')).toBeVisible();

    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible();

    const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
    await expect(conflictAlert).toBeVisible({ timeout: 12_000 });
    await expect(page.getByTestId('editor-collaboration-conflict-tag')).toBeVisible();
    await expect(conflictAlert).toContainText('协作冲突');
    await expect(conflictAlert).toContainText('协作者');
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

    await page.waitForTimeout(2_500);
    await expect(conflictAlert).toBeVisible();
    await expect(page.locator('.react-flow__node', { hasText: '等待' }).first()).toBeVisible();
  } finally {
    await bobContext.close();
  }
});

test('editor should adopt remote deleted node while keeping local conflict context', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const templateName = `回归远端删除采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证远端删除节点的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-delete');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.goto('/');
  await openCardMenu(page, templateName);
  await page.locator('.ant-dropdown:visible').getByText('协作设置').click();
  const collaborationDrawer = page.getByRole('dialog', { name: '协作设置' });
  await collaborationDrawer.getByLabel('分享给').fill('bob@thetower.local');
  await collaborationDrawer.getByRole('button', { name: '添加协作成员' }).click();
  await expect(collaborationDrawer.getByText('bob@thetower.local')).toBeVisible();
  await collaborationDrawer.getByRole('button', { name: 'Close' }).click();

  await page.locator('.template-card', { hasText: templateName }).first().click();
  await expect(page.locator('.react-flow__node')).toHaveCount(1);

  const bobContext = await browser.newContext();
  const bobPage = await bobContext.newPage();
  try {
    await bobPage.goto('/');
    await bobPage.getByRole('button', { name: '账户权限' }).click();
    const bobDrawer = bobPage.getByRole('dialog', { name: '账户权限' });
    await expect(bobDrawer).toBeVisible();
    await bobDrawer.getByLabel('邮箱').fill('bob@thetower.local');
    await bobDrawer.getByLabel('密码').fill('bob123');
    await bobDrawer.getByRole('button', { name: /登\s*录/ }).click();
    await expect(bobPage.getByText('登录成功')).toBeVisible();
    await bobDrawer.getByRole('button', { name: 'Close' }).click();
    await bobPage.locator('.template-card', { hasText: templateName }).first().click();
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(1);

    await expect(page.getByTestId('editor-collaboration-presence')).toContainText('在线 2', { timeout: 12_000 });
    await page.locator('.react-flow__node').first().click();
    await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-delete');
    await expect(page.getByTestId('editor-collaboration-autosave-paused-tag')).toBeVisible();

    await bobPage.locator('.react-flow__node').first().click();
    await bobPage.keyboard.press('Delete');
    await expect(bobPage.locator('.react-flow__node')).toHaveCount(0);
    await bobPage.getByRole('button', { name: '保存' }).click();
    await expect(bobPage.getByText('保存成功')).toBeVisible();

    const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
    await expect(conflictAlert).toBeVisible({ timeout: 12_000 });
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

test('editor should adopt remote added edge while keeping local conflict context', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `回归远端连线采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证远端新增连线的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 140 });
  await dragNodeToCanvas(page, '点击元素', { x: 220, y: 320 });
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await page.locator('.react-flow__node', { hasText: '打开网页' }).first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-edge');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready');
  await page.locator('.react-flow__node', { hasText: '点击元素' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#submit');
  await connectNodesByHandle(page, 0, 1);
  await dragNodeNearNodeToAutoConnect(page, 2, 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();
  await expect(page.locator('.react-flow__node')).toHaveCount(3);
  await expect(page.locator('.react-flow__edge')).toHaveCount(2);

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-edge');

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
        id: `remote-edge-${Date.now()}`,
        source: baseGraph.nodes[0].id,
        target: baseGraph.nodes[2].id,
        type: 'smoothstep',
      },
    ],
    updatedAt: new Date().toISOString(),
  });
  expect(injected).toBeTruthy();

  const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
  await expect(conflictAlert).toBeVisible({ timeout: 12_000 });
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

test('editor should adopt remote removed edge while keeping local conflict context', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `回归远端删线采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证远端删除连线的选择性采纳');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 140 });
  await expect(page.locator('.react-flow__node')).toHaveCount(2);
  await page.locator('.react-flow__node', { hasText: '打开网页' }).first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-edge-remove');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready-remove');
  await connectNodesByHandle(page, 0, 1);
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-edge-remove');

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
  await expect(conflictAlert).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId('editor-collaboration-remote-diff')).toContainText('连线变化 +0 / -1');
  await conflictAlert.getByRole('button', { name: '查看差异详情' }).click();
  const diffModal = page.getByTestId('editor-collaboration-diff-modal');
  await expect(diffModal).toBeVisible();
  await diffModal.getByRole('button', { name: /采纳远端删除连线 打开网页 -> 等待/ }).click();
  await expect(diffModal).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(0);
  await expect(conflictAlert).toHaveCount(0);
});

test('editor should keep diff modal open for remaining remote changes after partial adoption', async ({ page }) => {
  test.setTimeout(60_000);
  const templateName = `回归冲突连续采纳-${Date.now()}`;

  await page.goto('/');
  await page.getByRole('button', { name: '账户权限' }).click();
  const accountDrawer = page.getByRole('dialog', { name: '账户权限' });
  await expect(accountDrawer).toBeVisible();
  await accountDrawer.getByLabel('邮箱').fill('alice@thetower.local');
  await accountDrawer.getByLabel('密码').fill('alice123');
  await accountDrawer.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page.getByText('登录成功')).toBeVisible();

  await createBlankTemplate(page, templateName, '用于验证冲突详情可连续采纳多个远端差异');
  await dragNodeToCanvas(page, '打开网页', { x: 220, y: 160 });
  await dragNodeToCanvas(page, '等待', { x: 540, y: 160 });
  await connectNodesByHandle(page, 0, 1);
  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/base-multi-adopt');
  await page.locator('.react-flow__node', { hasText: '等待' }).first().click();
  await getFormInputByLabel(page, '元素选择器').fill('#ready-multi-adopt-base');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.locator('.react-flow__node').first().click();
  await page.getByLabel('网址 URL').fill('https://example.com/local-dirty-multi-adopt');

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
            url: 'https://example.com/remote-updated-multi-adopt',
          },
        },
      },
    ],
    remoteEdges: [],
    updatedAt: new Date().toISOString(),
  });
  expect(injected).toBeTruthy();

  const conflictAlert = page.getByTestId('editor-collaboration-conflict-alert');
  await expect(conflictAlert).toBeVisible({ timeout: 12_000 });
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
  await expect(page.getByText('已保存本地版本')).toBeVisible();
  await expect(page.getByTestId('editor-collaboration-merge-pending-tag')).toHaveCount(0);
  await expect(mergePendingAlert).toHaveCount(0);
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

test('editor should avoid global scrollbar and keep side panels independently scrollable', async ({ page }) => {
  const templateName = `回归滚动布局-${Date.now()}`;

  await page.setViewportSize({ width: 1280, height: 720 });
  await createBlankTemplate(page, templateName, '用于验证编辑页不出现总滚动条');
  await expect(page.locator('.editor-main__left')).toBeVisible();
  await expect(page.locator('.editor-main__right')).toBeVisible();

  const layoutMetrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const left = document.querySelector('.editor-main__left');
    const right = document.querySelector('.editor-main__right');
    const layout = document.querySelector('.tt-layout');
    const content = document.querySelector('.tt-layout-content');
    const header = document.querySelector('.tt-layout-header');
    const footer = document.querySelector('.tt-layout-footer');
    const editorPage = document.querySelector('.editor-page');
    if (!(left instanceof HTMLElement) || !(right instanceof HTMLElement)) {
      throw new Error('未找到编辑器侧边栏');
    }

    const leftStyle = window.getComputedStyle(left);
    const rightStyle = window.getComputedStyle(right);

    return {
      documentHasVerticalOverflow: doc.scrollHeight > doc.clientHeight + 1,
      documentHasHorizontalOverflow: doc.scrollWidth > doc.clientWidth + 1,
      documentScrollHeight: doc.scrollHeight,
      documentClientHeight: doc.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      bodyClientHeight: body.clientHeight,
      layoutHeight: layout instanceof HTMLElement ? layout.getBoundingClientRect().height : null,
      contentHeight: content instanceof HTMLElement ? content.getBoundingClientRect().height : null,
      headerHeight: header instanceof HTMLElement ? header.getBoundingClientRect().height : null,
      footerHeight: footer instanceof HTMLElement ? footer.getBoundingClientRect().height : null,
      editorPageHeight: editorPage instanceof HTMLElement ? editorPage.getBoundingClientRect().height : null,
      leftOverflowY: leftStyle.overflowY,
      rightOverflowY: rightStyle.overflowY,
    };
  });

  if (layoutMetrics.documentHasVerticalOverflow || layoutMetrics.documentHasHorizontalOverflow) {
    throw new Error(`layout overflow metrics: ${JSON.stringify(layoutMetrics)}`);
  }

  expect(layoutMetrics.leftOverflowY).toBe('auto');
  expect(layoutMetrics.rightOverflowY).toBe('auto');
});

test('editor should apply dark theme variables to page and side panels', async ({ page }) => {
  const templateName = `回归暗色主题-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证暗色主题可读性');
  await page.getByRole('button', { name: '暗色' }).click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: '亮色' })).toBeVisible();

  const themeSnapshot = await page.evaluate(() => {
    const root = document.documentElement;
    const pageEl = document.querySelector('.editor-page');
    const left = document.querySelector('.editor-main__left');
    const right = document.querySelector('.editor-main__right');
    if (!(pageEl instanceof HTMLElement) || !(left instanceof HTMLElement) || !(right instanceof HTMLElement)) {
      throw new Error('未找到编辑器暗色主题检查节点');
    }

    const rootStyle = window.getComputedStyle(root);
    return {
      pageBg: window.getComputedStyle(pageEl).backgroundColor,
      leftBg: window.getComputedStyle(left).backgroundColor,
      rightBg: window.getComputedStyle(right).backgroundColor,
      borderColor: rootStyle.getPropertyValue('--color-border').trim(),
      textMuted: rootStyle.getPropertyValue('--tt-text-muted').trim(),
    };
  });

  expect(themeSnapshot.pageBg).toBe('rgb(15, 19, 27)');
  expect(themeSnapshot.leftBg).toBe('rgb(26, 34, 48)');
  expect(themeSnapshot.rightBg).toBe('rgb(26, 34, 48)');
  expect(themeSnapshot.borderColor).toBe('#2a3444');
  expect(themeSnapshot.textMuted).toBe('#9ba8bc');
});

test('editor should render grouped node library with clear hierarchy', async ({ page }) => {
  const templateName = `回归节点库层级-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证左侧步骤库层级');
  await expect(page.getByTestId('node-group-page')).toBeVisible();
  await expect(page.locator('[data-testid="node-group-page"] .editor-node-library__item').first()).toBeVisible();

  const hierarchySnapshot = await page.evaluate(() => {
    const groupTitle = document.querySelector('[data-testid="node-group-page"] .editor-node-library__group-title');
    const item = document.querySelector('[data-testid="node-group-page"] .editor-node-library__item');
    const count = document.querySelector('[data-testid="node-group-page"] .editor-node-library__group-count');
    const iconShell = document.querySelector('[data-testid="node-group-page"] .editor-node-library__icon-shell');
    if (!(groupTitle instanceof HTMLElement) || !(item instanceof HTMLElement) || !(count instanceof HTMLElement) || !(iconShell instanceof HTMLElement)) {
      throw new Error('未找到节点库层级检查所需元素');
    }

    const titleStyle = window.getComputedStyle(groupTitle);
    const itemStyle = window.getComputedStyle(item);
    const countStyle = window.getComputedStyle(count);
    const iconShellStyle = window.getComputedStyle(iconShell);

    return {
      titleFontWeight: titleStyle.fontWeight,
      titleLetterSpacing: titleStyle.letterSpacing,
      titleTextTransform: titleStyle.textTransform,
      itemBackground: itemStyle.backgroundColor,
      itemBorderRadius: itemStyle.borderRadius,
      countBackground: countStyle.backgroundColor,
      iconShellRadius: iconShellStyle.borderRadius,
    };
  });

  expect(Number(hierarchySnapshot.titleFontWeight)).toBeGreaterThanOrEqual(700);
  expect(hierarchySnapshot.titleLetterSpacing).not.toBe('normal');
  expect(hierarchySnapshot.titleTextTransform).toBe('uppercase');
  expect(hierarchySnapshot.itemBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(hierarchySnapshot.itemBorderRadius).toBe('12px');
  expect(hierarchySnapshot.countBackground).not.toBe('rgba(0, 0, 0, 0)');
  expect(hierarchySnapshot.iconShellRadius).toBe('10px');
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

test('editor should persist element ref target and element order after save and reload', async ({ page }) => {
  const templateName = `回归元素引用-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证 0.0.8 元素引用与元素顺序配置');

  await dragNodeToCanvas(page, '提取数据', { x: 220, y: 140 });
  await dragNodeToCanvas(page, '点击元素', { x: 540, y: 140 });

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);

  const firstBox = await nodes.nth(0).boundingBox();
  const secondBox = await nodes.nth(1).boundingBox();
  if (!firstBox || !secondBox) {
    throw new Error('无法获取 elementRef 回归用例的节点位置');
  }

  await page.mouse.move(firstBox.x + firstBox.width - 8, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(secondBox.x + 8, secondBox.y + secondBox.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  await nodes.nth(0).click();
  await getFormInputByLabel(page, '元素选择器').fill('.product-card');
  await getFormInputByLabel(page, '变量名').fill('itemRef');
  await page.locator('.ant-form-item').filter({ hasText: '提取方式' }).getByRole('combobox').click();
  await page.getByTitle('元素引用').click();
  await page.locator('.ant-form-item').filter({ hasText: '命中元素顺序' }).getByRole('combobox').click();
  await page.getByTitle('固定序号').click();
  await getFormInputByLabel(page, '元素序号').fill('2');

  await nodes.nth(1).click();
  await page.locator('.ant-form-item').filter({ hasText: '定位来源' }).locator('.ant-radio-button-wrapper', { hasText: '元素引用变量' }).click();
  await getFormInputByLabel(page, '元素引用变量').fill('itemRef');
  await page.locator('.ant-form-item').filter({ hasText: '命中元素顺序' }).getByRole('combobox').click();
  await page.getByTitle('最后一个').click();

  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('保存成功')).toBeVisible();

  await page.reload();

  const reloadedNodes = page.locator('.react-flow__node');
  await expect(reloadedNodes).toHaveCount(2);

  await reloadedNodes.nth(0).click();
  await expect(getFormInputByLabel(page, '变量名')).toHaveValue('itemRef');
  await expect(page.locator('.ant-form-item').filter({ hasText: '提取方式' })).toContainText('元素引用');
  await expect(page.locator('.ant-form-item').filter({ hasText: '命中元素顺序' })).toContainText('固定序号');
  await expect(getFormInputByLabel(page, '元素序号')).toHaveValue('2');

  await reloadedNodes.nth(1).click();
  await expect(page.locator('.ant-form-item').filter({ hasText: '定位来源' }).locator('.ant-radio-button-wrapper', { hasText: '元素引用变量' })).toHaveClass(/ant-radio-button-wrapper-checked/);
  await expect(getFormInputByLabel(page, '元素引用变量')).toHaveValue('itemRef');
  await expect(page.locator('.ant-form-item').filter({ hasText: '命中元素顺序' })).toContainText('最后一个');
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
  await expect(page.getByTestId('runpanel-technical-details')).toBeVisible();
  await expect(page.getByText('技术详情')).toBeVisible();
  await expect(page.getByText('变量检查器')).toHaveCount(0);
  await page.locator('[data-testid="runpanel-technical-details"]').getByText('技术详情').click();
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

test('editor should expose tooltip hints for key node config fields', async ({ page }) => {
  const templateName = `回归表单提示-${Date.now()}`;

  await createBlankTemplate(page, templateName, '用于验证关键配置项提示图标');

  await dragNodeToCanvas(page, '文本正则提取', { x: 220, y: 140 });
  await dragNodeToCanvas(page, 'IF 条件', { x: 520, y: 140 });

  const nodes = page.locator('.react-flow__node');
  await expect(nodes).toHaveCount(2);

  await nodes.nth(0).click();
  await expect(page.getByTestId('field-help-textExtract-pattern')).toBeVisible();
  await page.getByTestId('field-help-textExtract-pattern').hover();
  await expect(page.getByRole('tooltip').last()).toContainText('JavaScript 正则表达式');

  await page.getByTestId('field-help-textExtract-groupIndex').hover();
  await expect(page.getByRole('tooltip').last()).toContainText('0 表示完整匹配');

  await nodes.nth(1).click();
  await expect(page.getByTestId('field-help-condition-left')).toBeVisible();
  await page.getByTestId('field-help-condition-left').hover();
  await expect(page.getByRole('tooltip').last()).toContainText('变量引用或固定文本');

  await page.getByTestId('field-help-condition-op').hover();
  await expect(page.getByRole('tooltip').last()).toContainText('exists / notExists');
});