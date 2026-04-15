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
  groupName: string | null;
  tags: string[];
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
  groupName: string | null;
  tags: string[];
  schemaVersion: string;
  updatedAt: string;
  stats: { stepCount: number };
  lastRun: LastRun | null;
}

export interface BatchDeleteTemplatesData {
  deletedCount: number;
  failedIds: string[];
}

export interface PublishedTemplateSummary {
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

export type ScheduleTriggerType = 'ONE_TIME' | 'INTERVAL';

export interface Schedule {
  id: string;
  templateId: string;
  templateName: string;
  triggerType: ScheduleTriggerType;
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

export interface WorkspaceMembership {
  workspaceId: string;
  workspaceName: string;
  role: string;
}

export interface UserSession {
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

export type TemplatePermission = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface TemplateCollaborator {
  userId: string;
  userName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  permission: TemplatePermission;
  invitedAt: string;
  lastActiveAt: string | null;
}

export interface TemplateCollaborationData {
  templateId: string;
  ownerUserId: string;
  ownerUserName: string;
  ownerWorkspaceId: string;
  ownerWorkspaceName: string;
  collaborators: TemplateCollaborator[];
  currentPermission: TemplatePermission;
  shared: boolean;
}

export interface TemplatePresenceMember {
  userId: string;
  userName: string;
  email: string;
  workspaceId: string;
  workspaceName: string;
  role: string;
  joinedAt: string;
  lastSeenAt: string;
}

export interface TemplatePresenceData {
  templateId: string;
  members: TemplatePresenceMember[];
  onlineCount: number;
  updatedAt: string;
  latestPatch?: TemplatePatchAppliedData | null;
}

export interface TemplatePatchAppliedData {
  templateId: string;
  savedByUserId: string;
  savedByUserName: string;
  savedByWorkspaceId: string;
  savedByWorkspaceName: string;
  updatedAt: string;
}

export interface CollaborationPresenceChangedEvent {
  type: 'COLLABORATION_PRESENCE_CHANGED';
  data: TemplatePresenceData;
}

export interface CollaborationPatchAppliedEvent {
  type: 'COLLABORATION_PATCH_APPLIED';
  data: TemplatePatchAppliedData;
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
  | 'listenRequestTrigger'
  | 'listenRequestResult'
  | 'stopPageListen'
  | 'getUrl'
  | 'downloadFile'
  | 'importText'
  | 'saveData'
  | 'saveExcel'
  | 'importExcel'
  | 'extractActiveElement'
  | 'getClipboardText'
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
  content?: string;
  fileName?: string;
  saveDir?: string;
  path?: string;
  sheetName?: string;
  useHeader?: boolean;
  listenerId?: string;
  urlPattern?: string;
  matchType?: 'contains' | 'equals';
  method?: string;
  stopAll?: boolean;
  clearAfterRead?: boolean;
  keyPath?: string;
  condition?: ConditionConfig;
  breakpointCondition?: ConditionConfig;
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

export interface RunLaunchOptions {
  browser: 'chromium' | 'chrome' | 'edge' | 'firefox' | 'webkit';
  headless: boolean;
  defaultTimeoutMs: number;
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

export interface DebugRemoteControlData {
  session: RunDebugSession;
  latestContext?: RunDebugContextSnapshot | null;
  previewFrame?: DebugPreviewFrame | null;
  actionSummary: string;
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
