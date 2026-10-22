import api from './api';

export type MeetingStatus = 'SCHEDULED' | 'LOBBY' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
export type TranscriptStatus = 'NONE' | 'RECORDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type SuggestionItemType = 'TASK' | 'CALENDAR_EVENT';
export type SuggestionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED';

export interface Meeting {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  host_user_id: string | null;
  status: MeetingStatus;
  scheduled_start: string | null;
  scheduled_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  meeting_code: string;
  livekit_room_name: string;
  recording_consent: boolean;
  transcript_status: TranscriptStatus;
  created_at: string;
  updated_at: string | null;
  host_name?: string | null;
  project_name?: string | null;
  participant_count?: number;
}

export interface MeetingCreate {
  title: string;
  description?: string;
  project_id?: string;
  scheduled_start?: string;
  scheduled_end?: string;
  recording_consent?: boolean;
}

export interface MeetingJoinResponse {
  meeting: Meeting;
  livekit_token: string;
  livekit_url: string;
  is_host: boolean;
}

export interface MeetingParticipant {
  id: string;
  meeting_id: string;
  user_id: string;
  role: 'HOST' | 'PARTICIPANT';
  joined_at: string | null;
  left_at: string | null;
  consent_given: boolean;
  user_name?: string | null;
  user_email?: string | null;
}

export interface TranscriptSegment {
  id: string;
  meeting_id: string;
  speaker_user_id: string | null;
  participant_id?: string | null;
  speaker_name: string | null;
  content: string;
  start_time_ms: number;
  end_time_ms: number;
  segment_index: number;
  processing_status?: string | null;
  created_at: string;
}

export interface MeetingAISummary {
  id: string;
  meeting_id: string;
  summary_text: string;
  decisions: string[];
  processing_status: 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
  processing_error: string | null;
  processing_stage?: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface MeetingSuggestedItem {
  id: string;
  meeting_id: string;
  summary_id: string | null;
  item_type: SuggestionItemType;
  title: string;
  description: string | null;
  suggested_assignee_id: string | null;
  suggested_assignee_name?: string | null;
  suggested_due_date: string | null;
  suggested_priority: string | null;
  suggested_start_time: string | null;
  suggested_end_time: string | null;
  evidence_text: string | null;
  evidence_start_ms?: number | null;
  evidence_end_ms?: number | null;
  is_explicit_commitment: boolean;
  status: SuggestionStatus;
  approved_task_id: string | null;
  approved_event_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface SuggestionApproveRequest {
  target_project_id?: string;
  title?: string;
  description?: string;
  assignee_id?: string;
  due_date?: string;
  priority?: string;
  start_time?: string;
  end_time?: string;
}

export interface FailedAudioBatch {
  id: string;
  start_time_offset_ms: number;
  error_message: string | null;
  retry_count: number;
  can_retry: boolean;
}

export interface TranscriptionQueueStatus {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  total_batches: number;
  failed_batches: FailedAudioBatch[];
}

export const meetingService = {
  list: (workspaceId: string, params?: { status?: string; project_id?: string }) =>
    api.get<Meeting[]>(`/workspaces/${workspaceId}/meetings`, { params }),

  create: (workspaceId: string, data: MeetingCreate) =>
    api.post<Meeting>(`/workspaces/${workspaceId}/meetings`, data),

  get: (meetingId: string) =>
    api.get<Meeting>(`/meetings/${meetingId}`),

  join: (meetingId: string) =>
    api.post<MeetingJoinResponse>(`/meetings/${meetingId}/join`),

  joinByCode: (meetingCode: string) =>
    api.post<MeetingJoinResponse>(`/meetings/join-by-code/${meetingCode}`),

  end: (meetingId: string) =>
    api.post<Meeting>(`/meetings/${meetingId}/end`),

  leave: (meetingId: string) =>
    api.post<{ status: string }>(`/meetings/${meetingId}/leave`),

  getParticipants: (meetingId: string) =>
    api.get<MeetingParticipant[]>(`/meetings/${meetingId}/participants`),

  recordConsent: (meetingId: string, consentGiven: boolean) =>
    api.post(`/meetings/${meetingId}/consent`, { consent_given: consentGiven }),

  getTranscript: (meetingId: string) =>
    api.get<TranscriptSegment[]>(`/meetings/${meetingId}/transcript`),

  uploadAudio: (
    meetingId: string,
    audioBlob: Blob,
    startTimeOffsetMs: number = 0,
    speakerName?: string,
    participantId?: string
  ) => {
    const formData = new FormData();
    formData.append('file', audioBlob, 'chunk.webm');
    formData.append('start_time_offset_ms', startTimeOffsetMs.toString());
    if (speakerName) formData.append('speaker_name', speakerName);
    if (participantId) formData.append('participant_id', participantId);
    return api.post<TranscriptSegment[]>(`/meetings/${meetingId}/audio`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getQueueStatus: (meetingId: string) =>
    api.get<TranscriptionQueueStatus>(`/meetings/${meetingId}/transcription-queue`),

  retryFailedAudio: (meetingId: string) =>
    api.post<{ retried_count: number; batch_ids: string[] }>(`/meetings/${meetingId}/audio/retry-failed`),

  ingestTranscript: (meetingId: string, segments: Array<{ content: string; speaker_name?: string; start_time_ms?: number; end_time_ms?: number; segment_index?: number }>) =>
    api.post<TranscriptSegment[]>(`/meetings/${meetingId}/transcript`, { segments }),

  analyze: (meetingId: string) =>
    api.post<MeetingAISummary>(`/meetings/${meetingId}/analyze`),

  getSummary: (meetingId: string) =>
    api.get<MeetingAISummary | null>(`/meetings/${meetingId}/summary`),

  listSuggestions: (meetingId: string, params?: { item_type?: string; status?: string }) =>
    api.get<MeetingSuggestedItem[]>(`/meetings/${meetingId}/suggestions`, { params }),

  editSuggestion: (suggestionId: string, data: Partial<MeetingSuggestedItem>) =>
    api.patch<MeetingSuggestedItem>(`/meetings/suggestions/${suggestionId}`, data),

  rejectSuggestion: (suggestionId: string) =>
    api.post<MeetingSuggestedItem>(`/meetings/suggestions/${suggestionId}/reject`),

  approveSuggestion: (suggestionId: string, data?: SuggestionApproveRequest) =>
    api.post<MeetingSuggestedItem>(`/meetings/suggestions/${suggestionId}/approve`, data || {}),

  bulkApprove: (suggestionIds: string[], targetProjectId?: string) =>
    api.post<MeetingSuggestedItem[]>(`/meetings/suggestions/bulk-approve`, {
      suggestion_ids: suggestionIds,
      target_project_id: targetProjectId,
    }),
};
