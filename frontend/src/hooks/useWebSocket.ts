import { useEffect, useRef, useCallback, useState } from 'react';
import { appLogger } from '@/config/runtime';
import { closeSocketByKey, getOrCreateSocket } from '@/services/wsFactory';

export type WebSocketStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface WebSocketMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  onMessage?: (data: WebSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  key?: string;
  reconnectMaxAttempts?: number;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  heartbeatIntervalMs?: number;
  messageAdapter?: {
    encode?: (data: unknown) => string;
    decode?: (raw: string) => WebSocketMessage;
  };
}

export function useWebSocket(url: string | null, options: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectCountRef = useRef(0);
  const manualClosedRef = useRef(false);

  const connectionKey = options.key || url || 'default';
  const reconnectMaxAttempts = options.reconnectMaxAttempts ?? 5;
  const reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1000;
  const reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 10_000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 15_000;

  const decodeMessage = options.messageAdapter?.decode || ((raw: string) => JSON.parse(raw));
  const encodeMessage = options.messageAdapter?.encode || ((data: unknown) => JSON.stringify(data));

  const clearHeartbeat = useCallback(() => {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  const startHeartbeat = useCallback(() => {
    clearHeartbeat();
    heartbeatTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(encodeMessage({ type: 'PING', ts: Date.now() }));
      }
    }, heartbeatIntervalMs);
  }, [clearHeartbeat, encodeMessage, heartbeatIntervalMs]);

  const connect = useCallback(() => {
    if (!url) return;
    manualClosedRef.current = false;

    // 清除之前的重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    clearHeartbeat();

    setStatus('connecting');
    appLogger.info('[WebSocket] Connecting to:', url);

    try {
      const ws = getOrCreateSocket(connectionKey, url);
      wsRef.current = ws;

      const handleOpen = () => {
        appLogger.info('[WebSocket] Connected');
        setStatus('open');
        reconnectCountRef.current = 0;
        startHeartbeat();
        options.onOpen?.();
      };

      const handleMessage = (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        try {
          const data = decodeMessage(event.data);
          options.onMessage?.(data);
        } catch (err) {
          appLogger.error('[WebSocket] Failed to decode message:', err);
        }
      };

      const handleClose = () => {
        appLogger.info('[WebSocket] Closed');
        setStatus('closed');
        wsRef.current = null;
        clearHeartbeat();
        options.onClose?.();

        if (!manualClosedRef.current && reconnectCountRef.current < reconnectMaxAttempts) {
          const delay = Math.min(
            reconnectBaseDelayMs * Math.pow(2, reconnectCountRef.current),
            reconnectMaxDelayMs
          );
          reconnectCountRef.current++;
          appLogger.warn(
            `[WebSocket] Reconnecting in ${delay}ms... (${reconnectCountRef.current}/${reconnectMaxAttempts})`
          );
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      const handleError = (error: Event) => {
        appLogger.error('[WebSocket] Error:', error);
        setStatus('error');
        options.onError?.(error);
      };

      ws.addEventListener('open', handleOpen);
      ws.addEventListener('message', handleMessage);
      ws.addEventListener('close', handleClose);
      ws.addEventListener('error', handleError);

      if (ws.readyState === WebSocket.OPEN) {
        handleOpen();
      }

      return () => {
        ws.removeEventListener('open', handleOpen);
        ws.removeEventListener('message', handleMessage);
        ws.removeEventListener('close', handleClose);
        ws.removeEventListener('error', handleError);
      };
    } catch (err) {
      appLogger.error('[WebSocket] Failed to create connection:', err);
      setStatus('error');
    }
  }, [
    url,
    clearHeartbeat,
    connectionKey,
    decodeMessage,
    options,
    reconnectBaseDelayMs,
    reconnectMaxAttempts,
    reconnectMaxDelayMs,
    startHeartbeat,
  ]);

  const disconnect = useCallback(() => {
    manualClosedRef.current = true;

    // 清除重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    clearHeartbeat();

    // 重置重连计数
    reconnectCountRef.current = reconnectMaxAttempts;

    // 关闭连接
    closeSocketByKey(connectionKey);
    wsRef.current = null;

    setStatus('closed');
  }, [clearHeartbeat, connectionKey, reconnectMaxAttempts]);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(encodeMessage(data));
      return true;
    }
    return false;
  }, [encodeMessage]);

  // 组件挂载时连接，卸载时断开
  useEffect(() => {
    let cleanupListeners: (() => void) | void;

    if (url) {
      cleanupListeners = connect();
    }

    return () => {
      if (cleanupListeners) {
        cleanupListeners();
      }
      disconnect();
    };
  }, [url, connect, disconnect]);

  return {
    status,
    connect,
    disconnect,
    sendMessage,
  };
}
