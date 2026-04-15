import { makeAutoObservable, runInAction } from 'mobx';
import { authApi, collaborationApi, workspaceApi } from '@/services/api';
import { runtimeConfig } from '@/config/runtime';
import type { ApiError, TemplateCollaborationData, TemplatePermission, UserSession, WorkspaceMembership } from '@/models';
import type { TemplateListItem } from '@/stores/templateStore';

const getStoredToken = () => (typeof window !== 'undefined'
  ? window.localStorage.getItem(runtimeConfig.auth.tokenStorageKey)
  : null);

class AuthStore {
  currentUser: UserSession | null = null;
  workspaces: WorkspaceMembership[] = [];
  loading = false;
  drawerVisible = false;
  collaborationDrawerVisible = false;
  collaborationLoading = false;
  collaborationTemplate: TemplateListItem | null = null;
  collaboration: TemplateCollaborationData | null = null;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async hydrate() {
    if (!getStoredToken()) {
      return;
    }
    await Promise.all([this.fetchMe(), this.fetchWorkspaces()]);
  }

  async login(email: string, password: string, workspaceId?: string) {
    this.loading = true;
    this.error = null;
    try {
      const response = await authApi.login({ email, password, workspaceId });
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(runtimeConfig.auth.tokenStorageKey, response.data.token);
        window.localStorage.setItem(runtimeConfig.auth.workspaceStorageKey, response.data.workspaceId);
      }
      runInAction(() => {
        this.currentUser = response.data;
        this.workspaces = response.data.workspaces;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '登录失败';
      return false;
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchMe() {
    if (!getStoredToken()) {
      this.clearSession();
      return;
    }
    try {
      const response = await authApi.me();
      runInAction(() => {
        this.currentUser = response.data;
        this.workspaces = response.data.workspaces;
      });
    } catch {
      this.clearSession();
    }
  }

  async fetchWorkspaces() {
    if (!getStoredToken()) {
      this.workspaces = [];
      return;
    }
    try {
      const response = await workspaceApi.list();
      runInAction(() => {
        this.workspaces = response.data.items;
      });
    } catch {
      runInAction(() => {
        this.workspaces = [];
      });
    }
  }

  async switchWorkspace(workspaceId: string) {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(runtimeConfig.auth.workspaceStorageKey, workspaceId);
    }
    await Promise.all([this.fetchMe(), this.fetchWorkspaces()]);
  }

  async logout() {
    try {
      if (getStoredToken()) {
        await authApi.logout();
      }
    } catch {
      // ignore logout failures and clear local session anyway
    }
    this.clearSession();
  }

  async openCollaborationDrawer(template: TemplateListItem) {
    this.collaborationTemplate = template;
    this.collaborationDrawerVisible = true;
    await this.fetchCollaboration(template.id);
  }

  async fetchCollaboration(templateId: string) {
    this.collaborationLoading = true;
    this.error = null;
    try {
      const response = await collaborationApi.get(templateId);
      runInAction(() => {
        this.collaboration = response.data;
      });
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '获取协作信息失败';
    } finally {
      runInAction(() => {
        this.collaborationLoading = false;
      });
    }
  }

  async shareTemplate(email: string, permission: TemplatePermission) {
    if (!this.collaborationTemplate) {
      return false;
    }
    try {
      const response = await collaborationApi.share(this.collaborationTemplate.id, { email, permission });
      runInAction(() => {
        this.collaboration = response.data;
      });
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '分享模板失败';
      return false;
    }
  }

  setDrawerVisible(visible: boolean) {
    this.drawerVisible = visible;
  }

  setCollaborationDrawerVisible(visible: boolean) {
    this.collaborationDrawerVisible = visible;
    if (!visible) {
      this.collaborationTemplate = null;
      this.collaboration = null;
    }
  }

  clearSession() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(runtimeConfig.auth.tokenStorageKey);
      window.localStorage.removeItem(runtimeConfig.auth.workspaceStorageKey);
    }
    this.currentUser = null;
    this.workspaces = [];
  }

  get isLoggedIn() {
    return !!this.currentUser;
  }
}

export const authStore = new AuthStore();