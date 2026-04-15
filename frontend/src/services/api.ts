import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from 'axios';
import type {
  ApiResponse,
  ApiError,
  HealthResponse,
  WorkflowTemplate,
  TemplateSummary,
  PublishedTemplateSummary,
  Schedule,
  UserSession,
  WorkspaceMembership,
  TemplateCollaborationData,
  TemplatePresenceData,
  TemplatePermission,
  BatchDeleteTemplatesData,
  Run,
  RunLaunchOptions,
  RunDebugOptions,
  RunDebugSession,
  RunDebugContextSnapshot,
  DebugRemoteControlData,
} from '@/models';
import { appLogger, runtimeConfig } from '@/config/runtime';

/**
 * 统一请求层：
 * - 使用运行时配置注入 baseURL 与鉴权头；
 * - 标准化错误结构；
 * - 在开发期输出请求摘要，便于联调追踪。
 */

const REQUEST_ID_HEADER = 'X-Request-Id';

const createRequestId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `fe-${timestamp}-${random}`;
};

// 创建 axios 实例
const apiClient: AxiosInstance = axios.create({
  baseURL: runtimeConfig.apiBaseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
  },
});

// 请求拦截器 - 添加请求日志
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const requestId = createRequestId();
    config.headers[REQUEST_ID_HEADER] = requestId;

    const token = typeof window !== 'undefined'
      ? window.localStorage.getItem(runtimeConfig.auth.tokenStorageKey)
      : null;
    const workspaceId = typeof window !== 'undefined'
      ? window.localStorage.getItem(runtimeConfig.auth.workspaceStorageKey)
      : null;

    if (token && token.trim().length > 0) {
      config.headers[runtimeConfig.auth.tokenHeader] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    }

    if (workspaceId && workspaceId.trim().length > 0) {
      config.headers['X-Workspace-Id'] = workspaceId;
    }

    appLogger.debug(
      `[API Request] ${config.method?.toUpperCase()} ${config.url} requestId=${requestId}`
    );
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器 - 统一错误处理
apiClient.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as ApiResponse<unknown>;
    const requestId = (response.headers?.[REQUEST_ID_HEADER.toLowerCase()] as string | undefined)
      || apiResponse.requestId;

    appLogger.debug(
      `[API Response] ${response.config.method?.toUpperCase()} ${response.config.url} status=${response.status} requestId=${requestId}`
    );
    
    // 如果后端返回了 error，转换为错误
    if (apiResponse.error) {
      return Promise.reject(apiResponse.error);
    }
    
    return response;
  },
  (error: AxiosError<ApiResponse<unknown>>) => {
    let apiError: ApiError;
    
    if (error.response?.data?.error) {
      // 后端返回的错误
      apiError = error.response.data.error;
    } else if (error.response) {
      // HTTP 错误状态
      const statusMap: Record<number, string> = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        500: 'INTERNAL_ERROR',
      };
      apiError = {
        code: statusMap[error.response.status] || 'HTTP_ERROR',
        message: error.message || `HTTP ${error.response.status}`,
      };
    } else if (error.request) {
      // 网络错误
      apiError = {
        code: 'NETWORK_ERROR',
        message: '网络请求失败，请检查网络连接',
      };
    } else {
      // 其他错误
      apiError = {
        code: 'UNKNOWN_ERROR',
        message: error.message || '未知错误',
      };
    }
    
    appLogger.error('[API Error]', apiError);
    return Promise.reject(apiError);
  }
);

// 通用请求方法
export const request = {
  get<T>(url: string, params?: Record<string, unknown>): Promise<ApiResponse<T>> {
    return apiClient.get(url, { params }).then(res => res.data);
  },
  
  post<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return apiClient.post(url, data).then(res => res.data);
  },
  
  put<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return apiClient.put(url, data).then(res => res.data);
  },
  
  patch<T>(url: string, data?: unknown): Promise<ApiResponse<T>> {
    return apiClient.patch(url, data).then(res => res.data);
  },
  
  delete<T>(url: string): Promise<ApiResponse<T>> {
    return apiClient.delete(url).then(res => res.data);
  },
};

// ==================== Health API ====================
export const healthApi = {
  check(): Promise<ApiResponse<HealthResponse>> {
    return request.get('/health');
  },
};

// ==================== Template API ====================
export const templateApi = {
  // 获取模板列表
  list(includeLastRun: boolean = true, keyword?: string, groupName?: string, tag?: string): Promise<ApiResponse<{ items: TemplateSummary[] }>> {
    return request.get('/templates', { includeLastRun, keyword, groupName, tag });
  },
  
  // 获取模板详情
  get(id: string): Promise<ApiResponse<WorkflowTemplate>> {
    return request.get(`/templates/${id}`);
  },
  
  // 创建模板
  create(data: {
    name: string;
    description?: string | null;
    groupName?: string | null;
    tags?: string[];
    schemaVersion: string;
    steps: unknown[];
    otherStep: { nodes: unknown[]; edges: unknown[] };
  }): Promise<ApiResponse<WorkflowTemplate>> {
    return request.post('/templates', data);
  },
  
  // 更新模板元信息
  updateMeta(id: string, data: { name?: string; description?: string | null; groupName?: string | null; tags?: string[] }): Promise<ApiResponse<WorkflowTemplate>> {
    return request.patch(`/templates/${id}`, data);
  },
  
  // 保存模板步骤
  saveSteps(id: string, data: {
    schemaVersion: string;
    steps: unknown[];
    otherStep: { nodes: unknown[]; edges: unknown[] };
  }): Promise<ApiResponse<WorkflowTemplate>> {
    return request.put(`/templates/${id}`, data);
  },
  
  // 删除模板
  delete(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request.delete(`/templates/${id}`);
  },

  clone(id: string, data?: { name?: string }): Promise<ApiResponse<WorkflowTemplate>> {
    return request.post(`/templates/${id}/clone`, data || {});
  },

  batchDelete(ids: string[]): Promise<ApiResponse<BatchDeleteTemplatesData>> {
    return request.post('/templates/batch-delete', { ids });
  },
};

export const templateMarketApi = {
  list(keyword?: string): Promise<ApiResponse<{ items: PublishedTemplateSummary[] }>> {
    return request.get('/market/templates', { keyword });
  },

  publish(templateId: string): Promise<ApiResponse<PublishedTemplateSummary>> {
    return request.post('/market/templates/publish', { templateId });
  },

  importTemplate(id: string, data?: { name?: string }): Promise<ApiResponse<WorkflowTemplate>> {
    return request.post(`/market/templates/${id}/import`, data || {});
  },
};

export const scheduleApi = {
  list(templateId?: string, enabled?: boolean): Promise<ApiResponse<{ items: Schedule[] }>> {
    return request.get('/schedules', { templateId, enabled });
  },

  create(data: { templateId: string; triggerType: 'ONE_TIME' | 'INTERVAL'; delaySeconds?: number; intervalSeconds?: number; enabled?: boolean }): Promise<ApiResponse<Schedule>> {
    return request.post('/schedules', data);
  },

  update(id: string, data: { triggerType?: 'ONE_TIME' | 'INTERVAL'; delaySeconds?: number; intervalSeconds?: number; enabled?: boolean }): Promise<ApiResponse<Schedule>> {
    return request.patch(`/schedules/${id}`, data);
  },

  delete(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request.delete(`/schedules/${id}`);
  },
};

export const authApi = {
  login(data: { email: string; password: string; workspaceId?: string }): Promise<ApiResponse<UserSession>> {
    return request.post('/auth/login', data);
  },

  logout(): Promise<ApiResponse<{ loggedOut: boolean }>> {
    return request.post('/auth/logout');
  },

  me(): Promise<ApiResponse<UserSession>> {
    return request.get('/me');
  },
};

export const workspaceApi = {
  list(): Promise<ApiResponse<{ items: WorkspaceMembership[] }>> {
    return request.get('/workspaces');
  },
};

export const collaborationApi = {
  get(templateId: string): Promise<ApiResponse<TemplateCollaborationData>> {
    return request.get(`/templates/${templateId}/collaboration`);
  },

  share(templateId: string, data: { email: string; permission: TemplatePermission }): Promise<ApiResponse<TemplateCollaborationData>> {
    return request.post(`/templates/${templateId}/collaboration/share`, data);
  },

  getPresence(templateId: string): Promise<ApiResponse<TemplatePresenceData>> {
    return request.get(`/templates/${templateId}/collaboration/presence`);
  },

  heartbeatPresence(templateId: string): Promise<ApiResponse<TemplatePresenceData>> {
    return request.post(`/templates/${templateId}/collaboration/presence/heartbeat`);
  },

  leavePresence(templateId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request.delete(`/templates/${templateId}/collaboration/presence`);
  },
};

// ==================== Run API ====================
export const runApi = {
  // 发起运行
  start(templateId: string, dryRun: boolean = false, debug?: RunDebugOptions, launchOptions?: RunLaunchOptions): Promise<ApiResponse<{ run: Run; wsUrl: string; debug?: RunDebugSession | null }>> {
    return request.post('/runs', { templateId, dryRun, debug, launchOptions });
  },
  
  // 取消运行
  cancel(id: string): Promise<ApiResponse<Run>> {
    return request.post(`/runs/${id}/cancel`);
  },
  
  // 重启运行
  restart(id: string): Promise<ApiResponse<{ run: Run; wsUrl: string }>> {
    return request.post(`/runs/${id}/restart`);
  },

  openDebugBrowser(id: string): Promise<ApiResponse<RunDebugSession>> {
    return request.post(`/runs/${id}/debug/open-browser`);
  },

  getDebugContext(id: string): Promise<ApiResponse<RunDebugContextSnapshot>> {
    return request.get(`/runs/${id}/debug/context`);
  },

  continueDebug(id: string): Promise<ApiResponse<RunDebugSession>> {
    return request.post(`/runs/${id}/debug/continue`);
  },

  stepDebug(id: string): Promise<ApiResponse<RunDebugSession>> {
    return request.post(`/runs/${id}/debug/step`);
  },

  closeDebug(id: string): Promise<ApiResponse<RunDebugSession>> {
    return request.post(`/runs/${id}/debug/close`);
  },

  remoteControlDebug(id: string, data: { action: 'clickPreview' | 'typeText'; x?: number; y?: number; text?: string; clearBeforeType?: boolean }): Promise<ApiResponse<DebugRemoteControlData>> {
    return request.post(`/runs/${id}/debug/remote-control`, data);
  },
  
  // 删除运行记录
  delete(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return request.delete(`/runs/${id}`);
  },
  
  // 获取运行状态
  get(id: string): Promise<ApiResponse<Run>> {
    return request.get(`/runs/${id}`);
  },
  
  // 获取运行列表
  list(params?: {
    templateId?: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }): Promise<ApiResponse<{ items: Run[]; total: number }>> {
    return request.get('/runs', params);
  },
};

export default apiClient;
