import api from './api';

export interface CitationItem {
  chunk_id: string;
  document_id: string;
  document_filename: string;
  chunk_index: number;
  content: string;
  similarity_score: number;
  distance: number;
  relevance_tier?: 'strong' | 'moderate' | 'marginal';
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_role: 'USER' | 'ASSISTANT';
  content: string;
  citations: CitationItem[];
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string | null;
}

export interface ConversationDetail {
  id: string;
  user_id: string;
  workspace_id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatQuestionResponse {
  conversation_id: string;
  user_message: ChatMessage;
  assistant_message: ChatMessage;
}

export const chatService = {
  listConversations: (projectId: string) =>
    api.get<ConversationSummary[]>(`/projects/${projectId}/conversations`),

  createConversation: (projectId: string, title?: string, initialQuestion?: string) =>
    api.post<ConversationDetail>(`/projects/${projectId}/conversations`, {
      title: title || 'New Conversation',
      initial_question: initialQuestion,
    }),

  getConversation: (conversationId: string) =>
    api.get<ConversationDetail>(`/conversations/${conversationId}`),

  updateConversation: (conversationId: string, title: string) =>
    api.patch<ConversationSummary>(`/conversations/${conversationId}`, { title }),

  deleteConversation: (conversationId: string) =>
    api.delete(`/conversations/${conversationId}`),

  sendMessage: (conversationId: string, question: string) =>
    api.post<ChatQuestionResponse>(`/conversations/${conversationId}/messages`, { question }),
};
