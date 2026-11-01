import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, Link } from 'react-router-dom';
import {
  Sparkles,
  X,
  Send,
  Plus,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  Globe,
  Briefcase,
  FolderGit2,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import {
  assistantService,
  type AssistantScope,
  type AssistantMessage,
  type AssistantConversationSummary,
  type PageContext,
} from '../services/assistantService';
import { ThinkingLoader, APP_ORB_STATES } from './ThinkingLoader';
import { extractErrorMessage } from '../services/api';
import { AnimatedAssistantIcon } from './assistant/AnimatedAssistantIcon';
import {
  type AssistantOperationalState,
  OPERATIONAL_STATE_CSS_MAP,
  AI_ICON_SEQUENCE_LABELS,
} from './assistant/assistantIconConfig';
import './GlobalAIAssistant.css';

// Suggested prompts by scope
const SUGGESTED_PROMPTS: Record<AssistantScope, string[]> = {
  GLOBAL: [
    'What tasks are assigned to me across all workspaces?',
    'Summarize my upcoming calendar events and meetings',
    'What workspaces and projects do I belong to?',
  ],
  WORKSPACE: [
    'What projects and tasks are active in this workspace?',
    'Who are the members and admins of this workspace?',
    'Summarize recent meetings and action items',
  ],
  PROJECT: [
    'What tasks are currently in progress or overdue?',
    'Find documents and notes relevant to this project',
    'What are the key goals and recent activity here?',
  ],
};

// Markdown & Inline formatting helper
const formatAssistantText = (text: string): React.ReactNode => {
  // Strip robotic boilerplate if present at the end
  const cleanText = text
    .replace(/All information is taken directly from the provided workspace evidence\.?/gi, '')
    .trim();

  const lines = cleanText.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let blockKey = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Fenced Code Block: ```lang ... ```
    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={blockKey++} className="assistant-code-block">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 2. Markdown Table Detection: lines starting and ending with `|`
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const parseRow = (r: string) =>
          r
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());

        const headerCells = parseRow(tableLines[0]);
        const isSeparatorRow = (r: string) => /^[:\-\s|]+$/.test(r);
        const dataRows = tableLines.slice(1).filter((r) => !isSeparatorRow(r));

        elements.push(
          <div key={blockKey++} className="assistant-table-wrapper">
            <table className="assistant-table">
              <thead>
                <tr>
                  {headerCells.map((h, hIdx) => (
                    <th key={hIdx}>{renderInlineTokens(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.map((rStr, rIdx) => {
                  const cells = parseRow(rStr);
                  return (
                    <tr key={rIdx}>
                      {cells.map((c, cIdx) => (
                        <td key={cIdx}>{renderInlineTokens(c)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 3. Bullet list items: * or -
    if (/^\s*[*-]\s+/.test(line)) {
      const bulletItems: { indent: string; content: string }[] = [];
      while (i < lines.length && /^\s*[*-]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)[*-]\s+(.+)$/);
        if (m) {
          bulletItems.push({ indent: m[1], content: m[2] });
        }
        i++;
      }
      elements.push(
        <ul key={blockKey++} className="assistant-bullet-list">
          {bulletItems.map((item, bIdx) => (
            <li key={bIdx} style={{ marginLeft: item.indent.length > 0 ? '1rem' : '0' }}>
              {renderInlineTokens(item.content)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 4. Numbered list items: 1. 2. etc.
    if (/^\s*\d+\.\s+/.test(line)) {
      const numItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const m = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (m) {
          numItems.push(m[1]);
        }
        i++;
      }
      elements.push(
        <ol key={blockKey++} className="assistant-num-list">
          {numItems.map((item, nIdx) => (
            <li key={nIdx}>{renderInlineTokens(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 5. Headings
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={blockKey++} style={{ margin: '14px 0 6px', fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
          {renderInlineTokens(line.replace('### ', ''))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h3 key={blockKey++} style={{ margin: '16px 0 8px', fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
          {renderInlineTokens(line.replace('## ', ''))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(
        <h2 key={blockKey++} style={{ margin: '18px 0 10px', fontSize: '1.15rem', fontWeight: 800, color: '#f8fafc' }}>
          {renderInlineTokens(line.replace('# ', ''))}
        </h2>
      );
      i++;
      continue;
    }

    // 6. Blockquote
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote
          key={blockKey++}
          style={{
            margin: '8px 0',
            padding: '6px 12px',
            borderLeft: '3px solid var(--accent-primary)',
            background: 'rgba(99, 102, 241, 0.08)',
            borderRadius: '0 6px 6px 0',
            color: '#cbd5e1',
            fontSize: '0.825rem',
          }}
        >
          {renderInlineTokens(line.replace('> ', ''))}
        </blockquote>
      );
      i++;
      continue;
    }

    // 7. Empty lines
    if (!line.trim()) {
      elements.push(<div key={blockKey++} style={{ height: 6 }} />);
      i++;
      continue;
    }

    // 8. Normal paragraph
    elements.push(<p key={blockKey++}>{renderInlineTokens(line)}</p>);
    i++;
  }

  return elements;
};

const renderInlineTokens = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[(?:Source\s*(\d+))\]|【(?:Source\s*(\d+))】|\*([^*]+)\*)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;
  let key = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <strong key={key++} style={{ fontWeight: 600, color: '#f1f5f9' }}>
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // `code` or status badge
      const codeVal = match[3];
      const isStatus = ['ACTIVE', 'TODO', 'IN_PROGRESS', 'DONE', 'HIGH', 'URGENT', 'LOW', 'MEDIUM'].includes(codeVal);
      parts.push(
        <code
          key={key++}
          style={
            isStatus
              ? {
                  backgroundColor:
                    codeVal === 'ACTIVE' || codeVal === 'DONE'
                      ? 'rgba(16, 185, 129, 0.18)'
                      : codeVal === 'URGENT' || codeVal === 'HIGH'
                      ? 'rgba(244, 63, 94, 0.18)'
                      : 'rgba(99, 102, 241, 0.18)',
                  color:
                    codeVal === 'ACTIVE' || codeVal === 'DONE'
                      ? '#6ee7b7'
                      : codeVal === 'URGENT' || codeVal === 'HIGH'
                      ? '#fca5a5'
                      : '#c7d2fe',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontWeight: 600,
                  fontSize: '0.725rem',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }
              : undefined
          }
        >
          {codeVal}
        </code>
      );
    } else if (match[4] || match[5]) {
      // [Source X]
      const num = match[4] || match[5];
      parts.push(
        <span
          key={key++}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'rgba(99, 102, 241, 0.2)',
            color: '#c7d2fe',
            padding: '1px 6px',
            borderRadius: '4px',
            fontSize: '0.725rem',
            fontWeight: 600,
            margin: '0 2px',
          }}
        >
          Source {num}
        </span>
      );
    } else if (match[6]) {
      // *italic*
      parts.push(<em key={key++}>{match[6]}</em>);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
};

export const GlobalAIAssistant: React.FC = () => {
  const location = useLocation();

  // Panel state
  const [isOpen, setIsOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [scopeDropdownOpen, setScopeDropdownOpen] = useState(false);
  const [isLauncherHovered, setIsLauncherHovered] = useState(false);

  // Operational state for assistant icon animation (Phase 8)
  const [operationalState, setOperationalState] = useState<AssistantOperationalState>('idle');
  const [iconSequenceIdx, setIconSequenceIdx] = useState(0);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cycle icon sequence label during thinking
  useEffect(() => {
    if (operationalState !== 'thinking') return;
    const interval = setInterval(() => {
      setIconSequenceIdx((prev) => (prev + 1) % AI_ICON_SEQUENCE_LABELS.length);
    }, 800);
    return () => clearInterval(interval);
  }, [operationalState]);

  // Clean up success and typing timers
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputQuestion(val);
    if (!isLoading) {
      if (val.trim()) {
        setOperationalState('typing');
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          setOperationalState('idle');
        }, 1200);
      } else {
        setOperationalState('idle');
      }
    }
  };

  // Scope state
  const [scope, setScope] = useState<AssistantScope>('GLOBAL');
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);

  // Conversations state
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [suggestedFollowups, setSuggestedFollowups] = useState<string[]>([]);

  // Input & Status
  const [inputQuestion, setInputQuestion] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});

  // Auto-scroll ref & textarea ref
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Detect route context
  useEffect(() => {
    const parts = location.pathname.split('/').filter(Boolean);
    let detectedWorkspaceId: string | null = null;
    let detectedProjectId: string | null = null;

    if (parts[0] === 'projects' && parts[1]) {
      detectedProjectId = parts[1];
      setProjectId(detectedProjectId);
      // Auto-select project scope if no conversation active
      if (!activeConversationId) {
        setScope('PROJECT');
      }
    } else if (parts[0] === 'workspaces' && parts[1] && parts[1] !== 'new') {
      detectedWorkspaceId = parts[1];
      setWorkspaceId(detectedWorkspaceId);
      if (!activeConversationId) {
        setScope('WORKSPACE');
      }
    } else {
      if (!activeConversationId) {
        setScope('GLOBAL');
      }
    }
  }, [location.pathname, activeConversationId]);

  // Load user's conversations when opening panel
  const fetchConversations = useCallback(async () => {
    try {
      const res = await assistantService.listConversations();
      setConversations(res.data);
    } catch (err) {
      console.error('Failed to load assistant conversations:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  // Global keyboard shortcut: Ctrl+J or Cmd+J
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Handle scope selection
  const handleSelectScope = (newScope: AssistantScope) => {
    setScope(newScope);
    setScopeDropdownOpen(false);
  };

  // Start a fresh conversation
  const handleStartNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setSuggestedFollowups([]);
    setErrorMessage(null);
    setShowHistory(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Switch to a conversation from history
  const handleSelectConversation = async (convId: string) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await assistantService.getConversation(convId);
      setActiveConversationId(res.data.id);
      setScope(res.data.scope);
      setWorkspaceId(res.data.workspace_id || null);
      setProjectId(res.data.project_id || null);
      setMessages(res.data.messages);
      setSuggestedFollowups([]);
      setShowHistory(false);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, 'Failed to load conversation'));
    } finally {
      setIsLoading(false);
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    try {
      await assistantService.deleteConversation(convId);
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        handleStartNewChat();
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // Build page context
  const getPageContext = (): PageContext => {
    return {
      pathname: location.pathname,
      workspace_id: workspaceId,
      project_id: projectId,
    };
  };

  // Send message
  const handleSendMessage = async (textToSend?: string) => {
    const question = (textToSend || inputQuestion).trim();
    if (!question || isLoading) return;

    setInputQuestion('');
    setErrorMessage(null);

    // Optimistic user message
    const tempUserMessage: AssistantMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConversationId || 'pending',
      sender_role: 'USER',
      content: question,
      citations: [],
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempUserMessage]);
    setIsLoading(true);
    setOperationalState('thinking');

    try {
      let currentConvId = activeConversationId;

      // Create conversation if not yet created
      if (!currentConvId) {
        const createRes = await assistantService.createConversation({
          scope,
          workspace_id: scope !== 'GLOBAL' ? workspaceId : null,
          project_id: scope === 'PROJECT' ? projectId : null,
          title: question.slice(0, 45),
          page_context: getPageContext(),
        });
        currentConvId = createRes.data.id;
        setActiveConversationId(currentConvId);
        fetchConversations();
      }

      // Send question
      const response = await assistantService.sendMessage(
        currentConvId,
        question,
        getPageContext()
      );

      // Replace optimistic message and append assistant message
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempUserMessage.id),
        response.data.user_message,
        response.data.assistant_message,
      ]);

      if (response.data.suggested_followups) {
        setSuggestedFollowups(response.data.suggested_followups);
      }

      // Expand citations by default for the latest assistant message
      if (response.data.citations?.length > 0) {
        setExpandedCitations((prev) => ({
          ...prev,
          [response.data.assistant_message.id]: true,
        }));
      }

      fetchConversations();

      // Transition to success state briefly
      setOperationalState('success');
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setOperationalState(isOpen ? 'idle' : 'closed');
      }, 1200);
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to get answer from Sync AI Assistant.');
      setErrorMessage(msg);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
      setOperationalState('error');
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setOperationalState(isOpen ? 'idle' : 'closed');
      }, 2000);
    } finally {
      setIsLoading(false);
      // Only reset if still in thinking (success/error already handle their own transitions)
      if (operationalState === 'thinking') {
        setOperationalState(isOpen ? 'idle' : 'closed');
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Scope label & icon helper
  const scopeDetails = useMemo(() => {
    switch (scope) {
      case 'WORKSPACE':
        return {
          label: 'Workspace',
          icon: <Briefcase size={14} />,
          contextDesc: workspaceId ? `Workspace (${workspaceId.slice(0, 8)}...)` : 'Active Workspace',
        };
      case 'PROJECT':
        return {
          label: 'Project',
          icon: <FolderGit2 size={14} />,
          contextDesc: projectId ? `Project (${projectId.slice(0, 8)}...)` : 'Active Project',
        };
      case 'GLOBAL':
      default:
        return {
          label: 'All Accessible Data',
          icon: <Globe size={14} />,
          contextDesc: 'All accessible workspaces & records',
        };
    }
  }, [scope, workspaceId, projectId]);

  return (
    <>
      {/* Floating Action Button */}
      <button
        id="global-ai-assistant-btn"
        className={`global-ai-launcher ${isLauncherHovered ? 'hovered' : ''} ${OPERATIONAL_STATE_CSS_MAP[operationalState] || ''}`}
        onClick={() => {
          setIsOpen((prev) => {
            const next = !prev;
            setOperationalState(next ? 'opening' : 'closed');
            // Clear opening state after transition
            if (next) {
              setTimeout(() => setOperationalState('idle'), 400);
            }
            return next;
          });
        }}
        onMouseEnter={() => setIsLauncherHovered(true)}
        onMouseLeave={() => setIsLauncherHovered(false)}
        onFocus={() => setIsLauncherHovered(true)}
        onBlur={() => setIsLauncherHovered(false)}
        aria-label={isOpen ? 'Close AI assistant' : `Open AI assistant${operationalState === 'thinking' ? ` — ${AI_ICON_SEQUENCE_LABELS[iconSequenceIdx]}` : ''}`}
        aria-expanded={isOpen}
        title={isOpen ? 'Close AI assistant (Ctrl+J)' : `Open AI assistant (Ctrl+J)${operationalState === 'thinking' ? ` — ${AI_ICON_SEQUENCE_LABELS[iconSequenceIdx]}` : ''}`}
      >
        <AnimatedAssistantIcon isHovered={isLauncherHovered} size={46} operationalState={operationalState} />
      </button>

      {/* Backdrop for mobile */}
      <div
        className={`global-ai-backdrop ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Slide-over Drawer Panel */}
      <aside
        id="global-ai-assistant-drawer"
        className={`global-ai-panel ${isOpen ? 'open' : ''}`}
        aria-label="Sync AI Assistant"
      >
        {/* Header */}
        <div className="global-ai-header">
          <div className="global-ai-header-top">
            <div className="global-ai-brand">
              <div className="global-ai-badge-icon">
                <Sparkles size={16} />
              </div>
              <h2 className="global-ai-title">Sync AI Assistant</h2>
            </div>

            <div className="global-ai-actions">
              <button
                className={`icon-btn-ghost ${showHistory ? 'active' : ''}`}
                onClick={() => setShowHistory((prev) => !prev)}
                title="Conversation History"
                aria-label="Toggle Conversation History"
              >
                <History size={16} />
              </button>

              <button
                className="icon-btn-ghost"
                onClick={handleStartNewChat}
                title="New Chat"
                aria-label="Start New Chat"
              >
                <Plus size={16} />
              </button>

              <button
                className="icon-btn-ghost"
                onClick={() => setIsOpen(false)}
                title="Close Assistant"
                aria-label="Close Assistant"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Scope Selector Bar */}
          <div className="global-ai-scope-bar">
            <div className="scope-selector-container">
              <button
                className="scope-pill-btn"
                onClick={() => setScopeDropdownOpen((prev) => !prev)}
                title="Change assistant scope"
                aria-expanded={scopeDropdownOpen}
              >
                {scopeDetails.icon}
                <span>{scopeDetails.label}</span>
                <ChevronDown size={12} />
              </button>

              {scopeDropdownOpen && (
                <div className="scope-dropdown-menu">
                  <button
                    className={`scope-menu-item ${scope === 'GLOBAL' ? 'selected' : ''}`}
                    onClick={() => handleSelectScope('GLOBAL')}
                  >
                    <Globe size={15} style={{ marginTop: 2 }} />
                    <div>
                      <div className="scope-item-title">My Accessible Data</div>
                      <div className="scope-item-desc">
                        Search across all your accessible workspaces, projects, assigned tasks, and meetings.
                      </div>
                    </div>
                  </button>

                  <button
                    className={`scope-menu-item ${scope === 'WORKSPACE' ? 'selected' : ''}`}
                    onClick={() => handleSelectScope('WORKSPACE')}
                  >
                    <Briefcase size={15} style={{ marginTop: 2 }} />
                    <div>
                      <div className="scope-item-title">Current Workspace</div>
                      <div className="scope-item-desc">
                        Focus on the active workspace: projects, members, meetings, and activity.
                      </div>
                    </div>
                  </button>

                  <button
                    className={`scope-menu-item ${scope === 'PROJECT' ? 'selected' : ''}`}
                    onClick={() => handleSelectScope('PROJECT')}
                  >
                    <FolderGit2 size={15} style={{ marginTop: 2 }} />
                    <div>
                      <div className="scope-item-title">Current Project</div>
                      <div className="scope-item-desc">
                        Focus on this project: tasks, document chunks, and discussions.
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="scope-context-label" title={scopeDetails.contextDesc}>
              {scopeDetails.contextDesc}
            </div>
          </div>
        </div>

        {/* History Overlay */}
        {showHistory && (
          <div className="history-overlay">
            <div className="history-overlay-header">
              <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Your Conversations
              </h3>
              <button className="icon-btn-ghost" onClick={() => setShowHistory(false)}>
                <X size={15} />
              </button>
            </div>

            {conversations.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 10px', color: '#64748b', fontSize: '0.8rem' }}>
                No prior conversations yet.
              </div>
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  className={`history-item ${c.id === activeConversationId ? 'active' : ''}`}
                  onClick={() => handleSelectConversation(c.id)}
                >
                  <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                    <div className="history-item-title">{c.title || 'Untitled conversation'}</div>
                    <div className="history-item-meta">
                      {c.scope} • {c.message_count} messages • {new Date(c.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="icon-btn-ghost"
                    onClick={(e) => handleDeleteConversation(e, c.id)}
                    title="Delete Conversation"
                  >
                    <Trash2 size={13} style={{ color: '#ef4444' }} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* Messages Body */}
        <div className="global-ai-messages">
          {messages.length === 0 ? (
            <div className="global-ai-welcome">
              <div className="welcome-icon-large">
                <Sparkles size={24} />
              </div>
              <h3 className="welcome-title">How can I help you today?</h3>
              <p className="welcome-subtitle">
                Ask anything about your tasks, projects, documents, workspace activity, or meetings.
              </p>

              <div className="welcome-prompts-title">Suggested Prompts</div>
              <div className="welcome-prompts-grid">
                {SUGGESTED_PROMPTS[scope].map((prompt, idx) => (
                  <button
                    key={idx}
                    className="prompt-suggestion-btn"
                    onClick={() => handleSendMessage(prompt)}
                  >
                    <Sparkles size={13} style={{ color: '#a5b4fc', flexShrink: 0 }} />
                    <span>{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isAssistant = msg.sender_role === 'ASSISTANT';
              const isCitationsOpen = expandedCitations[msg.id] ?? false;

              return (
                <div key={msg.id} className={`chat-row ${isAssistant ? 'assistant' : 'user'}`}>
                  {isAssistant ? (
                    <div className="assistant-bubble-container">
                      <div className="assistant-message-body">{formatAssistantText(msg.content)}</div>

                      {/* Source Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="citations-wrapper">
                          <button
                            className="citations-toggle-btn"
                            onClick={() =>
                              setExpandedCitations((prev) => ({
                                ...prev,
                                [msg.id]: !isCitationsOpen,
                              }))
                            }
                          >
                            <span>
                              {isCitationsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </span>
                            <span>
                              {msg.citations.length} Verified Source
                              {msg.citations.length > 1 ? 's' : ''}
                            </span>
                          </button>

                          {isCitationsOpen && (
                            <div className="citations-list">
                              {msg.citations.map((cite, cIdx) => (
                                <div key={cIdx} className="citation-card">
                                  <div className="citation-header">
                                    <span className="citation-type-badge">{cite.source_type}</span>
                                    <span className="citation-title" title={cite.title}>
                                      {cite.title}
                                    </span>
                                    {cite.route && (
                                      <Link
                                        to={cite.route}
                                        style={{ color: '#a5b4fc', display: 'flex', alignItems: 'center' }}
                                        title="Navigate to source"
                                        onClick={() => setIsOpen(false)}
                                      >
                                        <ExternalLink size={12} />
                                      </Link>
                                    )}
                                  </div>
                                  {cite.excerpt && (
                                    <div className="citation-excerpt">{cite.excerpt}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="user-bubble">{msg.content}</div>
                  )}
                </div>
              );
            })
          )}

          {/* Thinking State */}
          {isLoading && (
            <div className="chat-row assistant">
              <div className="thinking-box">
                <ThinkingLoader
                  state={APP_ORB_STATES.reasoning}
                  size={20}
                  inline
                  message="Searching workspace records & synthesizing answer..."
                />
              </div>
            </div>
          )}

          {/* Suggested Followups */}
          {!isLoading && suggestedFollowups.length > 0 && (
            <div className="followups-wrapper">
              {suggestedFollowups.map((followup, idx) => (
                <button
                  key={idx}
                  className="followup-pill"
                  onClick={() => handleSendMessage(followup)}
                >
                  {followup}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Footer & Input */}
        <div className="global-ai-footer">
          {errorMessage && (
            <div className="ai-error-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} />
                <span>{errorMessage}</span>
              </div>
              <button
                className="ai-retry-btn"
                onClick={() => handleSendMessage(messages[messages.length - 1]?.content || '')}
              >
                Retry
              </button>
            </div>
          )}

          <div className="input-box-wrapper">
            <textarea
              ref={textareaRef}
              className="global-ai-textarea"
              placeholder={`Ask Sync AI in ${scopeDetails.label.toLowerCase()} scope...`}
              value={inputQuestion}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isLoading}
            />

            <div className="input-actions-bar">
              <span className="input-hint">↵ to send, Shift+↵ for new line</span>
              <button
                className="send-btn"
                onClick={() => handleSendMessage()}
                disabled={!inputQuestion.trim() || isLoading}
                title="Send Question"
                aria-label="Send Question"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
