import api from './api';

export type AssistantScope = 'GLOBAL' | 'WORKSPACE' | 'PROJECT';

export interface AssistantCitationItem {
  source_id: string;
  source_type: 'document_chunk' | 'task' | 'project' | 'workspace' | 'calendar_event' | 'meeting' | 'summary' | 'user' | string;
  title: string;
  excerpt: string;
  route?: string | null;
  metadata?: Record<string, any>;
}

export interface AssistantMessage {
  id: string;
  conversation_id: string;
  sender_role: 'USER' | 'ASSISTANT';
  content: string;
  citations: AssistantCitationItem[];
  created_at: string;
}

export interface AssistantConversationSummary {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  project_id?: string | null;
  scope: AssistantScope;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string | null;
}

export interface AssistantConversationDetail {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  project_id?: string | null;
  scope: AssistantScope;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AssistantMessage[];
}

export interface SubmitQuestionResponse {
  conversation_id: string;
  user_message: AssistantMessage;
  assistant_message: AssistantMessage;
  scope: AssistantScope;
  citations: AssistantCitationItem[];
  suggested_followups: string[];
}

export interface PageContext {
  pathname: string;
  workspace_id?: string | null;
  project_id?: string | null;
}

export const assistantService = {
  listConversations: (params?: { scope?: AssistantScope; workspace_id?: string; project_id?: string }) =>
    api.get<AssistantConversationSummary[]>('/ai/assistant/conversations', { params }),

  createConversation: (data: {
    scope: AssistantScope;
    workspace_id?: string | null;
    project_id?: string | null;
    title?: string;
    initial_question?: string;
    page_context?: PageContext;
  }) =>
    api.post<AssistantConversationDetail>('/ai/assistant/conversations', data),

  getConversation: (conversationId: string) =>
    api.get<AssistantConversationDetail>(`/ai/assistant/conversations/${conversationId}`),

  updateConversation: (conversationId: string, title: string) =>
    api.patch<AssistantConversationSummary>(`/ai/assistant/conversations/${conversationId}`, { title }),

  deleteConversation: (conversationId: string) =>
    api.delete(`/ai/assistant/conversations/${conversationId}`),

  sendMessage: (
    conversationId: string,
    question: string,
    pageContext?: PageContext
  ) =>
    api.post<SubmitQuestionResponse>(`/ai/assistant/conversations/${conversationId}/messages`, {
      question,
      page_context: pageContext,
    }),
};
