import { makeAutoObservable, runInAction } from 'mobx';
import { templateApi } from '@/services/api';
import type { WorkflowTemplate, TemplateSummary, ApiError } from '@/models';

export const DEFAULT_TEMPLATE_SCHEMA_VERSION = '0.0.7';
export const SUPPORTED_TEMPLATE_SCHEMA_VERSIONS = ['0.0.1', '0.0.4', '0.0.5', '0.0.6', '0.0.7'] as const;

// 列表项（不包含完整 steps）
export type TemplateListItem = TemplateSummary;

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
        schemaVersion: DEFAULT_TEMPLATE_SCHEMA_VERSION,
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

  // 获取模板详情（用于导出/导入后的校验等）
  async getTemplateById(id: string): Promise<WorkflowTemplate | null> {
    try {
      const response = await templateApi.get(id);
      return response.data;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '获取模板详情失败');
      return null;
    }
  }

  // 导入模板（从导出的 JSON 结构落库）
  async importTemplateFromJson(raw: unknown): Promise<string | null> {
    this.setError(null);

    // 最小校验：支持当前前端可识别的模板版本
    if (!raw || typeof raw !== 'object') {
      this.setError('导入失败：文件内容不是合法 JSON 对象');
      return null;
    }

    const obj = raw as Record<string, unknown>;
    const name = obj.name;
    const description = obj.description;
    const schemaVersion = obj.schemaVersion;
    const steps = obj.steps;
    const otherStep = obj.otherStep;

    if (typeof name !== 'string' || name.trim().length === 0) {
      this.setError('导入失败：缺少 name');
      return null;
    }

    if (!SUPPORTED_TEMPLATE_SCHEMA_VERSIONS.includes(schemaVersion as (typeof SUPPORTED_TEMPLATE_SCHEMA_VERSIONS)[number])) {
      this.setError(
        `导入失败：不支持的 schemaVersion（当前支持 ${SUPPORTED_TEMPLATE_SCHEMA_VERSIONS.join(' / ')}），实际为 ${String(schemaVersion)}`
      );
      return null;
    }

    if (!Array.isArray(steps)) {
      this.setError('导入失败：steps 必须为数组');
      return null;
    }

    const safeOtherStep = ((): { nodes: unknown[]; edges: unknown[] } => {
      if (!otherStep || typeof otherStep !== 'object') {
        return { nodes: [], edges: [] };
      }
      const other = otherStep as Record<string, unknown>;
      return {
        nodes: Array.isArray(other.nodes) ? (other.nodes as unknown[]) : [],
        edges: Array.isArray(other.edges) ? (other.edges as unknown[]) : [],
      };
    })();

    try {
      // 先创建模板以获取新的 id
      const created = await templateApi.create({
        name: name.trim(),
        description: typeof description === 'string' ? description : null,
        schemaVersion: schemaVersion as string,
        steps: [],
        otherStep: { nodes: [], edges: [] },
      });

      // 再落库 steps/otherStep
      await templateApi.saveSteps(created.data.id, {
        schemaVersion: schemaVersion as string,
        steps,
        otherStep: safeOtherStep,
      });

      await this.fetchTemplates();
      return created.data.id;
    } catch (error) {
      const apiError = error as ApiError;
      this.setError(apiError.message || '导入模板失败');
      return null;
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
