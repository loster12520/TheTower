/**
 * WebSocket 连接工厂（按 key 单例）。
 * 目标：同 key 复用连接，不同 key 隔离，减少页面散落 new WebSocket。
 */

const socketMap = new Map<string, WebSocket>();

const cleanupSocket = (key: string) => {
  const socket = socketMap.get(key);
  if (!socket) return;

  if (
    socket.readyState === WebSocket.CLOSED ||
    socket.readyState === WebSocket.CLOSING
  ) {
    socketMap.delete(key);
  }
};

export const getOrCreateSocket = (key: string, url: string): WebSocket => {
  const existing = socketMap.get(key);
  if (existing && existing.readyState !== WebSocket.CLOSED && existing.readyState !== WebSocket.CLOSING) {
    return existing;
  }

  const socket = new WebSocket(url);
  socketMap.set(key, socket);

  socket.addEventListener('close', () => {
    cleanupSocket(key);
  });

  socket.addEventListener('error', () => {
    cleanupSocket(key);
  });

  return socket;
};

export const closeSocketByKey = (key: string) => {
  const socket = socketMap.get(key);
  if (!socket) return;

  socketMap.delete(key);
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close();
  }
};

export const closeAllSockets = () => {
  socketMap.forEach((socket, key) => {
    socketMap.delete(key);
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }
  });
};
