import { makeAutoObservable, runInAction } from 'mobx';
import { runApi } from '@/services/api';
import type {
  Run,
  ApiError,
  RunArtifact,
  RunDebugOptions,
  RunDebugSession,
  DebugPreviewFrame,
  RunDebugContextSnapshot,
  DebugSessionStatus,
} from '@/models';

// WebSocket 事件类型
export type EventType = 
  | 'RUN_STARTED'
  | 'STEP_STARTED'
  | 'STEP_SUCCEEDED'
  | 'STEP_FAILED'
  | 'LOG'
  | 'DEBUG_SESSION_STARTED'
  | 'DEBUG_FRAME'
  | 'DEBUG_STATUS_CHANGED'
  | 'DEBUG_BREAKPOINT_HIT'
  | 'DEBUG_CONTEXT_UPDATED'
  | 'DEBUG_RESUMED'
  | 'DEBUG_STEPPED'
  | 'DEBUG_SESSION_CLOSED'
  | 'DEBUG_ERROR'
  | 'RUN_SUCCEEDED'
  | 'RUN_FAILED'
  | 'RUN_CANCELED';

export interface RunEvent {
  runId: string;
  requestId?: string | null;
  seq: number;
  ts: string;
  type: EventType;
  payload: Record<string, unknown>;
}

const normalizeStepPath = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const toPathKey = (stepPath: string[]): string => stepPath.join('/');

const toDebugContext = (value: unknown): RunDebugContextSnapshot | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const variablesValue = record.variables;
  const variables = variablesValue && typeof variablesValue === 'object' && !Array.isArray(variablesValue)
    ? Object.fromEntries(
      Object.entries(variablesValue as Record<string, unknown>).map(([key, item]) => [key, String(item ?? '')]),
    )
    : {};

  return {
    stepId: typeof record.stepId === 'string' ? record.stepId : null,
    stepPath: normalizeStepPath(record.stepPath),
    pageAlias: typeof record.pageAlias === 'string' ? record.pageAlias : null,
    contextId: typeof record.contextId === 'string' ? record.contextId : null,
    variables,
    updatedAt: typeof record.updatedAt === 'string'
      ? record.updatedAt
      : typeof record.ts === 'string'
        ? record.ts
        : null,
  };
};

const buildDebugSession = (
  current: RunDebugSession | null,
  patch: Partial<RunDebugSession>,
): RunDebugSession => ({
  enabled: patch.enabled ?? current?.enabled ?? true,
  openVisibleBrowser: patch.openVisibleBrowser ?? current?.openVisibleBrowser ?? false,
  openDevtools: patch.openDevtools ?? current?.openDevtools ?? false,
  previewFps: patch.previewFps ?? current?.previewFps ?? 2,
  previewQuality: patch.previewQuality ?? current?.previewQuality ?? 60,
  pauseOnStart: patch.pauseOnStart ?? current?.pauseOnStart ?? false,
  breakpoints: patch.breakpoints ?? current?.breakpoints ?? [],
  status: patch.status ?? current?.status ?? 'IDLE',
  currentStepId: patch.currentStepId ?? current?.currentStepId ?? null,
  currentStepPath: patch.currentStepPath ?? current?.currentStepPath ?? [],
  pageAlias: patch.pageAlias ?? current?.pageAlias ?? null,
  contextId: patch.contextId ?? current?.contextId ?? null,
  lastFrameTs: patch.lastFrameTs ?? current?.lastFrameTs ?? null,
  lastError: patch.lastError ?? current?.lastError ?? null,
  latestContext: patch.latestContext ?? current?.latestContext ?? null,
});

// 步骤执行状态
export interface StepStatus {
  stepId: string;
  stepPath?: string[];
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  outputs?: Record<string, string>;
  artifacts?: RunArtifact[];
  pageAlias?: string | null;
  contextId?: string | null;
  error?: { code: string; message: string };
}

class RunStore {
  // 当前运行
  currentRun: Run | null = null;
  wsUrl: string | null = null;
  
  // 运行状态
  isRunning = false;
  isLoading = false;
  error: string | null = null;
  
  // 事件和日志
  events: RunEvent[] = [];
  logs: { level: string; message: string; ts: string }[] = [];
  
  // 步骤状态映射
  stepStatusMap: Map<string, StepStatus> = new Map();
  stepPathStatusMap: Map<string, StepStatus> = new Map();
  
  // 当前执行到的步骤
  currentStepId: string | null = null;
  currentStepPath: string[] | null = null;

  // 调试预览状态
  debugSession: RunDebugSession | null = null;
  latestDebugFrame: DebugPreviewFrame | null = null;
  latestDebugContext: RunDebugContextSnapshot | null = null;
  lastDebugReason: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  // 开始运行
  async startRun(templateId: string, options?: { dryRun?: boolean; debug?: RunDebugOptions }): Promise<boolean> {
    this.setLoading(true);
    this.setError(null);
    this.reset();

    try {
      const response = await runApi.start(templateId, options?.dryRun ?? false, options?.debug);
      const latestContext = toDebugContext(response.data.debug?.latestContext);
      
      runInAction(() => {
        this.currentRun = response.data.run;
        this.wsUrl = response.data.wsUrl;
        this.isRunning = true;
        this.debugSession = response.data.debug
          ? buildDebugSession(null, { ...response.data.debug, latestContext })
          : null;
        this.latestDebugContext = latestContext;
      });

      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '启动运行失败');
      return false;
    } finally {
      this.setLoading(false);
    }
  }

  // 取消运行
  async cancelRun(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      await runApi.cancel(this.currentRun.id);
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '取消运行失败');
      return false;
    }
  }

  async openDebugBrowser(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      const response = await runApi.openDebugBrowser(this.currentRun.id);
      runInAction(() => {
        this.error = null;
        this.debugSession = response.data;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '打开宿主机调试失败');
      return false;
    }
  }

  async refreshDebugContext(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      const response = await runApi.getDebugContext(this.currentRun.id);
      const latestContext = toDebugContext(response.data);
      runInAction(() => {
        this.error = null;
        this.latestDebugContext = latestContext;
        if (latestContext) {
          this.debugSession = buildDebugSession(this.debugSession, {
            currentStepId: latestContext.stepId ?? null,
            currentStepPath: latestContext.stepPath,
            pageAlias: latestContext.pageAlias ?? null,
            contextId: latestContext.contextId ?? null,
            latestContext,
          });
        }
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '获取调试上下文失败');
      return false;
    }
  }

  async continueDebug(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      const response = await runApi.continueDebug(this.currentRun.id);
      const latestContext = toDebugContext(response.data.latestContext) || this.latestDebugContext;
      runInAction(() => {
        this.error = null;
        this.lastDebugReason = null;
        this.debugSession = buildDebugSession(this.debugSession, { ...response.data, latestContext });
        this.latestDebugContext = latestContext;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '继续运行失败');
      return false;
    }
  }

  async stepDebug(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      const response = await runApi.stepDebug(this.currentRun.id);
      const latestContext = toDebugContext(response.data.latestContext) || this.latestDebugContext;
      runInAction(() => {
        this.error = null;
        this.debugSession = buildDebugSession(this.debugSession, { ...response.data, latestContext });
        this.latestDebugContext = latestContext;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '单步执行失败');
      return false;
    }
  }

  async closeDebug(): Promise<boolean> {
    if (!this.currentRun) return false;

    try {
      const response = await runApi.closeDebug(this.currentRun.id);
      runInAction(() => {
        this.error = null;
        this.debugSession = response.data;
        this.latestDebugFrame = null;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '关闭调试预览失败');
      return false;
    }
  }

  // 处理 WebSocket 事件
  handleEvent(event: RunEvent) {
    runInAction(() => {
      this.events.push(event);

      switch (event.type) {
        case 'RUN_STARTED':
          this.isRunning = true;
          break;

        case 'STEP_STARTED':
          {
            const stepId = event.payload.stepId as string;
            const stepPath = normalizeStepPath(event.payload.stepPath);
            this.currentStepId = stepId;
            this.currentStepPath = stepPath.length > 0 ? stepPath : [stepId];
            const status: StepStatus = {
              stepId,
              stepPath: this.currentStepPath,
              status: 'running',
            };
            this.stepStatusMap.set(stepId, status);
            this.stepPathStatusMap.set(toPathKey(status.stepPath || [stepId]), status);
          }
          break;

        case 'STEP_SUCCEEDED':
          {
            const stepId = event.payload.stepId as string;
            const stepPath = normalizeStepPath(event.payload.stepPath);
            this.currentStepId = stepId;
            this.currentStepPath = stepPath.length > 0 ? stepPath : [stepId];
            const status: StepStatus = {
              stepId,
              stepPath: this.currentStepPath,
              status: 'succeeded',
              outputs: event.payload.outputs as Record<string, string>,
              artifacts: (event.payload.artifacts as RunArtifact[]) || [],
              pageAlias: (event.payload.pageAlias as string | null | undefined) ?? null,
              contextId: (event.payload.contextId as string | null | undefined) ?? null,
            };
            this.stepStatusMap.set(stepId, status);
            this.stepPathStatusMap.set(toPathKey(status.stepPath || [stepId]), status);
            if (this.currentRun) {
              this.currentRun.outputs = {
                ...this.currentRun.outputs,
                ...(status.outputs || {}),
              };
              this.currentRun.artifacts = [...this.currentRun.artifacts, ...(status.artifacts || [])];
            }
          }
          break;

        case 'STEP_FAILED':
          {
            const stepId = event.payload.stepId as string;
            const stepPath = normalizeStepPath(event.payload.stepPath);
            this.currentStepId = stepId;
            this.currentStepPath = stepPath.length > 0 ? stepPath : [stepId];
            const status: StepStatus = {
              stepId,
              stepPath: this.currentStepPath,
              status: 'failed',
              error: event.payload.error as { code: string; message: string },
            };
            this.stepStatusMap.set(stepId, status);
            this.stepPathStatusMap.set(toPathKey(status.stepPath || [stepId]), status);
          }
          break;

        case 'LOG':
          this.logs.push({
            level: event.payload.level as string,
            message: event.payload.message as string,
            ts: event.ts,
          });
          break;

        case 'DEBUG_SESSION_STARTED':
          this.debugSession = buildDebugSession(this.debugSession, {
            enabled: true,
            openVisibleBrowser: Boolean(event.payload.openVisibleBrowser),
            openDevtools: Boolean(event.payload.openDevtools),
            previewFps: Number(event.payload.previewFps || 2),
            previewQuality: Number(event.payload.previewQuality || 60),
            pauseOnStart: Boolean(event.payload.pauseOnStart),
            breakpoints: Array.isArray(event.payload.breakpoints)
              ? (event.payload.breakpoints as string[])
              : this.debugSession?.breakpoints ?? [],
            status: (event.payload.status as RunDebugSession['status']) || 'STARTING',
          });
          break;

        case 'DEBUG_STATUS_CHANGED':
          this.debugSession = buildDebugSession(this.debugSession, {
            status: (event.payload.status as RunDebugSession['status']) || this.debugSession?.status || 'IDLE',
            pageAlias: (event.payload.pageAlias as string | null | undefined) ?? this.debugSession?.pageAlias ?? null,
            contextId: (event.payload.contextId as string | null | undefined) ?? this.debugSession?.contextId ?? null,
            lastFrameTs: (event.payload.ts as string | undefined) ?? this.debugSession?.lastFrameTs ?? null,
          });
          break;

        case 'DEBUG_CONTEXT_UPDATED':
          {
            const snapshot = toDebugContext(event.payload);
            if (snapshot) {
              this.latestDebugContext = snapshot;
              this.debugSession = buildDebugSession(this.debugSession, {
                currentStepId: snapshot.stepId ?? null,
                currentStepPath: snapshot.stepPath,
                pageAlias: snapshot.pageAlias ?? null,
                contextId: snapshot.contextId ?? null,
                latestContext: snapshot,
              });
            }
          }
          break;

        case 'DEBUG_BREAKPOINT_HIT':
          this.currentStepId = (event.payload.stepId as string) || this.currentStepId;
          this.currentStepPath = normalizeStepPath(event.payload.stepPath);
          this.lastDebugReason = (event.payload.reason as string | undefined) || null;
          this.debugSession = buildDebugSession(this.debugSession, {
            status: 'PAUSED',
            currentStepId: this.currentStepId,
            currentStepPath: this.currentStepPath || [],
            pageAlias: (event.payload.pageAlias as string | null | undefined) ?? this.debugSession?.pageAlias ?? null,
            contextId: (event.payload.contextId as string | null | undefined) ?? this.debugSession?.contextId ?? null,
          });
          break;

        case 'DEBUG_RESUMED':
        case 'DEBUG_STEPPED':
          this.currentStepId = (event.payload.stepId as string) || this.currentStepId;
          this.currentStepPath = normalizeStepPath(event.payload.stepPath);
          this.lastDebugReason = null;
          this.debugSession = buildDebugSession(this.debugSession, {
            status: 'STREAMING',
            currentStepId: this.currentStepId,
            currentStepPath: this.currentStepPath || [],
          });
          break;

        case 'DEBUG_FRAME':
          this.latestDebugFrame = {
            mimeType: event.payload.mimeType as string,
            frameBase64: event.payload.frameBase64 as string,
            width: Number(event.payload.width || 0),
            height: Number(event.payload.height || 0),
            pageAlias: (event.payload.pageAlias as string | null | undefined) ?? null,
            contextId: (event.payload.contextId as string | null | undefined) ?? null,
            ts: (event.payload.ts as string) || event.ts,
          };
          this.debugSession = buildDebugSession(this.debugSession, {
            status: this.debugSession?.status === 'PAUSED' ? 'PAUSED' : 'STREAMING',
            pageAlias: this.latestDebugFrame.pageAlias ?? this.debugSession?.pageAlias ?? null,
            contextId: this.latestDebugFrame.contextId ?? this.debugSession?.contextId ?? null,
            lastFrameTs: this.latestDebugFrame.ts,
          });
          break;

        case 'DEBUG_SESSION_CLOSED':
          if (this.debugSession) {
            this.debugSession = buildDebugSession(this.debugSession, {
              status: (event.payload.status as RunDebugSession['status']) || 'CLOSED',
              pageAlias: (event.payload.pageAlias as string | null | undefined) ?? this.debugSession.pageAlias ?? null,
              contextId: (event.payload.contextId as string | null | undefined) ?? this.debugSession.contextId ?? null,
              lastFrameTs: (event.payload.lastFrameTs as string | null | undefined) ?? this.debugSession.lastFrameTs ?? null,
              lastError: (event.payload.error as string | null | undefined) ?? this.debugSession.lastError ?? null,
            });
            if (this.debugSession.status === 'CLOSED') {
              this.latestDebugFrame = null;
            }
          }
          break;

        case 'DEBUG_ERROR':
          this.debugSession = buildDebugSession(this.debugSession, {
            status: 'ERROR',
            pageAlias: (event.payload.pageAlias as string | null | undefined) ?? this.debugSession?.pageAlias ?? null,
            contextId: (event.payload.contextId as string | null | undefined) ?? this.debugSession?.contextId ?? null,
            lastError: (event.payload.message as string | undefined) ?? this.debugSession?.lastError ?? null,
          });
          break;

        case 'RUN_SUCCEEDED':
          this.isRunning = false;
          if (this.currentRun) {
            this.currentRun.status = 'SUCCEEDED';
            this.currentRun.finishedAt = event.ts;
            this.currentRun.outputs = event.payload.outputs as Record<string, string> || this.currentRun.outputs;
            this.currentRun.artifacts = event.payload.artifacts as RunArtifact[] || this.currentRun.artifacts;
          }
          break;

        case 'RUN_FAILED':
          this.isRunning = false;
          if (this.currentRun) {
            this.currentRun.status = 'FAILED';
            this.currentRun.finishedAt = event.ts;
            this.currentRun.error = event.payload.error as { code: string; message: string };
          }
          break;

        case 'RUN_CANCELED':
          this.isRunning = false;
          if (this.currentRun) {
            this.currentRun.status = 'CANCELED';
            this.currentRun.finishedAt = event.ts;
          }
          break;
      }
    });
  }

  // 重置状态
  reset() {
    this.currentRun = null;
    this.wsUrl = null;
    this.isRunning = false;
    this.events = [];
    this.logs = [];
    this.stepStatusMap.clear();
    this.stepPathStatusMap.clear();
    this.currentStepId = null;
    this.currentStepPath = null;
    this.error = null;
    this.debugSession = null;
    this.latestDebugFrame = null;
    this.latestDebugContext = null;
    this.lastDebugReason = null;
  }

  // 获取步骤状态
  getStepStatus(stepId: string): StepStatus | undefined {
    return this.stepStatusMap.get(stepId);
  }

  getStepStatusByPath(stepPath: string[]): StepStatus | undefined {
    return this.stepPathStatusMap.get(toPathKey(stepPath));
  }

  get latestFailedStepPath(): string[] | null {
    let fallbackPath: string[] | null = null;

    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index];
      if (event.type !== 'STEP_FAILED') {
        continue;
      }

      const stepPath = normalizeStepPath(event.payload.stepPath);
      if (stepPath.length > 1) {
        return stepPath;
      }

      if (stepPath.length === 1) {
        fallbackPath = stepPath;
        continue;
      }

      if (typeof event.payload.stepId === 'string') {
        fallbackPath = [event.payload.stepId];
      }
    }

    return fallbackPath;
  }

  getPathAggregateStatus(pathPrefix: string[]): StepStatus['status'] | undefined {
    const prefix = toPathKey(pathPrefix);
    let hasSucceeded = false;

    for (const [pathKey, status] of this.stepPathStatusMap.entries()) {
      if (pathKey === prefix || pathKey.startsWith(`${prefix}/`)) {
        if (status.status === 'failed') {
          return 'failed';
        }
        if (status.status === 'running') {
          return 'running';
        }
        if (status.status === 'succeeded') {
          hasSucceeded = true;
        }
      }
    }

    return hasSucceeded ? 'succeeded' : undefined;
  }

  hasPathFailure(pathPrefix: string[]): boolean {
    return this.getPathAggregateStatus(pathPrefix) === 'failed';
  }

  hasPathRunning(pathPrefix: string[]): boolean {
    return this.getPathAggregateStatus(pathPrefix) === 'running';
  }

  get latestOutputs(): Record<string, string> {
    return this.currentRun?.outputs || {};
  }

  get latestArtifacts(): RunArtifact[] {
    return this.currentRun?.artifacts || [];
  }

  get debugPreviewUrl(): string | null {
    if (!this.latestDebugFrame) return null;
    return `data:${this.latestDebugFrame.mimeType};base64,${this.latestDebugFrame.frameBase64}`;
  }

  get isDebugPaused(): boolean {
    return this.debugSession?.status === 'PAUSED';
  }

  get debugStatusText(): string {
    const status = this.debugSession?.status;
    const mapping: Record<DebugSessionStatus, string> = {
      IDLE: '空闲',
      STARTING: '启动中',
      STREAMING: '运行中',
      PAUSED: '已暂停',
      CLOSED: '已关闭',
      ERROR: '异常',
    };
    return status ? mapping[status] : '-';
  }

  // 状态设置器
  setLoading(loading: boolean) {
    this.isLoading = loading;
  }

  setError(error: string | null) {
    this.error = error;
  }
}

// 导出单例
export const runStore = new RunStore();
