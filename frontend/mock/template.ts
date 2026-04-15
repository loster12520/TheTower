// Mock 数据 - 模板相关接口
// 注意：mock 文件不能使用 @/xxx 路径别名，需要相对路径或内联类型

// 内联类型定义
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  groupName?: string | null;
  tags?: string[];
  schemaVersion: string;
  steps: Step[];
  otherStep: {
    nodes: Step[];
    edges: Edge[];
  };
  createdAt: string;
  updatedAt: string;
  stats: { stepCount: number };
  lastRun: {
    runId: string;
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'RUNNING';
    finishedAt: string | null;
  } | null;
}

interface Step {
  id: string;
  type: 'openUrl' | 'click' | 'type' | 'waitFor' | 'extract' | 'if' | 'forTimes' | 'while' | 'break';
  position: { x: number; y: number };
  data: {
    label: string;
    config: Record<string, unknown>;
  };
}

interface Edge {
  id: string;
  source: string;
  target: string;
}

interface Run {
  id: string;
  templateId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  currentStepId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}

interface ApiResponse<T> {
  requestId: string;
  data: T | null;
  error: { code: string; message: string } | null;
}

interface PublishedTemplateSummary {
  id: string;
  sourceTemplateId: string;
  name: string;
  description: string | null;
  groupName: string | null;
  tags: string[];
  schemaVersion: string;
  stats: { stepCount: number };
  sourceUpdatedAt: string;
  publishedAt: string;
}

interface Schedule {
  id: string;
  templateId: string;
  templateName: string;
  triggerType: 'ONE_TIME' | 'INTERVAL';
  delaySeconds: number | null;
  intervalSeconds: number | null;
  enabled: boolean;
  nextTriggerAt: string | null;
  lastTriggeredAt: string | null;
  lastRunId: string | null;
  lastRunStatus: string | null;
  lastError: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

interface UserSession {
  token: string;
  userId: string;
  name: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  workspaces: WorkspaceMembership[];
  issuedAt: string;
  expiresAt: string;
}

type TemplatePermission = 'OWNER' | 'EDITOR' | 'VIEWER';

interface TemplateCollaborator {
  userId: string;
  userName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  permission: TemplatePermission;
  invitedAt: string;
  lastActiveAt: string | null;
}

interface TemplateAccessRecord {
  templateId: string;
  ownerUserId: string;
  ownerUserName: string;
  ownerWorkspaceId: string;
  ownerWorkspaceName: string;
  collaborators: TemplateCollaborator[];
}

interface TemplateCollaborationData {
  templateId: string;
  ownerUserId: string;
  ownerUserName: string;
  ownerWorkspaceId: string;
  ownerWorkspaceName: string;
  collaborators: TemplateCollaborator[];
  currentPermission: TemplatePermission;
  shared: boolean;
}

interface TemplatePresenceMember {
  userId: string;
  userName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  joinedAt: string;
  lastSeenAt: string;
}

interface TemplatePresenceData {
  templateId: string;
  members: TemplatePresenceMember[];
  onlineCount: number;
  updatedAt: string;
  latestPatch?: {
    templateId: string;
    savedByUserId: string;
    savedByUserName: string;
    savedByWorkspaceId: string;
    savedByWorkspaceName: string;
    updatedAt: string;
  } | null;
}

// 模拟数据存储（内存中）
let templates: WorkflowTemplate[] = [
  {
    id: 'tpl-001',
    name: '示例：抓取网页标题',
    description: '打开 example.com 并提取页面标题',
    schemaVersion: '0.0.1',
    steps: [
      {
        id: 'step-001',
        type: 'openUrl',
        position: { x: 100, y: 100 },
        data: {
          label: '打开网页',
          config: { url: 'https://example.com' }
        }
      },
      {
        id: 'step-002',
        type: 'waitFor',
        position: { x: 100, y: 200 },
        data: {
          label: '等待加载',
          config: { selector: 'h1' }
        }
      },
      {
        id: 'step-003',
        type: 'extract',
        position: { x: 100, y: 300 },
        data: {
          label: '提取标题',
          config: { selector: 'h1', as: 'title', mode: 'text', attributeName: null }
        }
      }
    ],
    otherStep: {
      nodes: [],
      edges: []
    },
    createdAt: '2026-01-15T08:00:00Z',
    updatedAt: '2026-01-20T10:30:00Z',
    stats: { stepCount: 3 },
    lastRun: {
      runId: 'run-001',
      status: 'SUCCEEDED',
      finishedAt: '2026-01-20T10:35:00Z'
    }
  },
  {
    id: 'tpl-002',
    name: '示例：登录表单',
    description: '自动填写用户名密码并点击登录',
    schemaVersion: '0.0.1',
    steps: [
      {
        id: 'step-004',
        type: 'openUrl',
        position: { x: 100, y: 100 },
        data: {
          label: '打开登录页',
          config: { url: 'https://example.com/login' }
        }
      },
      {
        id: 'step-005',
        type: 'type',
        position: { x: 100, y: 200 },
        data: {
          label: '输入用户名',
          config: { selector: '#username', text: 'admin' }
        }
      },
      {
        id: 'step-006',
        type: 'type',
        position: { x: 100, y: 300 },
        data: {
          label: '输入密码',
          config: { selector: '#password', text: 'password123' }
        }
      },
      {
        id: 'step-007',
        type: 'click',
        position: { x: 100, y: 400 },
        data: {
          label: '点击登录',
          config: { selector: '#login-btn' }
        }
      }
    ],
    otherStep: {
      nodes: [],
      edges: []
    },
    createdAt: '2026-01-18T09:00:00Z',
    updatedAt: '2026-01-25T14:20:00Z',
    stats: { stepCount: 4 },
    lastRun: {
      runId: 'run-002',
      status: 'FAILED',
      finishedAt: '2026-01-25T14:22:00Z'
    }
  },
  {
    id: 'tpl-003',
    name: '空白模板',
    description: null,
    schemaVersion: '0.0.1',
    steps: [],
    otherStep: {
      nodes: [],
      edges: []
    },
    createdAt: '2026-01-30T16:00:00Z',
    updatedAt: '2026-01-30T16:00:00Z',
    stats: { stepCount: 0 },
    lastRun: null
  },
  {
    id: 'tpl-004',
    name: '示例：控制流 IF',
    description: '根据条件进入 THEN 或 ELSE 分支',
    schemaVersion: '0.0.4',
    steps: [
      {
        id: 'step-if-001',
        type: 'if',
        position: { x: 160, y: 140 },
        data: {
          label: '判断登录状态',
          config: {
            condition: { left: '${token}', op: 'exists', right: '' },
            then: [
              {
                id: 'step-then-001',
                type: 'click',
                position: { x: 100, y: 120 },
                data: {
                  label: '点击继续',
                  config: { selector: '#continue' }
                }
              }
            ],
            else: [
              {
                id: 'step-else-001',
                type: 'openUrl',
                position: { x: 100, y: 120 },
                data: {
                  label: '跳转登录页',
                  config: { url: 'https://example.com/login' }
                }
              }
            ]
          }
        }
      }
    ],
    otherStep: {
      nodes: [],
      edges: []
    },
    createdAt: '2026-03-14T10:00:00Z',
    updatedAt: '2026-03-14T10:00:00Z',
    stats: { stepCount: 3 },
    lastRun: null
  },
  {
    id: 'tpl-005',
    name: '示例：循环 BODY',
    description: '在 For 次数节点中维护 BODY 子流程',
    schemaVersion: '0.0.4',
    steps: [
      {
        id: 'step-for-001',
        type: 'forTimes',
        position: { x: 180, y: 160 },
        data: {
          label: '重试三次',
          config: {
            times: 3,
            indexVar: 'retryIndex',
            body: [
              {
                id: 'step-body-001',
                type: 'click',
                position: { x: 100, y: 120 },
                data: {
                  label: '重试点击登录',
                  config: { selector: '#retry-login' }
                }
              },
              {
                id: 'step-body-002',
                type: 'waitFor',
                position: { x: 100, y: 220 },
                data: {
                  label: '等待结果反馈',
                  config: { waitMs: 1000 }
                }
              }
            ]
          }
        }
      }
    ],
    otherStep: {
      nodes: [],
      edges: []
    },
    createdAt: '2026-03-15T09:00:00Z',
    updatedAt: '2026-03-15T09:00:00Z',
    stats: { stepCount: 3 },
    lastRun: null
  }
];

// 生成 UUID
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

// 创建成功响应
function successResponse<T>(data: T): ApiResponse<T> {
  return {
    requestId: generateId(),
    data,
    error: null
  };
}

// 创建错误响应
function errorResponse(code: string, message: string): ApiResponse<null> {
  return {
    requestId: generateId(),
    data: null,
    error: { code, message }
  };
}

// 运行记录存储
let runs: Run[] = [
  {
    id: 'run-001',
    templateId: 'tpl-001',
    status: 'SUCCEEDED',
    currentStepId: null,
    startedAt: '2026-01-20T10:30:00Z',
    finishedAt: '2026-01-20T10:35:00Z',
    error: null
  },
  {
    id: 'run-002',
    templateId: 'tpl-002',
    status: 'FAILED',
    currentStepId: 'step-007',
    startedAt: '2026-01-25T14:20:00Z',
    finishedAt: '2026-01-25T14:22:00Z',
    error: {
      code: 'ELEMENT_NOT_FOUND',
      message: '未找到登录按钮元素 #login-btn'
    }
  }
];

let marketTemplates: PublishedTemplateSummary[] = [];
let schedules: Schedule[] = [];
let sessions: UserSession[] = [];
let templateAccessRecords: TemplateAccessRecord[] = [];
let templatePresenceMap: Record<string, TemplatePresenceMember[]> = {};
let templateLatestPatchMap: Record<string, TemplatePresenceData['latestPatch']> = {};

const demoUsers = [
  {
    id: 'user-alice',
    name: 'Alice 管理员',
    email: 'alice@thetower.local',
    password: 'alice123',
    workspaces: [
      { workspaceId: 'ws-alpha', workspaceName: 'Alpha 团队', role: 'OWNER' },
      { workspaceId: 'ws-beta', workspaceName: 'Beta 团队', role: 'OWNER' },
    ],
  },
  {
    id: 'user-bob',
    name: 'Bob 协作者',
    email: 'bob@thetower.local',
    password: 'bob123',
    workspaces: [
      { workspaceId: 'ws-beta', workspaceName: 'Beta 团队', role: 'EDITOR' },
    ],
  },
];

function getBearerToken(req: any): string | null {
  const raw = req.headers?.authorization || req.headers?.Authorization;
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  return raw.replace(/^Bearer\s+/i, '').trim() || null;
}

function resolveAuthContext(req: any): UserSession | null {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  const session = sessions.find((item) => item.token === token);
  if (!session) {
    return null;
  }

  const workspaceId = req.headers?.['x-workspace-id'] || req.headers?.['X-Workspace-Id'];
  const workspace = session.workspaces.find((item) => !workspaceId || item.workspaceId === workspaceId) || session.workspaces[0];
  return {
    ...session,
    workspaceId: workspace.workspaceId,
    workspaceName: workspace.workspaceName,
    role: workspace.role,
  };
}

function canAccessTemplate(templateId: string, context: UserSession | null): boolean {
  if (!context) {
    return true;
  }
  const record = templateAccessRecords.find((item) => item.templateId === templateId);
  if (!record) {
    return true;
  }
  if (record.ownerUserId === context.userId && record.ownerWorkspaceId === context.workspaceId) {
    return true;
  }
  return record.collaborators.some((item) => item.userId === context.userId && item.workspaceId === context.workspaceId);
}

function assignTemplateOwner(templateId: string, context: UserSession | null) {
  if (!context || templateAccessRecords.some((item) => item.templateId === templateId)) {
    return;
  }
  templateAccessRecords.push({
    templateId,
    ownerUserId: context.userId,
    ownerUserName: context.name,
    ownerWorkspaceId: context.workspaceId,
    ownerWorkspaceName: context.workspaceName,
    collaborators: [],
  });
}

function buildCollaborationData(templateId: string, context: UserSession | null): TemplateCollaborationData {
  const record = templateAccessRecords.find((item) => item.templateId === templateId);
  if (!record) {
    return {
      templateId,
      ownerUserId: context?.userId || 'local-user',
      ownerUserName: context?.name || '本地单机',
      ownerWorkspaceId: context?.workspaceId || 'local-workspace',
      ownerWorkspaceName: context?.workspaceName || '默认空间',
      collaborators: [],
      currentPermission: 'OWNER',
      shared: false,
    };
  }

  const currentPermission: TemplatePermission = context && record.ownerUserId === context.userId && record.ownerWorkspaceId === context.workspaceId
    ? 'OWNER'
    : (record.collaborators.find((item) => context && item.userId === context.userId && item.workspaceId === context.workspaceId)?.permission || 'VIEWER');

  return {
    templateId,
    ownerUserId: record.ownerUserId,
    ownerUserName: record.ownerUserName,
    ownerWorkspaceId: record.ownerWorkspaceId,
    ownerWorkspaceName: record.ownerWorkspaceName,
    collaborators: record.collaborators,
    currentPermission,
    shared: record.collaborators.length > 0,
  };
}

function cleanupPresence(templateId: string) {
  const members = templatePresenceMap[templateId] || [];
  const now = Date.now();
  templatePresenceMap[templateId] = members.filter((item) => now - new Date(item.lastSeenAt).getTime() <= 30_000);
}

function buildPresenceData(templateId: string): TemplatePresenceData {
  cleanupPresence(templateId);
  const members = (templatePresenceMap[templateId] || []).slice().sort((left, right) => {
    const workspaceCompare = left.workspaceName.localeCompare(right.workspaceName, 'zh-CN');
    return workspaceCompare !== 0 ? workspaceCompare : left.userName.localeCompare(right.userName, 'zh-CN');
  });
  return {
    templateId,
    members,
    onlineCount: members.length,
    updatedAt: new Date().toISOString(),
    latestPatch: templateLatestPatchMap[templateId] || null,
  };
}

function heartbeatPresence(templateId: string, context: UserSession): TemplatePresenceData {
  cleanupPresence(templateId);
  const members = templatePresenceMap[templateId] || [];
  const now = new Date().toISOString();
  const nextMember: TemplatePresenceMember = {
    userId: context.userId,
    userName: context.name,
    email: context.email,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    role: context.role,
    joinedAt: members.find((item) => item.userId === context.userId && item.workspaceId === context.workspaceId)?.joinedAt || now,
    lastSeenAt: now,
  };
  templatePresenceMap[templateId] = members
    .filter((item) => !(item.userId === context.userId && item.workspaceId === context.workspaceId))
    .concat(nextMember);
  return buildPresenceData(templateId);
}

function leavePresence(templateId: string, context: UserSession) {
  const members = templatePresenceMap[templateId] || [];
  templatePresenceMap[templateId] = members.filter((item) => !(item.userId === context.userId && item.workspaceId === context.workspaceId));
}

// Mock 配置导出
export default {
  // ========== Health API ==========
  'GET /api/v1/health': (req: any, res: any) => {
    res.json(successResponse({ status: 'ok' }));
  },

  'POST /api/v1/auth/login': (req: any, res: any) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '').trim();
    const user = demoUsers.find((item) => item.email === email && item.password === password);
    if (!user) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '账号或密码错误'));
      return;
    }
    const workspace = user.workspaces.find((item) => item.workspaceId === req.body?.workspaceId) || user.workspaces[0];
    const session: UserSession = {
      token: `session-${generateId()}`,
      userId: user.id,
      name: user.name,
      email: user.email,
      workspaceId: workspace.workspaceId,
      workspaceName: workspace.workspaceName,
      role: workspace.role,
      workspaces: user.workspaces,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    sessions = [session, ...sessions.filter((item) => item.userId !== user.id)];
    res.json(successResponse(session));
  },

  'POST /api/v1/auth/logout': (req: any, res: any) => {
    const token = getBearerToken(req);
    sessions = sessions.filter((item) => item.token !== token);
    res.json(successResponse({ loggedOut: true }));
  },

  'GET /api/v1/me': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }
    res.json(successResponse(context));
  },

  'GET /api/v1/workspaces': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }
    res.json(successResponse({ items: context.workspaces }));
  },

  // ========== Template API ==========
  
  // 获取模板列表
  'GET /api/v1/templates': (req: any, res: any) => {
    const includeLastRun = req.query.includeLastRun !== 'false';
    const context = resolveAuthContext(req);
    const visibleTemplates = templates.filter((template) => canAccessTemplate(template.id, context));
    
    // 返回摘要列表（不包含完整 steps）
    const items = visibleTemplates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      groupName: t.groupName || null,
      tags: t.tags || [],
      schemaVersion: t.schemaVersion,
      updatedAt: t.updatedAt,
      stats: t.stats,
      lastRun: includeLastRun ? t.lastRun : undefined
    }));
    
    res.json(successResponse({ items }));
  },

  // 创建模板
  'POST /api/v1/templates': (req: any, res: any) => {
    const body = req.body;
    const context = resolveAuthContext(req);
    const now = new Date().toISOString();
    const newTemplate: WorkflowTemplate = {
      id: `tpl-${generateId()}`,
      name: body.name || '未命名模板',
      description: body.description || null,
      groupName: body.groupName || null,
      tags: body.tags || [],
      schemaVersion: body.schemaVersion || '0.0.8',
      steps: body.steps || [],
      otherStep: body.otherStep || { nodes: [], edges: [] },
      createdAt: now,
      updatedAt: now,
      stats: { stepCount: (body.steps || []).length },
      lastRun: null
    };
    
    templates.push(newTemplate);
    assignTemplateOwner(newTemplate.id, context);
    res.json(successResponse(newTemplate));
  },

  // 获取模板详情
  'GET /api/v1/templates/:id': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(template));
  },

  // 更新模板元信息
  'PATCH /api/v1/templates/:id': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    
    const body = req.body;
    if (body.name !== undefined) {
      template.name = body.name;
    }
    if (body.description !== undefined) {
      template.description = body.description;
    }
    if (body.groupName !== undefined) {
      template.groupName = body.groupName;
    }
    if (body.tags !== undefined) {
      template.tags = body.tags;
    }
    template.updatedAt = new Date().toISOString();
    templateLatestPatchMap[req.params.id] = {
      templateId: req.params.id,
      savedByUserId: context?.userId || 'local-user',
      savedByUserName: context?.name || '本地单机',
      savedByWorkspaceId: context?.workspaceId || 'local-workspace',
      savedByWorkspaceName: context?.workspaceName || '默认空间',
      updatedAt: template.updatedAt,
    };
    
    res.json(successResponse(template));
  },

  // 保存模板步骤
  'PUT /api/v1/templates/:id': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    
    const body = req.body;
    template.schemaVersion = body.schemaVersion;
    template.steps = body.steps;
    template.otherStep = body.otherStep;
    template.stats.stepCount = body.steps.length;
    template.updatedAt = new Date().toISOString();
    
    res.json(successResponse(template));
  },

  // 删除模板
  'DELETE /api/v1/templates/:id': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const index = templates.findIndex(t => t.id === req.params.id);
    if (index === -1 || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    
    templates.splice(index, 1);
    templateAccessRecords = templateAccessRecords.filter((item) => item.templateId !== req.params.id);
    delete templatePresenceMap[req.params.id];
    delete templateLatestPatchMap[req.params.id];
    res.json(successResponse({ deleted: true }));
  },

  'GET /api/v1/templates/:id/collaboration': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(buildCollaborationData(req.params.id, context)));
  },

  'POST /api/v1/templates/:id/collaboration/share': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }

    const template = templates.find(t => t.id === req.params.id);
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }

    const existing = templateAccessRecords.find((item) => item.templateId === req.params.id);
    if (existing && (existing.ownerUserId !== context.userId || existing.ownerWorkspaceId !== context.workspaceId)) {
      res.status(403).json(errorResponse('FORBIDDEN', '只有模板拥有者可以分享模板'));
      return;
    }

    const targetUser = demoUsers.find((item) => item.email === String(req.body?.email || '').trim().toLowerCase());
    if (!targetUser) {
      res.status(400).json(errorResponse('BAD_REQUEST', '协作用户不存在'));
      return;
    }

    const targetWorkspace = targetUser.workspaces.find((item) => item.workspaceId !== context.workspaceId) || targetUser.workspaces[0];
    const nextCollaborator: TemplateCollaborator = {
      userId: targetUser.id,
      userName: targetUser.name,
      email: targetUser.email,
      workspaceId: targetWorkspace.workspaceId,
      workspaceName: targetWorkspace.workspaceName,
      permission: req.body?.permission || 'EDITOR',
      invitedAt: new Date().toISOString(),
      lastActiveAt: null,
    };

    const baseRecord: TemplateAccessRecord = existing || {
      templateId: req.params.id,
      ownerUserId: context.userId,
      ownerUserName: context.name,
      ownerWorkspaceId: context.workspaceId,
      ownerWorkspaceName: context.workspaceName,
      collaborators: [],
    };

    templateAccessRecords = templateAccessRecords.filter((item) => item.templateId !== req.params.id);
    templateAccessRecords.push({
      ...baseRecord,
      collaborators: baseRecord.collaborators
        .filter((item) => !(item.userId === nextCollaborator.userId && item.workspaceId === nextCollaborator.workspaceId))
        .concat(nextCollaborator),
    });
    res.json(successResponse(buildCollaborationData(req.params.id, context)));
  },

  'GET /api/v1/templates/:id/collaboration/presence': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(buildPresenceData(req.params.id)));
  },

  'POST /api/v1/templates/:id/collaboration/presence/heartbeat': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    const template = templates.find(t => t.id === req.params.id);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }
    if (!template || !canAccessTemplate(req.params.id, context)) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(heartbeatPresence(req.params.id, context)));
  },

  'DELETE /api/v1/templates/:id/collaboration/presence': (req: any, res: any) => {
    const context = resolveAuthContext(req);
    if (!context) {
      res.status(401).json(errorResponse('UNAUTHORIZED', '请先登录'));
      return;
    }
    leavePresence(req.params.id, context);
    res.json(successResponse({ deleted: true }));
  },

  'GET /api/v1/market/templates': (req: any, res: any) => {
    res.json(successResponse({ items: marketTemplates }));
  },

  'POST /api/v1/market/templates/publish': (req: any, res: any) => {
    const template = templates.find(t => t.id === req.body.templateId);
    if (!template) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.body.templateId} 不存在`));
      return;
    }

    const published: PublishedTemplateSummary = {
      id: `market-${generateId()}`,
      sourceTemplateId: template.id,
      name: template.name,
      description: template.description,
      groupName: template.groupName || null,
      tags: template.tags || [],
      schemaVersion: template.schemaVersion,
      stats: template.stats,
      sourceUpdatedAt: template.updatedAt,
      publishedAt: new Date().toISOString(),
    };
    marketTemplates = [published, ...marketTemplates];
    res.json(successResponse(published));
  },

  'POST /api/v1/market/templates/:id/import': (req: any, res: any) => {
    const published = marketTemplates.find(t => t.id === req.params.id);
    if (!published) {
      res.status(404).json(errorResponse('NOT_FOUND', `市场模板 ${req.params.id} 不存在`));
      return;
    }

    const source = templates.find(t => t.id === published.sourceTemplateId);
    if (!source) {
      res.status(404).json(errorResponse('NOT_FOUND', `源模板 ${published.sourceTemplateId} 不存在`));
      return;
    }

    const now = new Date().toISOString();
    const imported: WorkflowTemplate = {
      ...source,
      id: `tpl-${generateId()}`,
      name: req.body?.name || `${published.name} 导入副本`,
      createdAt: now,
      updatedAt: now,
      lastRun: null,
    };
    templates.push(imported);
    res.json(successResponse(imported));
  },

  'GET /api/v1/schedules': (req: any, res: any) => {
    res.json(successResponse({ items: schedules }));
  },

  'POST /api/v1/schedules': (req: any, res: any) => {
    const template = templates.find(t => t.id === req.body.templateId);
    if (!template) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.body.templateId} 不存在`));
      return;
    }

    const now = new Date();
    const triggerType = req.body.triggerType || 'ONE_TIME';
    const delaySeconds = triggerType === 'ONE_TIME' ? Number(req.body.delaySeconds || 1) : null;
    const intervalSeconds = triggerType === 'INTERVAL' ? Number(req.body.intervalSeconds || 1) : null;
    const nextTriggerAt = new Date(now.getTime() + (triggerType === 'INTERVAL' ? intervalSeconds! : delaySeconds!) * 1000).toISOString();
    const schedule: Schedule = {
      id: `schedule-${generateId()}`,
      templateId: template.id,
      templateName: template.name,
      triggerType,
      delaySeconds,
      intervalSeconds,
      enabled: req.body.enabled !== false,
      nextTriggerAt,
      lastTriggeredAt: null,
      lastRunId: null,
      lastRunStatus: null,
      lastError: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    schedules = [schedule, ...schedules];

    setTimeout(() => {
      if (!schedule.enabled) {
        return;
      }
      const run: Run = {
        id: `run-${generateId()}`,
        templateId: template.id,
        status: 'SUCCEEDED',
        currentStepId: null,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        error: null,
      };
      runs.unshift(run);
      schedule.lastTriggeredAt = new Date().toISOString();
      schedule.lastRunId = run.id;
      schedule.lastRunStatus = run.status;
      schedule.updatedAt = new Date().toISOString();
      if (schedule.triggerType === 'ONE_TIME') {
        schedule.enabled = false;
        schedule.nextTriggerAt = null;
      } else {
        schedule.nextTriggerAt = new Date(Date.now() + (schedule.intervalSeconds || 1) * 1000).toISOString();
      }
    }, (triggerType === 'INTERVAL' ? intervalSeconds! : delaySeconds!) * 1000);

    res.json(successResponse(schedule));
  },

  'PATCH /api/v1/schedules/:id': (req: any, res: any) => {
    const schedule = schedules.find(item => item.id === req.params.id);
    if (!schedule) {
      res.status(404).json(errorResponse('NOT_FOUND', `调度任务 ${req.params.id} 不存在`));
      return;
    }
    if (req.body.enabled !== undefined) {
      schedule.enabled = Boolean(req.body.enabled);
      schedule.nextTriggerAt = schedule.enabled
        ? new Date(Date.now() + ((schedule.triggerType === 'INTERVAL' ? schedule.intervalSeconds : schedule.delaySeconds) || 1) * 1000).toISOString()
        : null;
    }
    schedule.updatedAt = new Date().toISOString();
    res.json(successResponse(schedule));
  },

  'DELETE /api/v1/schedules/:id': (req: any, res: any) => {
    schedules = schedules.filter(item => item.id !== req.params.id);
    res.json(successResponse({ deleted: true }));
  },

  // ========== Run API ==========
  
  // 发起运行
  'POST /api/v1/runs': (req: any, res: any) => {
    const body = req.body;
    const template = templates.find(t => t.id === body.templateId);
    if (!template) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${body.templateId} 不存在`));
      return;
    }

    const now = new Date().toISOString();
    const newRun: Run = {
      id: `run-${generateId()}`,
      templateId: body.templateId,
      status: 'PENDING',
      currentStepId: null,
      startedAt: now,
      finishedAt: null,
      error: null
    };
    
    runs.push(newRun);
    
    // 模拟异步启动运行
    setTimeout(() => {
      newRun.status = 'RUNNING';
      newRun.currentStepId = template.steps[0]?.id || null;
    }, 100);
    
    res.json(successResponse({
      run: newRun,
      wsUrl: `/ws/v1/runs/${newRun.id}`
    }));
  },

  // 获取运行列表
  'GET /api/v1/runs': (req: any, res: any) => {
    let items = [...runs];
    
    if (req.query.templateId) {
      items = items.filter(r => r.templateId === req.query.templateId);
    }
    if (req.query.status) {
      items = items.filter(r => r.status === req.query.status);
    }
    
    // 按开始时间倒序
    items.sort((a, b) => new Date(b.startedAt || 0).getTime() - new Date(a.startedAt || 0).getTime());
    
    res.json(successResponse({ items, total: items.length }));
  },

  // 获取运行状态
  'GET /api/v1/runs/:id': (req: any, res: any) => {
    const run = runs.find(r => r.id === req.params.id);
    if (!run) {
      res.status(404).json(errorResponse('NOT_FOUND', `运行 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(run));
  },

  // 取消运行
  'POST /api/v1/runs/:id/cancel': (req: any, res: any) => {
    const run = runs.find(r => r.id === req.params.id);
    if (!run) {
      res.status(404).json(errorResponse('NOT_FOUND', `运行 ${req.params.id} 不存在`));
      return;
    }
    
    if (run.status !== 'RUNNING' && run.status !== 'PENDING') {
      res.status(400).json(errorResponse('BAD_REQUEST', `运行状态为 ${run.status}，无法取消`));
      return;
    }
    
    run.status = 'CANCELED';
    run.finishedAt = new Date().toISOString();
    
    res.json(successResponse(run));
  },

  // 删除运行记录
  'DELETE /api/v1/runs/:id': (req: any, res: any) => {
    const index = runs.findIndex(r => r.id === req.params.id);
    if (index === -1) {
      res.status(404).json(errorResponse('NOT_FOUND', `运行 ${req.params.id} 不存在`));
      return;
    }
    
    runs.splice(index, 1);
    res.json(successResponse({ deleted: true }));
  }
};
