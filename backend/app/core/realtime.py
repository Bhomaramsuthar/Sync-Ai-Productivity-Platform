import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Set, Tuple, Optional, Any
from fastapi import WebSocket, status

logger = logging.getLogger("ai_productivity_platform.realtime")


def _json_serial_fallback(obj: Any) -> Any:
    """Fallback JSON serializer for datetime, enum, or UUID types."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if hasattr(obj, "value"):
        return obj.value
    if hasattr(obj, "__dict__"):
        return {k: v for k, v in obj.__dict__.items() if not k.startswith("_")}
    return str(obj)


class WorkspaceConnectionManager:
    """Manages authenticated WebSocket connections scoped by workspace.
    
    Enforces that:
    - Connections are scoped strictly per workspace_id.
    - Events for workspace A are NEVER sent to workspace B clients.
    - Membership revocations immediately disconnect target user sockets.
    - Thread-safe and compatible with both async and sync FastAPI route handlers.
    """

    def __init__(self):
        # workspace_id -> set of active WebSockets
        self._active_connections: Dict[str, Set[WebSocket]] = {}
        # (workspace_id, user_id) -> set of WebSockets for targeted disconnects
        self._user_connections: Dict[Tuple[str, str], Set[WebSocket]] = {}
        self._lock: Optional[asyncio.Lock] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def _get_lock(self) -> asyncio.Lock:
        if self._lock is None:
            self._lock = asyncio.Lock()
        return self._lock

    async def connect(self, websocket: WebSocket, workspace_id: str, user_id: str):
        """Accepts and registers an authenticated WebSocket for a workspace."""
        self._loop = asyncio.get_running_loop()
        await websocket.accept()
        lock = self._get_lock()
        async with lock:
            if workspace_id not in self._active_connections:
                self._active_connections[workspace_id] = set()
            self._active_connections[workspace_id].add(websocket)

            user_key = (workspace_id, user_id)
            if user_key not in self._user_connections:
                self._user_connections[user_key] = set()
            self._user_connections[user_key].add(websocket)

        logger.info(
            "WebSocket connected: user %s joined workspace %s stream (active in workspace: %d)",
            user_id,
            workspace_id,
            len(self._active_connections.get(workspace_id, set())),
        )

    async def disconnect(self, websocket: WebSocket, workspace_id: str, user_id: str):
        """Unregisters a WebSocket on close."""
        lock = self._get_lock()
        async with lock:
            if workspace_id in self._active_connections:
                self._active_connections[workspace_id].discard(websocket)
                if not self._active_connections[workspace_id]:
                    del self._active_connections[workspace_id]

            user_key = (workspace_id, user_id)
            if user_key in self._user_connections:
                self._user_connections[user_key].discard(websocket)
                if not self._user_connections[user_key]:
                    del self._user_connections[user_key]

        logger.info(
            "WebSocket disconnected: user %s left workspace %s stream",
            user_id,
            workspace_id,
        )

    async def disconnect_user_from_workspace(self, workspace_id: str, user_id: str):
        """Forcibly disconnects all active sockets for a specific user in a workspace.
        Called immediately when a user is removed from a workspace.
        """
        user_key = (workspace_id, user_id)
        sockets_to_close: Set[WebSocket] = set()

        lock = self._get_lock()
        async with lock:
            if user_key in self._user_connections:
                sockets_to_close = set(self._user_connections[user_key])
                del self._user_connections[user_key]

            if workspace_id in self._active_connections:
                for ws in sockets_to_close:
                    self._active_connections[workspace_id].discard(ws)
                if not self._active_connections[workspace_id]:
                    del self._active_connections[workspace_id]

        for ws in sockets_to_close:
            try:
                await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Workspace membership revoked")
            except Exception:
                pass

        if sockets_to_close:
            logger.info(
                "Revoked and closed %d sockets for user %s in workspace %s",
                len(sockets_to_close),
                user_id,
                workspace_id,
            )

    async def disconnect_all_in_workspace(self, workspace_id: str):
        """Forcibly disconnects all active sockets in a workspace (e.g. workspace deleted)."""
        sockets_to_close: Set[WebSocket] = set()

        lock = self._get_lock()
        async with lock:
            if workspace_id in self._active_connections:
                sockets_to_close = set(self._active_connections[workspace_id])
                del self._active_connections[workspace_id]

            # clean up user sockets matching workspace_id
            keys_to_delete = [k for k in self._user_connections if k[0] == workspace_id]
            for k in keys_to_delete:
                del self._user_connections[k]

        for ws in sockets_to_close:
            try:
                await ws.close(code=status.WS_1001_GOING_AWAY, reason="Workspace deleted")
            except Exception:
                pass

    def disconnect_user_sync(self, workspace_id: str, user_id: str):
        """Synchronously dispatches user disconnection to the server event loop."""
        try:
            loop = self._loop if (self._loop and self._loop.is_running()) else None
            if not loop:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.disconnect_user_from_workspace(str(workspace_id), str(user_id)),
                    loop,
                )
            elif loop and not loop.is_closed():
                loop.run_until_complete(
                    self.disconnect_user_from_workspace(str(workspace_id), str(user_id))
                )
        except Exception as exc:
            logger.warning("Failed to disconnect user %s from workspace %s: %s", user_id, workspace_id, exc)

    def disconnect_all_sync(self, workspace_id: str):
        """Synchronously dispatches workspace-wide disconnection to the server event loop."""
        try:
            loop = self._loop if (self._loop and self._loop.is_running()) else None
            if not loop:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.disconnect_all_in_workspace(str(workspace_id)),
                    loop,
                )
            elif loop and not loop.is_closed():
                loop.run_until_complete(
                    self.disconnect_all_in_workspace(str(workspace_id))
                )
        except Exception as exc:
            logger.warning("Failed to disconnect all from workspace %s: %s", workspace_id, exc)

    async def broadcast(
        self,
        workspace_id: str,
        event_type: str,
        data: Any,
        exclude_user_id: Optional[str] = None,
    ):
        """Asynchronously broadcasts an event payload to authorized clients in the workspace."""
        connections = self._active_connections.get(workspace_id)
        if not connections:
            return

        payload = {
            "type": "event",
            "event": event_type,
            "workspace_id": workspace_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        text_message = json.dumps(payload, default=_json_serial_fallback)

        dead_sockets = set()
        for ws in list(connections):
            try:
                await ws.send_text(text_message)
            except Exception as exc:
                logger.debug("Failed sending message to websocket in workspace %s: %s", workspace_id, exc)
                dead_sockets.add(ws)

        if dead_sockets:
            lock = self._get_lock()
            async with lock:
                if workspace_id in self._active_connections:
                    self._active_connections[workspace_id].difference_update(dead_sockets)

    def broadcast_sync(
        self,
        workspace_id: str,
        event_type: str,
        data: Any,
        exclude_user_id: Optional[str] = None,
    ):
        """Synchronously dispatches a broadcast task onto the active event loop.
        Safe to call from sync routes/services without blocking.
        """
        connections = self._active_connections.get(workspace_id)
        if not connections:
            return

        try:
            loop = self._loop if (self._loop and self._loop.is_running()) else None
            if not loop:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.broadcast(workspace_id, event_type, data, exclude_user_id),
                    loop,
                )
            elif loop and not loop.is_closed():
                loop.run_until_complete(
                    self.broadcast(workspace_id, event_type, data, exclude_user_id)
                )
        except Exception as exc:
            logger.warning(
                "Unable to broadcast real-time event %s to workspace %s: %s",
                event_type,
                workspace_id,
                str(exc),
            )

    async def send_to_user(
        self,
        workspace_id: str,
        user_id: str,
        event_type: str,
        data: Any,
    ):
        """Asynchronously dispatches an event only to a specific user's active sockets."""
        user_key = (workspace_id, user_id)
        connections = self._user_connections.get(user_key)
        if not connections:
            return

        payload = {
            "type": "event",
            "event": event_type,
            "workspace_id": workspace_id,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        text_message = json.dumps(payload, default=_json_serial_fallback)

        dead_sockets = set()
        for ws in list(connections):
            try:
                await ws.send_text(text_message)
            except Exception as exc:
                logger.debug("Failed sending targeted message to websocket: %s", exc)
                dead_sockets.add(ws)

        if dead_sockets:
            lock = self._get_lock()
            async with lock:
                if user_key in self._user_connections:
                    self._user_connections[user_key].difference_update(dead_sockets)
                if workspace_id in self._active_connections:
                    self._active_connections[workspace_id].difference_update(dead_sockets)

    def send_to_user_sync(
        self,
        workspace_id: str,
        user_id: str,
        event_type: str,
        data: Any,
    ):
        """Synchronously dispatches a targeted message to a specific user."""
        try:
            loop = self._loop if (self._loop and self._loop.is_running()) else None
            if not loop:
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass

            if loop and loop.is_running():
                asyncio.run_coroutine_threadsafe(
                    self.send_to_user(str(workspace_id), str(user_id), event_type, data),
                    loop,
                )
            elif loop and not loop.is_closed():
                loop.run_until_complete(
                    self.send_to_user(str(workspace_id), str(user_id), event_type, data)
                )
        except Exception as exc:
            logger.warning("Failed to send targeted event to user %s in workspace %s: %s", user_id, workspace_id, exc)

    def send_to_users_sync(
        self,
        workspace_id: str,
        user_ids: list[str],
        event_type: str,
        data: Any,
    ):
        """Synchronously dispatches a targeted message to multiple specific users (e.g. workspace admins)."""
        for uid in user_ids:
            self.send_to_user_sync(workspace_id, uid, event_type, data)

    def count_connections(self, workspace_id: str) -> int:
        """Returns the number of active WebSockets in a workspace."""
        return len(self._active_connections.get(workspace_id, set()))


workspace_realtime_manager = WorkspaceConnectionManager()

