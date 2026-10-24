import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare,
  Plus,
  Send,
  Trash2,
  Edit2,
  Check,
  X,
  FileText,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Bot,
  User as UserIcon,
  HelpCircle,
  RefreshCw,
  Search,
} from 'lucide-react';
import { toast } from '../utils/toast';
import {
  chatService,
  type ConversationSummary,
  type ConversationDetail,
  type ChatMessage,
  type CitationItem,
} from '../services/chatService';
import type { Project } from '../services/projectService';
import { ThinkingLoader } from '../components/ThinkingLoader';

interface DocumentChatProps {
  project: Project;
}

const renderInlineMarkdown = (text: string): React.ReactNode => {
  const parts: React.ReactNode[] = [];
  const remaining = text;
  let keyIdx = 0;

  // Process bold (**...**), inline code (`...`), citations ([Source X] or 【Source X】), and italic (*...*)
  const tokenRegex = /(\*\*([^*]+)\*\*|`([^`]+)`|\[(?:Source\s*(\d+))\]|【(?:Source\s*(\d+))】|\*([^*]+)\*)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = tokenRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.substring(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(<strong key={keyIdx++} style={{ fontWeight: 600, color: 'inherit' }}>{match[2]}</strong>);
    } else if (match[3]) {
      // `code`
      parts.push(
        <code
          key={keyIdx++}
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '4px',
            padding: '1px 5px',
            fontSize: '0.85em',
            fontFamily: 'monospace',
          }}
        >
          {match[3]}
        </code>
      );
    } else if (match[4] || match[5]) {
      // Source citation tag [Source X] or 【Source X】
      const srcNum = match[4] || match[5];
      parts.push(
        <span
          key={keyIdx++}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            backgroundColor: 'var(--accent-primary-alpha)',
            color: 'var(--accent-primary)',
            padding: '1px 7px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.75rem',
            fontWeight: 600,
            margin: '0 2px',
            verticalAlign: 'baseline',
          }}
        >
          Source {srcNum}
        </span>
      );
    } else if (match[6]) {
      // *italic*
      parts.push(<em key={keyIdx++}>{match[6]}</em>);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < remaining.length) {
    parts.push(remaining.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

const FormattedMessageContent: React.FC<{ content: string; isUser: boolean }> = ({ content, isUser }) => {
  if (isUser) {
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{content}</div>;
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = (key: number) => {
    if (currentList.length > 0) {
      elements.push(
        <ul
          key={`list-${key}`}
          style={{
            margin: '6px 0',
            paddingLeft: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            listStyleType: 'disc',
          }}
        >
          {currentList.map((item, idx) => (
            <li key={idx} style={{ lineHeight: 1.5, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
              {renderInlineMarkdown(item)}
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      return;
    }

    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numberedMatch) {
      currentList.push(numberedMatch[2]);
      return;
    }

    flushList(index);

    if (!trimmed) {
      elements.push(<div key={`empty-${index}`} style={{ height: '6px' }} />);
      return;
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${index}`} style={{ fontSize: '0.95rem', fontWeight: 700, margin: '10px 0 4px', color: 'var(--text-primary)' }}>
          {renderInlineMarkdown(trimmed.slice(4))}
        </h4>
      );
    } else if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${index}`} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '12px 0 6px', color: 'var(--text-primary)' }}>
          {renderInlineMarkdown(trimmed.slice(3))}
        </h3>
      );
    } else if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${index}`} style={{ fontSize: '1.15rem', fontWeight: 700, margin: '14px 0 8px', color: 'var(--text-primary)' }}>
          {renderInlineMarkdown(trimmed.slice(2))}
        </h2>
      );
    } else {
      elements.push(
        <p key={`p-${index}`} style={{ margin: '4px 0', lineHeight: 1.6, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
          {renderInlineMarkdown(line)}
        </p>
      );
    }
  });

  flushList(lines.length);

  return (
    <div style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', fontSize: '0.9rem', color: 'inherit' }}>
      {elements}
    </div>
  );
};

export const DocumentChat: React.FC<DocumentChatProps> = ({ project }) => {
  const { conversationId: routeConversationId } = useParams<{ conversationId?: string }>();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingActive, setLoadingActive] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [inputQuestion, setInputQuestion] = useState('');
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

  // Rename conversation state
  const [editingConvId, setEditingConvId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState('');

  // Selected citation inspector
  const [inspectingCitation, setInspectingCitation] = useState<CitationItem | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation?.messages, sendingMessage]);

  const loadConversations = async (autoSelectFirst = true, forcedId?: string) => {
    setLoadingList(true);
    try {
      const res = await chatService.listConversations(project.id);
      setConversations(res.data);

      if (res.data.length > 0) {
        // Check if forcedId or routeConversationId exists in this project
        const preferredId = forcedId || routeConversationId;
        const exists = preferredId ? res.data.find((c) => c.id === preferredId) : null;

        if (exists) {
          selectConversation(exists.id);
        } else if (autoSelectFirst) {
          // If the route ID does not exist in this project, auto-select the latest valid one and sync URL
          selectConversation(res.data[0].id);
        } else {
          setActiveConversation(null);
        }
      } else {
        setActiveConversation(null);
        if (routeConversationId) {
          navigate(`/projects/${project.id}/chat`, { replace: true });
        }
      }
    } catch (err: any) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingList(false);
    }
  };

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [project.id]);

  const selectConversation = async (convId: string) => {
    setLoadingActive(true);
    setErrorBanner(null);
    try {
      const res = await chatService.getConversation(convId);
      setActiveConversation(res.data);
      if (routeConversationId !== convId) {
        navigate(`/projects/${project.id}/chat/${convId}`, { replace: true });
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to load conversation messages.';
      setErrorBanner(msg);
      if (err.response?.status === 404) {
        setActiveConversation(null);
        navigate(`/projects/${project.id}/chat`, { replace: true });
      }
    } finally {
      setLoadingActive(false);
    }
  };

  const handleStartNewChat = async () => {
    setErrorBanner(null);
    try {
      const res = await chatService.createConversation(project.id, 'New Conversation');
      const newConv = res.data;
      setConversations((prev) => [
        {
          id: newConv.id,
          user_id: newConv.user_id,
          workspace_id: newConv.workspace_id,
          project_id: newConv.project_id,
          title: newConv.title,
          created_at: newConv.created_at,
          updated_at: newConv.updated_at,
          message_count: 0,
          last_message_preview: null,
        },
        ...prev,
      ]);
      setActiveConversation(newConv);
      navigate(`/projects/${project.id}/chat/${newConv.id}`, { replace: true });
      textareaRef.current?.focus();
    } catch (err: any) {
      setErrorBanner(err.response?.data?.detail?.error?.message || 'Failed to create new conversation.');
    }
  };

  const handleSendMessage = async (customQuestion?: string) => {
    const questionToSend = (customQuestion || inputQuestion).trim();
    if (!questionToSend || sendingMessage) return;

    setErrorBanner(null);
    setLastFailedQuestion(null);
    setInputQuestion('');

    let convId = activeConversation?.id;

    // If no active conversation exists, create one on the fly with the question
    if (!convId) {
      try {
        setSendingMessage(true);
        const resCreate = await chatService.createConversation(project.id, 'New Conversation', questionToSend);
        const newConv = resCreate.data;
        setActiveConversation(newConv);
        navigate(`/projects/${project.id}/chat/${newConv.id}`, { replace: true });
        await loadConversations(false, newConv.id);
        setSendingMessage(false);
        return;
      } catch (err: any) {
        setSendingMessage(false);
        const errDetail = err.response?.data?.detail?.error?.message || 'Failed to generate answer.';
        setErrorBanner(errDetail);
        setLastFailedQuestion(questionToSend);
        return;
      }
    }

    // Optimistically update conversation messages with User question
    const optimisticUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      conversation_id: convId,
      sender_role: 'USER',
      content: questionToSend,
      citations: [],
      created_at: new Date().toISOString(),
    };

    setActiveConversation((prev) =>
      prev ? { ...prev, messages: [...prev.messages, optimisticUserMessage] } : prev
    );

    setSendingMessage(true);
    try {
      const res = await chatService.sendMessage(convId, questionToSend);
      const { user_message, assistant_message } = res.data;

      setActiveConversation((prev) => {
        if (!prev) return null;
        // Replace temp optimistic message with persisted messages
        const filtered = prev.messages.filter((m) => m.id !== optimisticUserMessage.id);
        return {
          ...prev,
          messages: [...filtered, user_message, assistant_message],
        };
      });

      // Refresh list to update message counts & previews
      loadConversations(false);
    } catch (err: any) {
      const errDetail = err.response?.data?.detail?.error?.message || 'Failed to generate grounded answer from AI.';
      setErrorBanner(errDetail);
      toast.error('AI Query Failed', errDetail);
      setLastFailedQuestion(questionToSend);
      // Remove optimistic message on failure
      setActiveConversation((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.filter((m) => m.id !== optimisticUserMessage.id),
            }
          : null
      );
    } finally {
      setSendingMessage(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSaveRename = async (convId: string) => {
    if (!editTitleValue.trim()) {
      setEditingConvId(null);
      return;
    }
    try {
      const res = await chatService.updateConversation(convId, editTitleValue.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: res.data.title } : c))
      );
      if (activeConversation?.id === convId) {
        setActiveConversation((prev) => (prev ? { ...prev, title: res.data.title } : prev));
      }
      toast.success('Conversation Renamed', `New title: "${res.data.title}"`);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to rename conversation.';
      setErrorBanner(msg);
      toast.error('Rename Failed', msg);
    } finally {
      setEditingConvId(null);
    }
  };

  const handleDeleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this conversation and its history?')) return;

    try {
      await chatService.deleteConversation(convId);
      const updatedList = conversations.filter((c) => c.id !== convId);
      setConversations(updatedList);
      toast.success('Chat Deleted', 'Conversation and history removed.');

      if (activeConversation?.id === convId) {
        if (updatedList.length > 0) {
          selectConversation(updatedList[0].id);
        } else {
          setActiveConversation(null);
          navigate(`/projects/${project.id}/chat`, { replace: true });
        }
      }
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to delete conversation.';
      setErrorBanner(msg);
      toast.error('Delete Failed', msg);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '280px 1fr',
        gap: 'var(--space-4)',
        height: 'calc(100vh - 290px)',
        minHeight: '460px',
        maxHeight: 'calc(100vh - 290px)',
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
      }}
    >
      {/* Sidebar: Conversation List */}
      <div
        style={{
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-base)',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <MessageSquare size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Document Chat</span>
          </div>
          <button
            className="btn btn-primary"
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.8rem' }}
            onClick={handleStartNewChat}
            title="Start new conversation"
          >
            <Plus size={14} /> New
          </button>
        </div>

        {/* Conversation List */}
        <div style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto', padding: 'var(--space-2)' }}>
          {loadingList ? (
            <div style={{ padding: 'var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Loading chats...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              <HelpCircle size={24} style={{ margin: '0 auto var(--space-2)', opacity: 0.5 }} />
              <p>No conversations yet.</p>
              <p style={{ fontSize: '0.75rem', marginTop: '4px' }}>Click "+ New" to ask a question.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {conversations.map((c) => {
                const isActive = activeConversation?.id === c.id;
                const isEditing = editingConvId === c.id;

                return (
                  <div
                    key={c.id}
                    onClick={() => !isEditing && selectConversation(c.id)}
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      backgroundColor: isActive ? 'var(--bg-surface-active)' : 'transparent',
                      border: isActive ? '1px solid var(--border-strong)' : '1px solid transparent',
                      transition: 'all var(--transition-fast)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '2px',
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editTitleValue}
                            onChange={(e) => setEditTitleValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveRename(c.id);
                              if (e.key === 'Escape') setEditingConvId(null);
                            }}
                            autoFocus
                            style={{
                              flex: 1,
                              padding: '2px 6px',
                              fontSize: '0.85rem',
                              backgroundColor: 'var(--bg-base)',
                              border: '1px solid var(--accent-primary)',
                              borderRadius: 'var(--radius-sm)',
                              color: 'var(--text-primary)',
                            }}
                          />
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '2px' }}
                            onClick={() => handleSaveRename(c.id)}
                          >
                            <Check size={14} style={{ color: 'var(--status-success)' }} />
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={{ padding: '2px' }}
                            onClick={() => setEditingConvId(null)}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span
                            style={{
                              fontSize: '0.85rem',
                              fontWeight: isActive ? 600 : 500,
                              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                            }}
                            title={c.title}
                          >
                            {c.title}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px', opacity: 0.6 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingConvId(c.id);
                                setEditTitleValue(c.title);
                              }}
                              title="Rename chat"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px', opacity: 0.6 }}
                              onClick={(e) => handleDeleteConversation(c.id, e)}
                              title="Delete chat"
                            >
                              <Trash2 size={12} style={{ color: 'var(--status-danger)' }} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    {c.last_message_preview && (
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--text-tertiary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.last_message_preview}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          minHeight: 0,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Top Header of Active Chat */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
              {activeConversation ? activeConversation.title : 'Document AI Assistant'}
            </h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Answers strictly grounded in indexed project documents with passage citations
            </p>
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', gap: '4px' }}
            onClick={() => navigate(`/projects/${project.id}/documents`)}
            title="Inspect project documents"
          >
            <FileText size={14} /> View Document Library
          </button>
        </div>

        {/* Error Alert Banner */}
        {errorBanner && (
          <div
            style={{
              padding: 'var(--space-3) var(--space-4)',
              backgroundColor: 'var(--status-danger-bg)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--status-danger)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-3)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <AlertCircle size={16} />
              <span>{errorBanner}</span>
            </div>
            {lastFailedQuestion && (
              <button
                className="btn btn-danger"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => handleSendMessage(lastFailedQuestion)}
              >
                <RefreshCw size={12} /> Retry Question
              </button>
            )}
          </div>
        )}

        {/* Messages Stream */}
        <div
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowY: 'auto',
            padding: 'var(--space-4) var(--space-5)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {loadingActive ? (
            <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              Loading messages...
            </div>
          ) : !activeConversation || activeConversation.messages.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                maxWidth: '560px',
                margin: '0 auto',
                textAlign: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <div
                style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--accent-primary-alpha)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary)',
                }}
              >
                <Sparkles size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '6px' }}>
                  Ask Questions About Project Documents
                </h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Conversational RAG uses local vector search to retrieve relevant passages and generate factual,
                  source-cited answers without hallucination.
                </p>
              </div>

              {/* Starter Suggestions */}
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Suggested queries
                </span>
                {[
                  'What are the core features and objectives of this project?',
                  'How does authentication and session security work?',
                  'What database tables and relationships are defined?',
                ].map((promptText) => (
                  <button
                    key={promptText}
                    className="btn btn-secondary"
                    style={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      padding: 'var(--space-2) var(--space-3)',
                    }}
                    onClick={() => handleSendMessage(promptText)}
                  >
                    <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {promptText}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            activeConversation.messages.map((msg) => {
              const isUser = msg.sender_role === 'USER';
              const hasCitations = msg.citations && msg.citations.length > 0;
              const isInsufficientEvidence =
                !hasCitations &&
                msg.content.toLowerCase().includes('could not find any relevant information');

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    minWidth: 0,
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--accent-primary-alpha)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--accent-primary)',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <Bot size={18} />
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                      alignItems: isUser ? 'flex-end' : 'flex-start',
                      minWidth: 0,
                      maxWidth: '100%',
                    }}
                  >
                    <div
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: isUser ? 'var(--accent-primary)' : 'var(--bg-base)',
                        color: isUser ? '#ffffff' : 'var(--text-primary)',
                        border: isUser ? 'none' : '1px solid var(--border-subtle)',
                        fontSize: '0.9rem',
                        lineHeight: 1.6,
                        boxShadow: 'var(--shadow-sm)',
                        maxWidth: '100%',
                        wordBreak: 'break-word',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      <FormattedMessageContent content={msg.content} isUser={isUser} />
                    </div>

                    {/* Insufficient Evidence Notice */}
                    {isInsufficientEvidence && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.75rem',
                          color: 'var(--status-warning)',
                          backgroundColor: 'var(--status-warning-bg)',
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                        }}
                      >
                        <AlertCircle size={12} />
                        <span>No passages matched the relevance threshold (max cosine distance 0.45)</span>
                      </div>
                    )}

                    {/* Citations Pills */}
                    {hasCitations && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', alignSelf: 'center', marginRight: '2px' }}>
                          Sources:
                        </span>
                        {msg.citations.map((c, i) => {
                          const tier = c.relevance_tier || 'moderate';
                          const badgeColor =
                            tier === 'strong'
                              ? 'var(--status-success)'
                              : tier === 'moderate'
                              ? 'var(--accent-primary)'
                              : 'var(--text-secondary)';

                          return (
                            <button
                              key={c.chunk_id || i}
                              className="btn btn-secondary"
                              style={{
                                padding: '3px 8px',
                                fontSize: '0.75rem',
                                borderRadius: 'var(--radius-full)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                borderColor: 'var(--border-strong)',
                              }}
                              onClick={() => setInspectingCitation(c)}
                              title="Click to inspect source passage"
                            >
                              <FileText size={12} style={{ color: badgeColor }} />
                              <span style={{ fontWeight: 500 }}>
                                [{i + 1}] {c.document_filename}
                              </span>
                              <span style={{ color: 'var(--text-tertiary)', fontSize: '0.7rem' }}>
                                #{c.chunk_index}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'var(--bg-surface-active)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      <UserIcon size={18} />
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Thinking / Generation Skeleton */}
          {sendingMessage && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignSelf: 'flex-start', maxWidth: '80%' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'var(--accent-primary-alpha)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary)',
                  flexShrink: 0,
                }}
              >
                <Bot size={18} />
              </div>
              <div
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'var(--bg-base)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ThinkingLoader
                  state="solving"
                  size={20}
                  inline
                  message="Searching documents & generating grounded response..."
                />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <div
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-end',
              backgroundColor: 'var(--bg-base)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-2) var(--space-3)',
            }}
          >
            <textarea
              ref={textareaRef}
              rows={1}
              value={inputQuestion}
              onChange={(e) => setInputQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sendingMessage}
              placeholder="Ask a question about project documents... (Press Enter to send)"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                resize: 'none',
                maxHeight: '120px',
                lineHeight: 1.4,
                padding: '4px 0',
              }}
            />
            <button
              className="btn btn-primary"
              style={{
                borderRadius: 'var(--radius-md)',
                padding: '0.5rem 0.75rem',
              }}
              disabled={!inputQuestion.trim() || sendingMessage}
              onClick={() => handleSendMessage()}
              title="Send question"
            >
              <Send size={16} />
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', padding: '0 4px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              Responses are bounded to verified passages from indexed documents.
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>
              Shift + Enter for new line
            </span>
          </div>
        </div>
      </div>

      {/* Citation Inspector Modal */}
      {inspectingCitation && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 'var(--space-4)',
          }}
          onClick={() => setInspectingCitation(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '640px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: 'var(--space-4)',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <FileText size={20} style={{ color: 'var(--accent-primary)' }} />
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {inspectingCitation.document_filename}
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    Chunk #{inspectingCitation.chunk_index} • ID: {inspectingCitation.chunk_id.slice(0, 8)}...
                  </span>
                </div>
              </div>
              <button
                className="btn btn-ghost"
                style={{ padding: '4px' }}
                onClick={() => setInspectingCitation(null)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 'var(--space-4)', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Relevance Tier & Metrics */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-2) var(--space-3)',
                  backgroundColor: 'var(--bg-base)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                }}
              >
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Relevance Tier: </span>
                  <span
                    style={{
                      fontWeight: 600,
                      textTransform: 'capitalize',
                      color:
                        inspectingCitation.relevance_tier === 'strong'
                          ? 'var(--status-success)'
                          : inspectingCitation.relevance_tier === 'moderate'
                          ? 'var(--accent-primary)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {inspectingCitation.relevance_tier || 'Moderate'}
                  </span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Similarity Score: </span>
                  <span style={{ fontWeight: 600 }}>{inspectingCitation.similarity_score.toFixed(4)}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-tertiary)' }}>Cosine Distance: </span>
                  <span style={{ fontWeight: 600 }}>{inspectingCitation.distance.toFixed(4)}</span>
                </div>
              </div>

              {/* Exact Passage Content */}
              <div>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                  Retrieved Passage Evidence:
                </span>
                <div
                  style={{
                    padding: 'var(--space-3)',
                    backgroundColor: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    lineHeight: 1.6,
                    color: 'var(--text-primary)',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                  }}
                >
                  {inspectingCitation.content}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: 'var(--space-3) var(--space-4)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                backgroundColor: 'var(--bg-base)',
              }}
            >
              <button
                className="btn btn-secondary"
                style={{ fontSize: '0.8rem', gap: '4px' }}
                onClick={() => {
                  setInspectingCitation(null);
                  navigate(`/projects/${project.id}/documents`);
                }}
              >
                <ExternalLink size={14} /> Open in Document Library
              </button>
              <button
                className="btn btn-primary"
                style={{ fontSize: '0.8rem' }}
                onClick={() => setInspectingCitation(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentChat;
