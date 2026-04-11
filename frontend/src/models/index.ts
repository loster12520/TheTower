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

export interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  schemaVersion: string;
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
  | 'keyboardPress'
  | 'keyboardHotkey'
  | 'textExtract'
  | 'goBack'
  | 'closeOtherPages'
  | 'newPage'
  | 'closePage'
  | 'switchPage'
  | 'reloadPage'
  | 'screenshotPage'
  | 'hover'
  | 'focus'
  | 'selectOption'
  | 'scrollPage'
  | 'uploadFiles'
  | 'executeJs'
  | 'waitForResponse'
  | 'getUrl'
  | 'downloadFile'
  | 'importText'
  | 'totp'
  | 'getCookies'
  | 'clearCookies'
  | 'forEachElement'
  | 'forEachData'
  | 'startBrowser'
  | 'closeBrowser'
  | 'if'
  | 'forTimes'
  | 'while'
  | 'break'
  | 'callWorkflow'
  | 'convertJson'
  | 'extractKey'
  | 'randomGet';

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
  elementRefVar?: string;
  elementOrder?: {
    type?: 'first' | 'last' | 'index' | 'random' | 'randomRange';
    index?: number;
    min?: number;
    max?: number;
  };
  text?: string;
  key?: string;
  modifiers?: string[] | string;
  input?: string;
  pattern?: string;
  groupIndex?: number;
  waitMs?: number;
  saveAs?: string;
  as?: string;
  extractType?: string;
  mode?: string;
  attributeName?: string;
  pageAlias?: string;
  keep?: 'current' | 'alias';
  breakpoint?: boolean;
  workflowId?: string;
  inputMapping?: Record<string, string>;
  outputVar?: string;
  sourceVar?: string;
  inputVar?: string;
  targetFormat?: 'object' | 'string';
  direction?: 'parse' | 'stringify';
  value?: string;
  keyPath?: string;
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

export interface RunArtifact {
  artifactId: string;
  name: string;
  kind: string;
  relativePath: string;
  createdAt: string;
}

export interface RunDebugOptions {
  enabled: boolean;
  openVisibleBrowser?: boolean;
  openDevtools?: boolean;
  previewFps?: number;
  previewQuality?: number;
  pauseOnStart?: boolean;
  breakpoints?: string[];
  keepBrowserOnFinish?: boolean;
}

export type DebugSessionStatus =
  | 'IDLE'
  | 'STARTING'
  | 'STREAMING'
  | 'PAUSED'
  | 'COMPLETED_WAITING_CLOSE'
  | 'FAILED_WAITING_CLOSE'
  | 'CLOSED'
  | 'ERROR';

export interface RunDebugContextSnapshot {
  stepId?: string | null;
  stepName?: string | null;
  stepType?: StepType | null;
  stepPath: string[];
  pageAlias?: string | null;
  contextId?: string | null;
  variables: Record<string, string>;
  updatedAt?: string | null;
}

export interface RunDebugSession {
  enabled: boolean;
  openVisibleBrowser: boolean;
  openDevtools: boolean;
  previewFps: number;
  previewQuality: number;
  pauseOnStart: boolean;
  breakpoints: string[];
  keepBrowserOnFinish: boolean;
  status: DebugSessionStatus;
  currentStepId?: string | null;
  currentStepName?: string | null;
  currentStepPath: string[];
  pageAlias?: string | null;
  contextId?: string | null;
  lastFrameTs?: string | null;
  lastError?: string | null;
  latestContext?: RunDebugContextSnapshot | null;
}

export interface DebugPreviewFrame {
  mimeType: string;
  frameBase64: string;
  width: number;
  height: number;
  pageAlias?: string | null;
  contextId?: string | null;
  ts: string;
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
  outputs: Record<string, string>;
  artifacts: RunArtifact[];
}
