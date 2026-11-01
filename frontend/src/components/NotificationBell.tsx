import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ExternalLink, Clock, Sparkles } from 'lucide-react';
import { notificationService, type AppNotification } from '../services/workspaceService';

export const NotificationBell: React.FC = () => {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationService.list();
      setNotifications(res.data);
    } catch {
      // Silently ignore if offline or unauthenticated
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await notificationService.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch {
      // Ignore
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {
      // Ignore
    }
  };

  const handleNotificationClick = (notification: AppNotification) => {
    if (!notification.is_read) {
      notificationService.markRead(notification.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
      );
    }
    setIsOpen(false);

    if (notification.workspace_id) {
      navigate(`/workspaces/${notification.workspace_id}`);
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="btn btn-secondary btn-sm"
        style={{
          position: 'relative',
          padding: '0.45rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: isOpen ? 'var(--color-surface-hover)' : 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: unreadCount > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
          cursor: 'pointer',
        }}
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '0.65rem',
              fontWeight: 700,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            maxWidth: '90vw',
            background: 'var(--color-surface, #18181b)',
            border: '1px solid var(--color-border, #27272a)',
            borderRadius: 12,
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 1px rgba(255, 255, 255, 0.1)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              borderBottom: '1px solid var(--color-border, #27272a)',
              background: 'rgba(255, 255, 255, 0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sparkles size={14} style={{ color: 'var(--color-primary, #6366f1)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Notifications</span>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary, #818cf8)',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                <Bell size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'inline-block' }} />
                <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>No notifications yet</div>
                <div style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>You're all caught up!</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  style={{
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--color-border, #27272a)',
                    background: notification.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.06)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    display: 'flex',
                    gap: '0.65rem',
                    alignItems: 'flex-start',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(255, 255, 255, 0.04))')}
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = notification.is_read ? 'transparent' : 'rgba(99, 102, 241, 0.06)')
                  }
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: notification.is_read ? 'transparent' : 'var(--color-primary, #6366f1)',
                      marginTop: 6,
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: notification.is_read ? 500 : 600, color: '#fafafa' }}>
                        {notification.title}
                      </span>
                      {!notification.is_read && (
                        <button
                          onClick={(e) => handleMarkAsRead(notification.id, e)}
                          title="Mark as read"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                          }}
                        >
                          <Check size={12} />
                        </button>
                      )}
                    </div>
                    <p style={{ margin: '0.2rem 0 0.35rem 0', fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.35 }}>
                      {notification.message}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.68rem', color: '#71717a' }}>
                      <Clock size={10} />
                      <span>{new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {notification.workspace_id && (
                        <>
                          <span>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: 'var(--color-primary)' }}>
                            View <ExternalLink size={9} />
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
