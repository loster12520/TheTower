import { makeAutoObservable, runInAction } from 'mobx';
import { scheduleApi } from '@/services/api';
import type { ApiError, Schedule } from '@/models';

class ScheduleStore {
  schedules: Schedule[] = [];
  loading = false;
  drawerVisible = false;
  error: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  async fetchSchedules(templateId?: string) {
    this.loading = true;
    this.error = null;
    try {
      const response = await scheduleApi.list(templateId);
      runInAction(() => {
        this.schedules = response.data.items.map((item) => ({
          ...item,
          delaySeconds: item.delaySeconds ?? null,
          intervalSeconds: item.intervalSeconds ?? null,
          nextTriggerAt: item.nextTriggerAt ?? null,
          lastTriggeredAt: item.lastTriggeredAt ?? null,
          lastRunId: item.lastRunId ?? null,
          lastRunStatus: item.lastRunStatus ?? null,
          lastError: item.lastError ?? null,
        }));
      });
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '获取调度任务失败';
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async createSchedule(data: { templateId: string; triggerType: 'ONE_TIME' | 'INTERVAL'; delaySeconds?: number; intervalSeconds?: number; enabled?: boolean }) {
    try {
      await scheduleApi.create(data);
      await this.fetchSchedules();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '创建调度任务失败';
      return false;
    }
  }

  async toggleSchedule(id: string, enabled: boolean) {
    try {
      await scheduleApi.update(id, { enabled });
      await this.fetchSchedules();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '更新调度任务失败';
      return false;
    }
  }

  async deleteSchedule(id: string) {
    try {
      await scheduleApi.delete(id);
      await this.fetchSchedules();
      return true;
    } catch (error) {
      const apiError = error as ApiError;
      this.error = apiError.message || '删除调度任务失败';
      return false;
    }
  }

  setDrawerVisible(visible: boolean) {
    this.drawerVisible = visible;
  }
}

export const scheduleStore = new ScheduleStore();