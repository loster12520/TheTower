// 通用 API 响应结构
export interface ApiResponse<T> {
  requestId: string;
  data: T;
  error: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Health 检查响应
export interface HealthResponse {
  status: string;
}

// 模板相关类型
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: string;
  steps: Step[];
  otherStep: OtherStep;
  createdAt: string;
  updatedAt: string;
  stats: { stepCount: number };
  lastRun: LastRun | null;
}

export interface Step {
  id: string;
  type: 'openUrl' | 'click' | 'type' | 'waitFor' | 'extract';
  position: { x: number; y: number };
  data: {
    label: string;
    config: NodeConfig;
  };
}

export interface OtherStep {
  nodes: Step[];
  edges: Edge[];
}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export type NodeConfig =
  | { url: string }
  | { selector: string }
  | { selector: string; text: string }
  | { selector?: string; waitMs?: number }
  | { selector: string; as: string; mode: string; attributeName?: string };

export interface LastRun {
  runId: string;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'RUNNING';
  finishedAt: string | null;
}

// 运行相关类型
export interface Run {
  id: string;
  templateId: string;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELED';
  currentStepId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: { code: string; message: string } | null;
}
