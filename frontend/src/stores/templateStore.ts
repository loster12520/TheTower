import { makeAutoObservable, runInAction } from 'mobx';
import { templateApi } from '@/services/api';
import type { WorkflowTemplate, ApiError } from '@/models';

// 列表项（不包含完整 steps）
export interface TemplateListItem {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string;
  stats: { stepCount: number };
  lastRun?: {
    runId: string;
    status: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'RUNNING';
    finishedAt: string | null;
  } | null;
}

class TemplateStore {
  // 状态
  templates: TemplateListItem[] = [];
  loading = false;
  error: string | null = null;

  // 对话框状态
  createModalVisible = false;
  renameModalVisible = false;
  currentTemplate: TemplateListItem | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  // 获取模板列表
  async fetchTemplates() {
    this.setLoading(true);
    this.setError(null);

    try {
      const response = await templateApi.list();
      runInAction(() => {
        this.templates = response.data.items;
      });
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '获取模板列表失败');
    } finally {
      this.setLoading(false);
    }
  }

  // 创建模板
  async createTemplate(name: string, description?: string): Promise<string | null> {
    try {
      const response = await templateApi.create({
        name,
        description: description || null,
        schemaVersion: '0.0.1',
        steps: [],
        otherStep: { nodes: [], edges: [] }
      });
      
      // 刷新列表
      await this.fetchTemplates();
      return response.data.id;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '创建模板失败');
      return null;
    }
  }

  // 重命名模板
  async renameTemplate(id: string, name: string, description?: string): Promise<boolean> {
    try {
      await templateApi.updateMeta(id, { name, description });
      // 刷新列表
      await this.fetchTemplates();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '重命名模板失败');
      return false;
    }
  }

  // 删除模板
  async deleteTemplate(id: string): Promise<boolean> {
    try {
      await templateApi.delete(id);
      // 刷新列表
      await this.fetchTemplates();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '删除模板失败');
      return false;
    }
  }

  // 设置状态
  setLoading(loading: boolean) {
    this.loading = loading;
  }

  setError(error: string | null) {
    this.error = error;
  }

  setCreateModalVisible(visible: boolean) {
    this.createModalVisible = visible;
  }

  setRenameModalVisible(visible: boolean) {
    this.renameModalVisible = visible;
  }

  setCurrentTemplate(template: TemplateListItem | null) {
    this.currentTemplate = template;
  }

  // 获取状态标签颜色
  getStatusColor(status: string): string {
    switch (status) {
      case 'SUCCEEDED':
        return 'success';
      case 'FAILED':
        return 'error';
      case 'RUNNING':
        return 'processing';
      case 'CANCELED':
        return 'warning';
      default:
        return 'default';
    }
  }

  // 获取状态显示文本
  getStatusText(status: string): string {
    switch (status) {
      case 'SUCCEEDED':
        return '成功';
      case 'FAILED':
        return '失败';
      case 'RUNNING':
        return '运行中';
      case 'CANCELED':
        return '已取消';
      default:
        return '未知';
    }
  }
}

// 导出单例
export const templateStore = new TemplateStore();
