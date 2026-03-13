/**
 * 前端运行时配置中心。
 * 目标：统一管理 API/WS 地址、鉴权开关、日志等级，避免业务代码硬编码环境参数。
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface RuntimeConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
  auth: {
    enabled: boolean;
    tokenHeader: string;
    tokenStorageKey: string;
  };
  log: {
    enabled: boolean;
    level: LogLevel;
  };
}

const resolveLogLevel = (): LogLevel => {
  const level = (process.env.UMI_APP_LOG_LEVEL || '').toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return process.env.NODE_ENV === 'development' ? 'debug' : 'info';
};

export const runtimeConfig: RuntimeConfig = {
  apiBaseUrl: process.env.UMI_APP_API_BASE_URL || '/api/v1',
  wsBaseUrl: process.env.UMI_APP_WS_BASE_URL || '/ws/v1',
  auth: {
    enabled: process.env.UMI_APP_AUTH_ENABLED === 'true',
    tokenHeader: process.env.UMI_APP_AUTH_HEADER || 'Authorization',
    tokenStorageKey: process.env.UMI_APP_AUTH_TOKEN_KEY || 'thetower_token',
  },
  log: {
    enabled: process.env.UMI_APP_LOG_ENABLED !== 'false',
    level: resolveLogLevel(),
  },
};

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export const appLogger = {
  debug(message: string, ...rest: unknown[]) {
    if (!runtimeConfig.log.enabled || levelRank[runtimeConfig.log.level] > levelRank.debug) return;
    console.debug(message, ...rest);
  },
  info(message: string, ...rest: unknown[]) {
    if (!runtimeConfig.log.enabled || levelRank[runtimeConfig.log.level] > levelRank.info) return;
    console.info(message, ...rest);
  },
  warn(message: string, ...rest: unknown[]) {
    if (!runtimeConfig.log.enabled || levelRank[runtimeConfig.log.level] > levelRank.warn) return;
    console.warn(message, ...rest);
  },
  error(message: string, ...rest: unknown[]) {
    if (!runtimeConfig.log.enabled || levelRank[runtimeConfig.log.level] > levelRank.error) return;
    console.error(message, ...rest);
  },
};

const toWsProtocolOrigin = (): string => {
  if (typeof window === 'undefined') {
    return 'ws://localhost:8080';
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
};

/**
 * 把后端返回的 ws 路径（如 /ws/v1/runs/xxx）转换为浏览器可连接 URL。
 */
export const buildWsUrl = (inputPathOrUrl: string): string => {
  if (inputPathOrUrl.startsWith('ws://') || inputPathOrUrl.startsWith('wss://')) {
    return inputPathOrUrl;
  }

  if (inputPathOrUrl.startsWith('/')) {
    return `${toWsProtocolOrigin()}${inputPathOrUrl}`;
  }

  if (inputPathOrUrl.startsWith('runs/')) {
    return `${toWsProtocolOrigin()}${runtimeConfig.wsBaseUrl}/${inputPathOrUrl}`;
  }

  return `${toWsProtocolOrigin()}/${inputPathOrUrl}`;
};
