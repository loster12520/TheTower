import { makeAutoObservable, runInAction } from 'mobx';
import type { Edge, Node } from '@xyflow/react';
import { buildWsUrl, runtimeConfig } from '@/config/runtime';
import { summarizeCanvasDiff, type CanvasDiffSummary } from '@/utils/collaborationDiff';
import { stepsToGraph } from '@/utils/canvasConverter';
import { collaborationApi, templateApi } from '@/services/api';
import type {
  ApiError,
  CollaborationPatchAppliedEvent,
  CollaborationPresenceChangedEvent,
  TemplatePatchAppliedData,
  TemplatePresenceData,
  TemplatePresenceMember,
} from '@/models';

type PresenceSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface RemoteNodePreview {
  id: string;
  label: string;
  type: string;
  position: { x: number; y: number };
  config: Record<string, unknown>;
}

const emptyPresence = (templateId: string | null): TemplatePresenceData | null => {
  if (!templateId) {
    return null;
  }

  return {
    templateId,
    members: [],
    onlineCount: 0,
    updatedAt: new Date(0).toISOString(),
  };
};

class EditorCollaborationStore {
  templateId: string | null = null;
  presence: TemplatePresenceData | null = null;
  remotePatch: TemplatePatchAppliedData | null = null;
  resolvedRemotePatch: TemplatePatchAppliedData | null = null;
  remoteDiffSummary: CanvasDiffSummary | null = null;
  remoteOriginalDiffSummary: CanvasDiffSummary | null = null;
  remoteNodePreviewMap: Record<string, RemoteNodePreview> = {};
  remoteGraphNodes: Node[] = [];
  remoteGraphEdges: Edge[] = [];
  loading = false;
  error: string | null = null;
  socketStatus: PresenceSocketStatus = 'closed';
  private lastPatchKey: string | null = null;
  private remoteDiffUpdatedAt: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  bindTemplate(templateId: string) {
    this.templateId = templateId;
    this.presence = emptyPresence(templateId);
    this.error = null;
  }

  reset() {
    this.templateId = null;
    this.presence = null;
    this.remotePatch = null;
    this.resolvedRemotePatch = null;
    this.remoteDiffSummary = null;
    this.remoteOriginalDiffSummary = null;
    this.remoteNodePreviewMap = {};
    this.remoteGraphNodes = [];
    this.remoteGraphEdges = [];
    this.loading = false;
    this.error = null;
    this.socketStatus = 'closed';
    this.lastPatchKey = null;
    this.remoteDiffUpdatedAt = null;
  }

  setSocketStatus(status: PresenceSocketStatus) {
    this.socketStatus = status;
  }

  handlePresenceEvent(
    event: CollaborationPresenceChangedEvent,
    currentUserId?: string,
    currentWorkspaceId?: string,
  ) {
    if (event.type !== 'COLLABORATION_PRESENCE_CHANGED' || !event.data) {
      return;
    }

    runInAction(() => {
      this.presence = event.data as TemplatePresenceData;
      this.error = null;
    });
    this.captureRemotePatch(event.data.latestPatch || null, currentUserId, currentWorkspaceId);
  }

  handlePatchEvent(
    event: CollaborationPatchAppliedEvent,
    currentUserId?: string,
    currentWorkspaceId?: string,
  ) {
    if (event.type !== 'COLLABORATION_PATCH_APPLIED' || !event.data) {
      return;
    }

    this.captureRemotePatch(event.data, currentUserId, currentWorkspaceId);
  }

  async fetchPresence(templateId: string = this.templateId || '', currentUserId?: string, currentWorkspaceId?: string) {
    if (!templateId) {
      return;
    }

    this.loading = true;
    try {
      const response = await collaborationApi.getPresence(templateId);
      runInAction(() => {
        this.templateId = templateId;
        this.presence = response.data;
        this.error = null;
      });
      this.captureRemotePatch(response.data.latestPatch || null, currentUserId, currentWorkspaceId);
    } catch (error) {
      const apiError = error as ApiError;
      runInAction(() => {
        this.error = apiError.message || '获取在线协作状态失败';
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async heartbeat(templateId: string = this.templateId || '') {
    if (!templateId) {
      return;
    }

    try {
      const response = await collaborationApi.heartbeatPresence(templateId);
      runInAction(() => {
        this.templateId = templateId;
        this.presence = response.data;
        this.error = null;
      });
    } catch (error) {
      const apiError = error as ApiError;
      runInAction(() => {
        this.error = apiError.message || '在线协作心跳失败';
      });
    }
  }

  async detectRemoteTemplateChange(
    templateId: string,
    knownUpdatedAt: string | null,
    currentUserId?: string,
    currentWorkspaceId?: string,
  ): Promise<TemplatePatchAppliedData | null> {
    if (!templateId || !knownUpdatedAt) {
      return null;
    }

    try {
      const response = await templateApi.get(templateId);
      if (response.data.updatedAt === knownUpdatedAt) {
        return null;
      }

      const fallbackPatch = this.presence?.latestPatch && this.presence.latestPatch.updatedAt === response.data.updatedAt
        ? this.presence.latestPatch
        : {
            templateId,
            savedByUserId: 'remote-collaborator',
            savedByUserName: '协作者',
            savedByWorkspaceId: 'remote-workspace',
            savedByWorkspaceName: '远端工作空间',
            updatedAt: response.data.updatedAt,
          };

      this.captureRemotePatch(fallbackPatch, currentUserId, currentWorkspaceId);
      return fallbackPatch;
    } catch {
      return null;
    }
  }

  clearRemotePatch() {
    this.remotePatch = null;
    this.remoteDiffSummary = null;
    this.remoteOriginalDiffSummary = null;
    this.remoteDiffUpdatedAt = null;
    this.remoteNodePreviewMap = {};
    this.remoteGraphNodes = [];
    this.remoteGraphEdges = [];
  }

  clearResolvedRemotePatch() {
    this.resolvedRemotePatch = null;
  }

  async hydrateRemoteDiff(templateId: string, baselineNodes: Node[], baselineEdges: Edge[]) {
    if (!templateId || !this.remotePatch || this.remoteDiffUpdatedAt === this.remotePatch.updatedAt) {
      return;
    }

    try {
      const response = await templateApi.get(templateId);
      const { nodes, edges } = stepsToGraph(response.data.steps, response.data.otherStep);
      const summary = summarizeCanvasDiff(baselineNodes, baselineEdges, nodes, edges);
      const remoteNodePreviewMap = nodes.reduce<Record<string, RemoteNodePreview>>((acc, node) => {
        acc[node.id] = {
          id: node.id,
          label: typeof node.data?.label === 'string' && node.data.label.trim().length > 0 ? node.data.label : node.id,
          type: node.type || 'unknown',
          position: node.position,
          config: ((node.data?.config as Record<string, unknown> | undefined) || {}),
        };
        return acc;
      }, {});
      runInAction(() => {
        this.remoteDiffSummary = summary;
        this.remoteOriginalDiffSummary = summary;
        this.remoteDiffUpdatedAt = response.data.updatedAt;
        this.remoteNodePreviewMap = remoteNodePreviewMap;
        this.remoteGraphNodes = nodes;
        this.remoteGraphEdges = edges;
      });
    } catch {
      runInAction(() => {
        this.remoteDiffSummary = null;
        this.remoteOriginalDiffSummary = null;
        this.remoteNodePreviewMap = {};
        this.remoteGraphNodes = [];
        this.remoteGraphEdges = [];
      });
    }
  }

  injectRemoteDiffForTesting(params: {
    patch: TemplatePatchAppliedData;
    baselineNodes: Node[];
    baselineEdges: Edge[];
    remoteNodes: Node[];
    remoteEdges: Edge[];
    currentUserId?: string;
    currentWorkspaceId?: string;
  }): boolean {
    const {
      patch,
      baselineNodes,
      baselineEdges,
      remoteNodes,
      remoteEdges,
      currentUserId,
      currentWorkspaceId,
    } = params;

    this.captureRemotePatch(patch, currentUserId, currentWorkspaceId);
    if (!this.remotePatch) {
      return false;
    }

    const summary = summarizeCanvasDiff(baselineNodes, baselineEdges, remoteNodes, remoteEdges);
    const remoteNodePreviewMap = remoteNodes.reduce<Record<string, RemoteNodePreview>>((acc, node) => {
      acc[node.id] = {
        id: node.id,
        label: typeof node.data?.label === 'string' && node.data.label.trim().length > 0 ? node.data.label : node.id,
        type: node.type || 'unknown',
        position: node.position,
        config: ((node.data?.config as Record<string, unknown> | undefined) || {}),
      };
      return acc;
    }, {});

    runInAction(() => {
      this.remoteDiffSummary = summary;
      this.remoteOriginalDiffSummary = summary;
      this.remoteDiffUpdatedAt = patch.updatedAt;
      this.remoteNodePreviewMap = remoteNodePreviewMap;
      this.remoteGraphNodes = remoteNodes;
      this.remoteGraphEdges = remoteEdges;
      this.error = null;
    });

    return true;
  }

  refreshRemoteDiffProgress(localNodes: Node[], localEdges: Edge[]) {
    if (!this.remoteOriginalDiffSummary) {
      return;
    }

    const localNodeMap = new Map(localNodes.map((node) => [node.id, node]));
    const localEdgesList = [...localEdges];
    const remoteNodeMap = new Map(this.remoteGraphNodes.map((node) => [node.id, node]));

    const hasMatchingEdge = (edgeId: string, source: string, target: string) =>
      localEdgesList.some((edge) => edge.id === edgeId || (edge.source === source && edge.target === target));

    const unresolvedAddedNodes = this.remoteOriginalDiffSummary.addedNodes.filter((item) => {
      const localNode = localNodeMap.get(item.id);
      const remoteNode = remoteNodeMap.get(item.id);
      return !localNode || !remoteNode || JSON.stringify(localNode) !== JSON.stringify(remoteNode);
    });

    const unresolvedRemovedNodes = this.remoteOriginalDiffSummary.removedNodes.filter((item) => localNodeMap.has(item.id));

    const unresolvedUpdatedNodes = this.remoteOriginalDiffSummary.updatedNodes.filter((item) => {
      const localNode = localNodeMap.get(item.id);
      const remoteNode = remoteNodeMap.get(item.id);
      return !localNode || !remoteNode || JSON.stringify(localNode) !== JSON.stringify(remoteNode);
    });

    const unresolvedAddedEdges = this.remoteOriginalDiffSummary.addedEdges.filter((item) => !hasMatchingEdge(item.id, item.source, item.target));

    const unresolvedRemovedEdges = this.remoteOriginalDiffSummary.removedEdges.filter((item) => hasMatchingEdge(item.id, item.source, item.target));

    const nextSummary: CanvasDiffSummary = {
        addedNodes: unresolvedAddedNodes,
        removedNodes: unresolvedRemovedNodes,
        updatedNodes: unresolvedUpdatedNodes,
        addedEdges: unresolvedAddedEdges,
        removedEdges: unresolvedRemovedEdges,
        baseNodeCount: localNodes.length,
        targetNodeCount: this.remoteGraphNodes.length,
        baseEdgeCount: localEdges.length,
        targetEdgeCount: this.remoteGraphEdges.length,
        addedNodeLabels: unresolvedAddedNodes.map((item) => item.label),
        removedNodeLabels: unresolvedRemovedNodes.map((item) => item.label),
        updatedNodeLabels: unresolvedUpdatedNodes.map((item) => item.label),
        addedEdgeCount: unresolvedAddedEdges.length,
        removedEdgeCount: unresolvedRemovedEdges.length,
        totalChanges:
          unresolvedAddedNodes.length
          + unresolvedRemovedNodes.length
          + unresolvedUpdatedNodes.length
          + unresolvedAddedEdges.length
          + unresolvedRemovedEdges.length,
      };

    if (nextSummary.totalChanges === 0) {
      this.resolvedRemotePatch = this.remotePatch;
      this.clearRemotePatch();
      return;
    }

    runInAction(() => {
      this.remoteDiffSummary = nextSummary;
    });
  }

  async leavePresence(templateId: string = this.templateId || '') {
    if (!templateId) {
      return;
    }

    try {
      await collaborationApi.leavePresence(templateId);
    } catch {
      // 页面关闭阶段忽略离线通知失败
    }
  }

  get websocketUrl(): string | null {
    if (!this.templateId || typeof window === 'undefined') {
      return null;
    }

    const token = window.localStorage.getItem(runtimeConfig.auth.tokenStorageKey);
    if (!token) {
      return null;
    }

    const workspaceId = window.localStorage.getItem(runtimeConfig.auth.workspaceStorageKey);
    const params = new URLSearchParams({ token });
    if (workspaceId) {
      params.set('workspaceId', workspaceId);
    }

    return buildWsUrl(`/ws/v1/templates/${this.templateId}/collaboration?${params.toString()}`);
  }

  get members(): TemplatePresenceMember[] {
    return this.presence?.members || [];
  }

  get onlineCount(): number {
    return this.presence?.onlineCount || 0;
  }

  get remotePatchLabel(): string | null {
    if (!this.remotePatch) {
      return null;
    }

    return `${this.remotePatch.savedByUserName}（${this.remotePatch.savedByWorkspaceName}）刚刚更新了模板`;
  }

  get resolvedRemotePatchLabel(): string | null {
    if (!this.resolvedRemotePatch) {
      return null;
    }

    return `${this.resolvedRemotePatch.savedByUserName}（${this.resolvedRemotePatch.savedByWorkspaceName}）的远端变更已处理完成`;
  }

  get connectionLabel(): string {
    if (this.socketStatus === 'open') {
      return '实时同步';
    }
    if (this.socketStatus === 'connecting') {
      return '连接中';
    }
    if (this.socketStatus === 'error') {
      return '轮询兜底';
    }
    return '轮询同步';
  }

  get remoteResolvedChangeCount(): number {
    if (!this.remoteOriginalDiffSummary) {
      return 0;
    }

    const unresolvedCount = this.remoteDiffSummary?.totalChanges ?? 0;
    return Math.max(this.remoteOriginalDiffSummary.totalChanges - unresolvedCount, 0);
  }

  get hasRemainingRemoteDiffs(): boolean {
    return (this.remoteDiffSummary?.totalChanges || 0) > 0;
  }

  getRemoteNodePreview(nodeId: string): RemoteNodePreview | null {
    return this.remoteNodePreviewMap[nodeId] || null;
  }

  getRemoteNodeMergePayload(nodeId: string): { node: Node; connectedEdges: Edge[] } | null {
    const node = this.remoteGraphNodes.find((item) => item.id === nodeId) || null;
    if (!node) {
      return null;
    }

    return {
      node,
      connectedEdges: this.remoteGraphEdges.filter((edge) => edge.source === nodeId || edge.target === nodeId),
    };
  }

  getRemoteEdgeMergePayload(edgeId: string): Edge | null {
    return this.remoteGraphEdges.find((edge) => edge.id === edgeId) || null;
  }

  private captureRemotePatch(
    patch: TemplatePatchAppliedData | null,
    currentUserId?: string,
    currentWorkspaceId?: string,
  ) {
    if (!patch) {
      return;
    }

    const patchKey = `${patch.updatedAt}:${patch.savedByUserId}:${patch.savedByWorkspaceId}`;
    if (this.lastPatchKey === patchKey) {
      return;
    }

    this.lastPatchKey = patchKey;
    if (patch.savedByUserId === currentUserId && patch.savedByWorkspaceId === currentWorkspaceId) {
      return;
    }

    runInAction(() => {
      this.resolvedRemotePatch = null;
      this.remotePatch = patch;
      this.remoteDiffSummary = null;
      this.remoteOriginalDiffSummary = null;
      this.remoteDiffUpdatedAt = null;
      this.remoteNodePreviewMap = {};
      this.remoteGraphNodes = [];
      this.remoteGraphEdges = [];
    });
  }
}

export const editorCollaborationStore = new EditorCollaborationStore();

export type { CollaborationPatchAppliedEvent, CollaborationPresenceChangedEvent };