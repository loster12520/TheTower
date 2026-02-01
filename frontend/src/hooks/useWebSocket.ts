import { useEffect, useRef, useCallback, useState } from 'react';

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
}

export function useWebSocket(url: string | null, options: UseWebSocketOptions) {
  const [status, setStatus] = useState<WebSocketStatus>('closed');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECT = 5;

  const connect = useCallback(() => {
    if (!url) return;

    // 清除之前的重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 关闭之前的连接
    if (wsRef.current) {
      wsRef.current.close();
    }

    setStatus('connecting');
    console.log('[WebSocket] Connecting to:', url);

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setStatus('open');
        reconnectCountRef.current = 0;
        options.onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[WebSocket] Message:', data);
          options.onMessage?.(data);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Closed');
        setStatus('closed');
        wsRef.current = null;
        options.onClose?.();

        // 自动重连
        if (reconnectCountRef.current < MAX_RECONNECT) {
          const delay = Math.min(1000 * Math.pow(2, reconnectCountRef.current), 10000);
          reconnectCountRef.current++;
          console.log(`[WebSocket] Reconnecting in ${delay}ms... (${reconnectCountRef.current}/${MAX_RECONNECT})`);
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setStatus('error');
        options.onError?.(error);
      };
    } catch (err) {
      console.error('[WebSocket] Failed to create connection:', err);
      setStatus('error');
    }
  }, [url, options]);

  const disconnect = useCallback(() => {
    // 清除重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 重置重连计数
    reconnectCountRef.current = MAX_RECONNECT; // 设置最大值以阻止自动重连

    // 关闭连接
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('closed');
  }, []);

  const sendMessage = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  // 组件挂载时连接，卸载时断开
  useEffect(() => {
    if (url) {
      connect();
    }

    return () => {
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
