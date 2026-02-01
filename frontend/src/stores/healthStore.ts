import { makeAutoObservable, runInAction } from 'mobx';
import axios from 'axios';

// API 响应类型
interface ApiResponse<T> {
  requestId: string;
  data: T;
  error: {
    code: string;
    message: string;
  } | null;
}

interface HealthResponse {
  status: string;
}

// 后端健康状态
export type BackendStatus = 'unknown' | 'healthy' | 'unhealthy';

class HealthStore {
  // 状态
  status: BackendStatus = 'unknown';
  isChecking = false;
  lastError: string | null = null;
  lastCheckTime: Date | null = null;

  // 定时器 ID
  private checkIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  // 检查后端健康状态
  async checkHealth(): Promise<boolean> {
    this.setChecking(true);
    this.setError(null);

    try {
      const response = await axios.get<ApiResponse<HealthResponse>>('/api/v1/health');
      
      if (response.data?.data?.status === 'ok') {
        this.setStatus('healthy');
      } else {
        this.setStatus('unhealthy');
      }
      this.setLastCheckTime(new Date());
      
      return this.status === 'healthy';
    } catch (error: any) {
      this.setStatus('unhealthy');
      this.setError(error?.response?.data?.error?.message || error.message || '无法连接到后端服务');
      this.setLastCheckTime(new Date());
      return false;
    } finally {
      this.setChecking(false);
    }
  }

  // 使用 action 修改状态
  setStatus(status: BackendStatus) {
    this.status = status;
  }

  setChecking(checking: boolean) {
    this.isChecking = checking;
  }

  setError(error: string | null) {
    this.lastError = error;
  }

  setLastCheckTime(time: Date | null) {
    this.lastCheckTime = time;
  }

  // 开始定期检查
  startPeriodicCheck(intervalMs: number = 10000): void {
    this.stopPeriodicCheck();
    this.checkHealth();
    this.checkIntervalId = setInterval(() => {
      this.checkHealth();
    }, intervalMs);
  }

  // 停止定期检查
  stopPeriodicCheck(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
  }

  // 获取状态文本
  get statusText(): string {
    switch (this.status) {
      case 'healthy':
        return '后端服务正常';
      case 'unhealthy':
        return '后端服务异常';
      default:
        return '正在检查后端服务...';
    }
  }

  // 获取状态颜色
  get statusColor(): string {
    switch (this.status) {
      case 'healthy':
        return '#52c41a';
      case 'unhealthy':
        return '#ff4d4f';
      default:
        return '#faad14';
    }
  }
}

// 导出单例
export const healthStore = new HealthStore();
