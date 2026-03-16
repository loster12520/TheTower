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

export type StepType =
  | 'openUrl'
  | 'click'
  | 'type'
  | 'waitFor'
  | 'extract'
  | 'if'
  | 'forTimes'
  | 'while'
  | 'break';

export interface Step {
  id: string;
  type: StepType;
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

export interface ConditionConfig {
  left: string;
  op:
    | 'exists'
    | 'notExists'
    | 'contains'
    | 'notContains'
    | 'equals'
    | 'notEquals'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte';
  right?: string;
}

export type NodeConfig = Record<string, unknown> & {
  url?: string;
  selector?: string;
  text?: string;
  waitMs?: number;
  as?: string;
  mode?: string;
  attributeName?: string;
  condition?: ConditionConfig;
  then?: Step[];
  else?: Step[];
  body?: Step[];
  times?: number;
  indexVar?: string;
  maxIterations?: number;
};

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
