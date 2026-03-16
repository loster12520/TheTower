import { makeAutoObservable, runInAction } from 'mobx';
import { runApi } from '@/services/api';
import type { Run, ApiError } from '@/models';

// WebSocket 事件类型
export type EventType = 
  | 'RUN_STARTED'
  | 'STEP_STARTED'
  | 'STEP_SUCCEEDED'
  | 'STEP_FAILED'
  | 'LOG'
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

// 步骤执行状态
export interface StepStatus {
  stepId: string;
  stepPath?: string[];
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  outputs?: Record<string, string>;
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

  constructor() {
    makeAutoObservable(this);
  }

  // 开始运行
  async startRun(templateId: string): Promise<boolean> {
    this.setLoading(true);
    this.setError(null);
    this.reset();

    try {
      const response = await runApi.start(templateId);
      
      runInAction(() => {
        this.currentRun = response.data.run;
        this.wsUrl = response.data.wsUrl;
        this.isRunning = true;
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
            };
            this.stepStatusMap.set(stepId, status);
            this.stepPathStatusMap.set(toPathKey(status.stepPath || [stepId]), status);
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

        case 'RUN_SUCCEEDED':
          this.isRunning = false;
          if (this.currentRun) {
            this.currentRun.status = 'SUCCEEDED';
            this.currentRun.finishedAt = event.ts;
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
