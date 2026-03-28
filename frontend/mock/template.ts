// Mock 数据 - 模板相关接口
// 注意：mock 文件不能使用 @/xxx 路径别名，需要相对路径或内联类型

// 内联类型定义
interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
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

// Mock 配置导出
export default {
  // ========== Health API ==========
  'GET /api/v1/health': (req: any, res: any) => {
    res.json(successResponse({ status: 'ok' }));
  },

  // ========== Template API ==========
  
  // 获取模板列表
  'GET /api/v1/templates': (req: any, res: any) => {
    const includeLastRun = req.query.includeLastRun !== 'false';
    
    // 返回摘要列表（不包含完整 steps）
    const items = templates.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
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
    const now = new Date().toISOString();
    const newTemplate: WorkflowTemplate = {
      id: `tpl-${generateId()}`,
      name: body.name || '未命名模板',
      description: body.description || null,
      schemaVersion: body.schemaVersion || '0.0.6',
      steps: body.steps || [],
      otherStep: body.otherStep || { nodes: [], edges: [] },
      createdAt: now,
      updatedAt: now,
      stats: { stepCount: (body.steps || []).length },
      lastRun: null
    };
    
    templates.push(newTemplate);
    res.json(successResponse(newTemplate));
  },

  // 获取模板详情
  'GET /api/v1/templates/:id': (req: any, res: any) => {
    const template = templates.find(t => t.id === req.params.id);
    if (!template) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    res.json(successResponse(template));
  },

  // 更新模板元信息
  'PATCH /api/v1/templates/:id': (req: any, res: any) => {
    const template = templates.find(t => t.id === req.params.id);
    if (!template) {
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
    template.updatedAt = new Date().toISOString();
    
    res.json(successResponse(template));
  },

  // 保存模板步骤
  'PUT /api/v1/templates/:id': (req: any, res: any) => {
    const template = templates.find(t => t.id === req.params.id);
    if (!template) {
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
    const index = templates.findIndex(t => t.id === req.params.id);
    if (index === -1) {
      res.status(404).json(errorResponse('NOT_FOUND', `模板 ${req.params.id} 不存在`));
      return;
    }
    
    templates.splice(index, 1);
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
