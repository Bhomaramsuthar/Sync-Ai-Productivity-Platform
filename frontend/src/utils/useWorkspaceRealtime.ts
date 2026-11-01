import { useEffect, useRef } from 'react';
import { WorkspaceRealtimeClient, type WorkspaceRealtimeEvent } from '../services/realtime';

export type RealtimeEventHandler<T = any> = (payload: T, event: WorkspaceRealtimeEvent<T>) => void;

export interface UseWorkspaceRealtimeOptions {
  onEvent?: (event: WorkspaceRealtimeEvent) => void;
  onReconnect?: () => void;
  onRevoked?: () => void;
  [eventName: string]: RealtimeEventHandler | (() => void) | undefined;
}

/**
 * React hook that manages WebSocket real-time event subscriptions for a workspace.
 * Automatically connects, reconnects with exponential backoff on drop, cleans up on unmount,
 * and passes incoming events to the caller.
 */
export function useWorkspaceRealtime(
  workspaceId: string | null | undefined,
  options: UseWorkspaceRealtimeOptions | ((event: WorkspaceRealtimeEvent) => void)
) {
  const handlerRef = useRef<UseWorkspaceRealtimeOptions>({});

  if (typeof options === 'function') {
    handlerRef.current = { onEvent: options };
  } else {
    handlerRef.current = options || {};
  }

  useEffect(() => {
    if (!workspaceId) return;

    const client = new WorkspaceRealtimeClient(workspaceId);

    const unsubEvent = client.on((event) => {
      handlerRef.current.onEvent?.(event);
      if (event.event) {
        const namedHandler = handlerRef.current[event.event];
        if (typeof namedHandler === 'function') {
          (namedHandler as RealtimeEventHandler)(event.payload ?? event.data, event);
        }
      }
    });

    const unsubReconnect = client.onReconnect(() => {
      handlerRef.current.onReconnect?.();
    });

    const unsubRevoked = client.onRevoked(() => {
      handlerRef.current.onRevoked?.();
    });

    client.connect();

    return () => {
      unsubEvent();
      unsubReconnect();
      unsubRevoked();
      client.disconnect();
    };
  }, [workspaceId]);
}
