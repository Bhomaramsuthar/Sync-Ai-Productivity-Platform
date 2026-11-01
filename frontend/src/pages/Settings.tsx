import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { userService } from '../services/userService';
import { workspaceService, type Workspace } from '../services/workspaceService';
import { extractErrorMessage } from '../services/api';
import { toast } from '../utils/toast';
import {
  User,
  Sliders,
  Shield,
  Briefcase,
  Camera,
  Trash2,
  Save,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  LogOut,
  AlertTriangle,
  Mail,
  Bell,
  Sparkles,
  Calendar,
  CheckSquare,
  Sun,
  Moon,
  Monitor,
  Lock,
  ExternalLink,
  Plus,
  Loader2,
} from 'lucide-react';
import './Settings.css';
import { SubscriptionButton } from '../components/ui/SubscriptionButton';

type SettingsTab = 'profile' | 'preferences' | 'account' | 'workspaces';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const Settings: React.FC = () => {
  const { user, updateUser, refreshUser, logout } = useAuth();
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile State
  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Preferences State
  const [theme, setTheme] = useState('dark');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [taskUpdates, setTaskUpdates] = useState(true);
  const [meetingReminders, setMeetingReminders] = useState(true);
  const [aiSuggestions, setAiSuggestions] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);
  const [savingPreferences, setSavingPreferences] = useState(false);

  // Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Account / Copy State
  const [copiedId, setCopiedId] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteEmailConfirm, setDeleteEmailConfirm] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Workspaces State
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: 'Settings' }]);
  }, [setBreadcrumbs]);

  // Sync state with user profile
  useEffect(() => {
    if (user) {
      setDisplayName(user.name || '');
      if (user.preferences) {
        setTheme(user.preferences.theme || 'dark');
        setEmailNotifications(user.preferences.email_notifications ?? true);
        setTaskUpdates(user.preferences.task_updates ?? true);
        setMeetingReminders(user.preferences.meeting_reminders ?? true);
        setAiSuggestions(user.preferences.ai_suggestions ?? true);
        setWeeklyDigest(user.preferences.weekly_digest ?? false);
      }
    }
  }, [user]);

  // Fetch workspaces when workspaces tab is opened
  useEffect(() => {
    if (activeTab === 'workspaces') {
      setLoadingWorkspaces(true);
      workspaceService
        .list()
        .then((res) => setWorkspaces(res.data))
        .catch((err) => {
          toast.error('Failed to load workspaces', extractErrorMessage(err));
        })
        .finally(() => setLoadingWorkspaces(false));
    }
  }, [activeTab]);

  // ----------------------------------------------------------------------------
  // Profile Handlers
  // ----------------------------------------------------------------------------
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed) {
      toast.error('Validation Error', 'Display name cannot be empty.');
      return;
    }

    setSavingProfile(true);
    try {
      const res = await userService.updateProfile({ name: trimmed });
      updateUser({ name: res.data.name });
      toast.success('Profile Updated', 'Your display name was saved successfully.');
    } catch (err) {
      toast.error('Failed to Save Profile', extractErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error('Invalid File Type', 'Please choose a JPG, PNG, WebP, or GIF image file.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('File Too Large', 'Avatar size must be less than 2MB.');
      e.target.value = '';
      return;
    }

    setUploadingAvatar(true);
    try {
      const res = await userService.uploadAvatar(file);
      updateUser({ avatar_url: res.data.avatar_url });
      toast.success('Avatar Updated', 'Your profile picture has been updated.');
    } catch (err) {
      toast.error('Upload Failed', extractErrorMessage(err, 'Unable to upload avatar.'));
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user?.avatar_url) return;
    if (!window.confirm('Are you sure you want to remove your profile photo?')) return;

    setRemovingAvatar(true);
    try {
      await userService.removeAvatar();
      updateUser({ avatar_url: null });
      toast.info('Avatar Removed', 'Your avatar has been reset to monogram fallback.');
    } catch (err) {
      toast.error('Removal Failed', extractErrorMessage(err));
    } finally {
      setRemovingAvatar(false);
    }
  };

  // ----------------------------------------------------------------------------
  // Preferences Handlers
  // ----------------------------------------------------------------------------
  const handleSelectTheme = (newTheme: string) => {
    setTheme(newTheme);
    let resolved = newTheme;
    if (resolved === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    if (resolved === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  };

  const handleSavePreferences = async () => {
    setSavingPreferences(true);
    const newPrefs = {
      theme,
      email_notifications: emailNotifications,
      task_updates: taskUpdates,
      meeting_reminders: meetingReminders,
      ai_suggestions: aiSuggestions,
      weekly_digest: weeklyDigest,
    };

    try {
      const res = await userService.updateProfile({ preferences: newPrefs });
      updateUser({ preferences: res.data.preferences });
      toast.success('Preferences Saved', 'Your application preferences have been saved.');
    } catch (err) {
      toast.error('Failed to Save Preferences', extractErrorMessage(err));
    } finally {
      setSavingPreferences(false);
    }
  };

  // ----------------------------------------------------------------------------
  // Password Handlers
  // ----------------------------------------------------------------------------
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      toast.error('Current Password Required', 'Please enter your current account password.');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password Too Short', 'New password must contain at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords Do Not Match', 'New password and confirmation password must match.');
      return;
    }

    setSavingPassword(true);
    try {
      await userService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password Changed', 'Your password has been changed securely.');
    } catch (err) {
      toast.error('Password Update Failed', extractErrorMessage(err));
    } finally {
      setSavingPassword(false);
    }
  };

  // ----------------------------------------------------------------------------
  const isPreferencesDirty = React.useMemo(() => {
    if (!user?.preferences) return false;
    return (
      theme !== (user.preferences.theme || 'dark') ||
      emailNotifications !== (user.preferences.email_notifications ?? true) ||
      taskUpdates !== (user.preferences.task_updates ?? true) ||
      meetingReminders !== (user.preferences.meeting_reminders ?? true) ||
      aiSuggestions !== (user.preferences.ai_suggestions ?? true) ||
      weeklyDigest !== (user.preferences.weekly_digest ?? false)
    );
  }, [user?.preferences, theme, emailNotifications, taskUpdates, meetingReminders, aiSuggestions, weeklyDigest]);

  const handleCopyId = async () => {
    if (!user?.id) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(user.id);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = user.id;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopiedId(true);
      toast.success('Copied', 'User ID copied to clipboard.');
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.error('Copy Failed', 'Unable to copy user ID to clipboard.');
    }
  };

  const handleSignOut = () => {
    if (window.confirm('Are you sure you want to sign out of Sync AI?')) {
      logout();
      toast.info('Signed Out', 'You have been signed out successfully.');
      navigate('/login');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteEmailConfirm.trim().toLowerCase() !== user?.email.toLowerCase()) {
      toast.error('Email Mismatch', 'Please type your exact email address to confirm deletion.');
      return;
    }
    if (!deletePassword) {
      toast.error('Password Required', 'Please enter your password to authorize deletion.');
      return;
    }

    setDeletingAccount(true);
    try {
      await userService.deleteAccount({
        password: deletePassword,
        confirmation_email: deleteEmailConfirm.trim(),
      });
      setShowDeleteModal(false);
      logout();
      toast.info('Account Deleted', 'Your account has been deleted permanently.');
      navigate('/login');
    } catch (err) {
      toast.error('Account Deletion Failed', extractErrorMessage(err));
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div className="settings-container">
      {/* Page Header */}
      <div className="settings-header">
        <div className="settings-title-row">
          <div>
            <h1 className="settings-title">Settings & Preferences</h1>
            <p className="settings-subtitle">
              Manage your personal identity, application preferences, security, and workspaces.
            </p>
          </div>
          <button
            onClick={() => refreshUser().then(() => toast.info('Refreshed', 'Profile reloaded from server.'))}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.8rem' }}
            title="Reload profile state from server"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <nav className="settings-tabs-nav" role="tablist" aria-label="Settings sections">
        <button
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={`settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
          id="tab-profile"
        >
          <User size={16} />
          <span>Profile</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'preferences'}
          className={`settings-tab-btn ${activeTab === 'preferences' ? 'active' : ''}`}
          onClick={() => setActiveTab('preferences')}
          id="tab-preferences"
        >
          <Sliders size={16} />
          <span>Preferences</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'account'}
          className={`settings-tab-btn ${activeTab === 'account' ? 'active' : ''}`}
          onClick={() => setActiveTab('account')}
          id="tab-account"
        >
          <Shield size={16} />
          <span>Account & Security</span>
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'workspaces'}
          className={`settings-tab-btn ${activeTab === 'workspaces' ? 'active' : ''}`}
          onClick={() => setActiveTab('workspaces')}
          id="tab-workspaces"
        >
          <Briefcase size={16} />
          <span>Workspace Settings</span>
        </button>
      </nav>

      {/* -------------------------------------------------------------------------- */}
      {/* 1. PROFILE TAB                                                             */}
      {/* -------------------------------------------------------------------------- */}
      {activeTab === 'profile' && (
        <div>
          {/* Avatar & Photo Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Camera size={18} />
                  <span>Profile Photo</span>
                </h2>
                <p className="settings-card-desc">
                  Upload an avatar picture to represent you across workspaces, tasks, and meetings.
                </p>
              </div>
            </div>

            <div className="avatar-section-wrapper">
              <div className="avatar-preview-container">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="avatar-preview-img"
                  />
                ) : (
                  <div className="avatar-fallback">
                    {user?.name?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                {uploadingAvatar && (
                  <div className="avatar-loading-overlay">
                    <Loader2 size={24} className="animate-spin" />
                  </div>
                )}
              </div>

              <div className="avatar-actions-group">
                <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleAvatarSelect}
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    style={{ display: 'none' }}
                    id="avatar-file-input"
                  />
                  <button
                    type="button"
                    className="avatar-upload-label"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    id="upload-avatar-btn"
                  >
                    <Camera size={15} />
                    <span>{uploadingAvatar ? 'Uploading...' : 'Upload New Photo'}</span>
                  </button>

                  {user?.avatar_url && (
                    <button
                      type="button"
                      className="avatar-remove-btn"
                      onClick={handleRemoveAvatar}
                      disabled={removingAvatar}
                      id="remove-avatar-btn"
                    >
                      <Trash2 size={14} />
                      <span>{removingAvatar ? 'Removing...' : 'Remove Photo'}</span>
                    </button>
                  )}
                </div>
                <p className="avatar-hints">
                  Supported formats: JPEG, PNG, WebP, or GIF.<br />
                  Maximum file size: 2MB. Hosted securely on Supabase Storage.
                </p>
              </div>
            </div>

            {/* Display Name Form */}
            <form onSubmit={handleSaveProfile}>
              <div className="settings-form-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="settings-form-group">
                  <label htmlFor="input-display-name" className="settings-label">
                    <span>Display Name</span>
                    <span style={{ fontSize: '0.725rem', color: '#71717a' }}>
                      {displayName.length}/100
                    </span>
                  </label>
                  <div className="settings-input-wrapper">
                    <User size={15} className="settings-input-icon" />
                    <input
                      id="input-display-name"
                      type="text"
                      className="settings-input"
                      value={displayName}
                      maxLength={100}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your full name"
                      required
                    />
                  </div>
                  <span className="settings-helper-text">
                    This name will appear on task assignments, comments, and meeting transcripts.
                  </span>
                </div>

                <div className="settings-form-group">
                  <label htmlFor="input-email-readonly" className="settings-label">
                    <span>Email Address</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: '#6366f1',
                        background: 'rgba(99, 102, 241, 0.1)',
                        padding: '0.1rem 0.45rem',
                        borderRadius: 4,
                      }}
                    >
                      Verified Primary
                    </span>
                  </label>
                  <div className="settings-input-wrapper">
                    <Mail size={15} className="settings-input-icon" />
                    <input
                      id="input-email-readonly"
                      type="email"
                      className="settings-input readonly"
                      value={user?.email || ''}
                      readOnly
                      title="Email address is governed by authentication identity"
                    />
                    <Lock size={13} className="settings-input-action-btn" style={{ cursor: 'default' }} />
                  </div>
                  <span className="settings-helper-text">
                    Email address is tied to your account login credentials.
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingProfile || displayName.trim() === user?.name}
                  id="save-profile-btn"
                >
                  <Save size={15} />
                  <span>{savingProfile ? 'Saving Changes...' : 'Save Profile Changes'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* 2. PREFERENCES TAB                                                         */}
      {/* -------------------------------------------------------------------------- */}
      {activeTab === 'preferences' && (
        <div>
          {/* Theme Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Sun size={18} />
                  <span>Interface Theme</span>
                </h2>
                <p className="settings-card-desc">
                  Choose your visual appearance preference for Sync AI.
                </p>
              </div>
            </div>

            <div className="theme-selector-grid">
              <div
                className={`theme-card ${theme === 'dark' ? 'active' : ''}`}
                onClick={() => handleSelectTheme('dark')}
                id="theme-option-dark"
              >
                <div className="theme-card-icon-box">
                  <Moon size={20} />
                </div>
                <div>
                  <div className="theme-card-title">Dark Mode</div>
                  <div className="theme-card-desc">High-contrast obsidian palette optimized for focus and deep work.</div>
                </div>
              </div>

              <div
                className={`theme-card ${theme === 'light' ? 'active' : ''}`}
                onClick={() => handleSelectTheme('light')}
                id="theme-option-light"
              >
                <div className="theme-card-icon-box">
                  <Sun size={20} />
                </div>
                <div>
                  <div className="theme-card-title">Light Mode</div>
                  <div className="theme-card-desc">Clean, daytime appearance with bright contrast.</div>
                </div>
              </div>

              <div
                className={`theme-card ${theme === 'system' ? 'active' : ''}`}
                onClick={() => handleSelectTheme('system')}
                id="theme-option-system"
              >
                <div className="theme-card-icon-box">
                  <Monitor size={20} />
                </div>
                <div>
                  <div className="theme-card-title">System Sync</div>
                  <div className="theme-card-desc">Automatically switch between light and dark according to OS schedule.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Bell size={18} />
                  <span>Notification Preferences</span>
                </h2>
                <p className="settings-card-desc">
                  Control which activity channels trigger alerts and emails.
                </p>
              </div>
            </div>

            <div className="preferences-list">
              <div className="preference-item">
                <div className="preference-info">
                  <Mail size={18} className="preference-icon" />
                  <div>
                    <div className="preference-title">Email Notifications</div>
                    <div className="preference-desc">
                      Receive notifications for mentions, workspace invitations, and major project events.
                    </div>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    id="pref-email-notifications"
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="preference-item">
                <div className="preference-info">
                  <CheckSquare size={18} className="preference-icon" />
                  <div>
                    <div className="preference-title">Task Assignment & Status Updates</div>
                    <div className="preference-desc">
                      Get notified when tasks are assigned to you or when their progress status changes.
                    </div>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={taskUpdates}
                    onChange={(e) => setTaskUpdates(e.target.checked)}
                    id="pref-task-updates"
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="preference-item">
                <div className="preference-info">
                  <Calendar size={18} className="preference-icon" />
                  <div>
                    <div className="preference-title">Meeting & Calendar Reminders</div>
                    <div className="preference-desc">
                      Receive countdown reminders 10 minutes prior to scheduled video conferences.
                    </div>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={meetingReminders}
                    onChange={(e) => setMeetingReminders(e.target.checked)}
                    id="pref-meeting-reminders"
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="preference-item">
                <div className="preference-info">
                  <Sparkles size={18} className="preference-icon" />
                  <div>
                    <div className="preference-title">AI Productivity Suggestions</div>
                    <div className="preference-desc">
                      Allow Sync AI to automatically suggest action items, meeting summaries, and document insights.
                    </div>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={aiSuggestions}
                    onChange={(e) => setAiSuggestions(e.target.checked)}
                    id="pref-ai-suggestions"
                  />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="preference-item">
                <div className="preference-info">
                  <Sliders size={18} className="preference-icon" />
                  <div>
                    <div className="preference-title">Weekly Productivity Digest</div>
                    <div className="preference-desc">
                      Receive an executive summary email each Monday detailing completed tasks and upcoming deadlines.
                    </div>
                  </div>
                </div>
                <label className="switch-label">
                  <input
                    type="checkbox"
                    checked={weeklyDigest}
                    onChange={(e) => setWeeklyDigest(e.target.checked)}
                    id="pref-weekly-digest"
                  />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSavePreferences}
                disabled={savingPreferences || !isPreferencesDirty}
                id="save-preferences-btn"
              >
                <Save size={15} />
                <span>{savingPreferences ? 'Saving Preferences...' : 'Save Preferences'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* 3. ACCOUNT & SECURITY TAB                                                  */}
      {/* -------------------------------------------------------------------------- */}
      {activeTab === 'account' && (
        <div>
          {/* Account Overview Cards */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Shield size={18} />
                  <span>Account Identity</span>
                </h2>
                <p className="settings-card-desc">
                  Cryptographic identity details and authorization status.
                </p>
              </div>
            </div>

            <div className="account-info-grid">
              <div className="account-info-pill">
                <span className="account-info-pill-label">User Identifier (UUID)</span>
                <div className="account-info-pill-value">
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>
                    {user?.id ? `${user.id.slice(0, 8)}...${user.id.slice(-6)}` : 'N/A'}
                  </span>
                  <button
                    onClick={handleCopyId}
                    style={{ background: 'transparent', border: 'none', color: '#818cf8', cursor: 'pointer', padding: 2 }}
                    title="Copy full UUID"
                    id="copy-user-id-btn"
                  >
                    {copiedId ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              <div className="account-info-pill">
                <span className="account-info-pill-label">Platform Role</span>
                <div className="account-info-pill-value">
                  <span
                    style={{
                      background: user?.role === 'ADMIN' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: user?.role === 'ADMIN' ? '#c084fc' : '#a5b4fc',
                      padding: '0.15rem 0.55rem',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                    }}
                  >
                    {user?.role || 'USER'}
                  </span>
                </div>
              </div>

              <div className="account-info-pill">
                <span className="account-info-pill-label">Member Since</span>
                <div className="account-info-pill-value" style={{ fontSize: '0.825rem' }}>
                  {user?.created_at
                    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(user.created_at))
                    : 'Active Session'}
                </div>
              </div>

              <div className="account-info-pill">
                <span className="account-info-pill-label">Session State</span>
                <div className="account-info-pill-value" style={{ color: '#10b981', fontSize: '0.825rem' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                  Authenticated JWT
                </div>
              </div>
            </div>
          </div>

          {/* Subscription & Plans Preview Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Sparkles size={18} />
                  <span>Subscription &amp; Plans (Preview)</span>
                </h2>
                <p className="settings-card-desc">
                  Interactive tier preview for upcoming team and enterprise capabilities.
                </p>
              </div>
            </div>
            <SubscriptionButton />
          </div>

          {/* Password Change Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Key size={18} />
                  <span>Change Password</span>
                </h2>
                <p className="settings-card-desc">
                  Update your authentication credentials. New password must be at least 6 characters.
                </p>
              </div>
            </div>

            <form onSubmit={handleChangePassword}>
              <div className="settings-form-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="settings-form-group">
                  <label htmlFor="input-curr-pwd" className="settings-label">
                    <span>Current Password</span>
                  </label>
                  <div className="settings-input-wrapper">
                    <Lock size={15} className="settings-input-icon" />
                    <input
                      id="input-curr-pwd"
                      type={showCurrentPassword ? 'text' : 'password'}
                      className="settings-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      required
                    />
                    <button
                      type="button"
                      className="settings-input-action-btn"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      title={showCurrentPassword ? 'Hide password' : 'Show password'}
                    >
                      {showCurrentPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="settings-form-group">
                  <label htmlFor="input-new-pwd" className="settings-label">
                    <span>New Password</span>
                  </label>
                  <div className="settings-input-wrapper">
                    <Key size={15} className="settings-input-icon" />
                    <input
                      id="input-new-pwd"
                      type={showNewPassword ? 'text' : 'password'}
                      className="settings-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      required
                    />
                    <button
                      type="button"
                      className="settings-input-action-btn"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div className="settings-form-group">
                  <label htmlFor="input-confirm-pwd" className="settings-label">
                    <span>Confirm New Password</span>
                  </label>
                  <div className="settings-input-wrapper">
                    <Key size={15} className="settings-input-icon" />
                    <input
                      id="input-confirm-pwd"
                      type={showNewPassword ? 'text' : 'password'}
                      className="settings-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      minLength={6}
                      required
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPassword || !currentPassword || !newPassword}
                  id="change-password-btn"
                >
                  <Key size={15} />
                  <span>{savingPassword ? 'Updating Password...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Session & Sign Out Card */}
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <LogOut size={18} />
                  <span>Session Management</span>
                </h2>
                <p className="settings-card-desc">
                  Sign out of your active session on this device.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>Active Browser Session</div>
                <div style={{ fontSize: '0.75rem', color: '#71717a' }}>Logged in as {user?.email}</div>
              </div>
              <button
                type="button"
                className="settings-signout-btn"
                onClick={handleSignOut}
                id="settings-signout-btn"
                title="Sign out of Sync AI session"
              >
                <LogOut size={15} />
                <span>Sign Out of Sync AI</span>
              </button>
            </div>
          </div>

          {/* Danger Zone: Account Deletion */}
          <div className="settings-card danger-zone-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title danger-zone-header">
                  <AlertTriangle size={18} />
                  <span>Danger Zone: Account Deletion</span>
                </h2>
                <p className="settings-card-desc" style={{ color: '#fb7185' }}>
                  Permanently delete your user account. Workspace ownership restrictions apply.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#a1a1aa', maxWidth: '600px', lineHeight: 1.4 }}>
                Deleting your account will remove your personal profile and non-owned memberships. If you own workspaces,
                you must delete or transfer ownership of them first to ensure workspace members are not orphaned.
              </p>
              <button
                type="button"
                className="btn btn-danger"
                style={{ background: '#f43f5e', color: '#ffffff' }}
                onClick={() => setShowDeleteModal(true)}
                id="open-delete-account-modal-btn"
              >
                <Trash2 size={15} />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------------- */}
      {/* 4. WORKSPACE SETTINGS TAB                                                  */}
      {/* -------------------------------------------------------------------------- */}
      {activeTab === 'workspaces' && (
        <div>
          <div className="settings-card">
            <div className="settings-card-header">
              <div>
                <h2 className="settings-card-title">
                  <Briefcase size={18} />
                  <span>Workspace Role & Permissions</span>
                </h2>
                <p className="settings-card-desc">
                  Workspace settings are isolated by workspace and governed strictly by your assigned role.
                </p>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/workspaces/new')}
                id="create-workspace-shortcut-btn"
              >
                <Plus size={14} />
                <span>New Workspace</span>
              </button>
            </div>

            {loadingWorkspaces ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#71717a' }}>
                <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 0.5rem auto' }} />
                <span>Loading your workspaces...</span>
              </div>
            ) : workspaces.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#71717a' }}>
                <Briefcase size={36} style={{ margin: '0 auto 0.75rem auto', opacity: 0.5 }} />
                <div style={{ color: '#ffffff', fontWeight: 600, marginBottom: '0.25rem' }}>
                  No workspaces found
                </div>
                <p style={{ fontSize: '0.8rem' }}>
                  Create or join a workspace to start collaborating on projects and tasks.
                </p>
              </div>
            ) : (
              <div>
                {workspaces.map((ws) => {
                  const role = ws.current_user_role;
                  const canManage = role === 'OWNER' || role === 'ADMIN';

                  return (
                    <div key={ws.id} className="settings-workspace-card">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff' }}>
                            {ws.name}
                          </span>
                          <span className={`workspace-role-tag ${role.toLowerCase()}`}>
                            {role}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.775rem', color: '#71717a', lineHeight: 1.4 }}>
                          {ws.description || 'No description provided.'}
                        </div>
                        <div style={{ fontSize: '0.725rem', color: '#a1a1aa', marginTop: '0.35rem' }}>
                          {canManage ? (
                            <span style={{ color: '#10b981' }}>
                              ✓ Full settings & member administration permissions
                            </span>
                          ) : (
                            <span style={{ color: '#71717a' }}>
                              ⓘ Member role: Workspace settings and member administration are reserved for Owners and Admins.
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ flexShrink: 0 }}
                        onClick={() => navigate(`/workspaces/${ws.id}`)}
                        title={canManage ? 'Configure workspace settings and members' : 'View workspace'}
                      >
                        <ExternalLink size={14} />
                        <span>{canManage ? 'Manage Workspace' : 'View Workspace'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
          <div className="settings-modal-content">
            <h3 id="delete-account-title" style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fb7185', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <AlertTriangle size={20} />
              <span>Confirm Permanent Account Deletion</span>
            </h3>
            <p style={{ fontSize: '0.825rem', color: '#d4d4d8', marginBottom: '1.25rem', lineHeight: 1.4 }}>
              This action is <strong>irreversible</strong>. Please confirm your identity by re-typing your account email
              and entering your password.
            </p>

            <form onSubmit={handleDeleteAccount}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label htmlFor="confirm-email-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                    Type your email to confirm (<code style={{ color: '#ffffff' }}>{user?.email}</code>):
                  </label>
                  <input
                    id="confirm-email-input"
                    type="email"
                    className="settings-input"
                    value={deleteEmailConfirm}
                    onChange={(e) => setDeleteEmailConfirm(e.target.value)}
                    placeholder={user?.email || 'user@example.com'}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="confirm-password-input" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: '0.25rem' }}>
                    Account Password:
                  </label>
                  <input
                    id="confirm-password-input"
                    type="password"
                    className="settings-input"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  style={{ background: '#f43f5e', color: '#ffffff' }}
                  disabled={deletingAccount || deleteEmailConfirm.trim().toLowerCase() !== user?.email.toLowerCase() || !deletePassword}
                  id="confirm-delete-account-btn"
                >
                  {deletingAccount ? 'Deleting Account...' : 'Permanently Delete Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
