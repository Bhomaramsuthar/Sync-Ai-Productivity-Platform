import api from './api';

export interface CalendarEvent {
  id: string;
  workspace_id: string;
  project_id: string | null;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  event_type: string;
  meeting_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string | null;
}

export interface CalendarEventCreate {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  event_type?: string;
  project_id?: string;
  meeting_id?: string;
}

export interface CalendarEventUpdate {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  event_type?: string;
  project_id?: string;
}

export const calendarService = {
  list: (workspaceId: string, params?: { start_date?: string; end_date?: string; project_id?: string }) =>
    api.get<CalendarEvent[]>(`/workspaces/${workspaceId}/calendar/events`, { params }),

  create: (workspaceId: string, data: CalendarEventCreate) =>
    api.post<CalendarEvent>(`/workspaces/${workspaceId}/calendar/events`, data),

  get: (eventId: string) =>
    api.get<CalendarEvent>(`/calendar/events/${eventId}`),

  update: (eventId: string, data: CalendarEventUpdate) =>
    api.patch<CalendarEvent>(`/calendar/events/${eventId}`, data),

  delete: (eventId: string) =>
    api.delete(`/calendar/events/${eventId}`),
};
