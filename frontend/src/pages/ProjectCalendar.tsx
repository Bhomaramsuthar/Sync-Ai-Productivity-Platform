import React, { useState, useEffect, useCallback } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { calendarService, type CalendarEvent } from '../services/calendarService';
import { memberService, type Member } from '../services/workspaceService';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, List } from 'lucide-react';
import { useWorkspaceRealtime } from '../utils/useWorkspaceRealtime';
import './ProjectCalendar.css';

interface Props {
  project: Project;
}

export const ProjectCalendar: React.FC<Props> = ({ project }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');

  const loadCalendarData = useCallback(async () => {
    try {
      const [tasksRes, eventsRes] = await Promise.all([
        taskService.list(project.id),
        calendarService.list(project.workspace_id, { project_id: project.id })
      ]);
      setTasks(tasksRes.data);
      setEvents(eventsRes.data);
    } catch (err) {
      console.error(err);
    }
  }, [project.id, project.workspace_id]);

  useEffect(() => {
    memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error);
    loadCalendarData().finally(() => setLoading(false));
  }, [project.workspace_id, loadCalendarData]);

  // Real-time synchronization for calendar & task due dates
  useWorkspaceRealtime(project.workspace_id, {
    'task:created': (payload) => {
      if (payload?.project_id === project.id) loadCalendarData();
    },
    'task:updated': (payload) => {
      if (payload?.project_id === project.id) loadCalendarData();
    },
    'task:deleted': (payload) => {
      if (payload?.project_id === project.id) loadCalendarData();
    },
    'calendar_event:created': (payload) => {
      if (!payload?.project_id || payload?.project_id === project.id) loadCalendarData();
    },
    'calendar_event:updated': (payload) => {
      if (!payload?.project_id || payload?.project_id === project.id) loadCalendarData();
    },
    'calendar_event:deleted': () => {
      loadCalendarData();
    },
    onReconnect: () => {
      loadCalendarData();
    }
  });

  if (loading) return (
    <ThinkingLoader
      state="searching"
      size={64}
      message="Loading project calendar & schedules..."
      description="Gathering task deadlines, milestones, and scheduled meetings"
    />
  );

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const monthName = currentDate.toLocaleString('default', { month: 'long' });

  const isToday = (day: number) => {
    const d = new Date();
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
  };

  const tasksByDay = (day: number) => {
    return tasks.filter(task => {
      if (!task.due_date) return false;
      const d = new Date(task.due_date);
      // use UTC to match how YYYY-MM-DD creates UTC dates and avoids timezone shifting
      return d.getUTCDate() === day && d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
  };

  const eventsByDay = (day: number) => {
    return events.filter(event => {
      if (!event.start_time) return false;
      const d = new Date(event.start_time);
      return d.getUTCDate() === day && d.getUTCMonth() === month && d.getUTCFullYear() === year;
    });
  };

  const renderCells = () => {
    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`empty-${i}`} className="calendar-cell empty"></div>);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const dayTasks = tasksByDay(i);
      const dayEvents = eventsByDay(i);
      cells.push(
        <div key={i} className={`calendar-cell ${isToday(i) ? 'today' : ''}`}>
          <div className="cell-header">{i}</div>
          <div className="cell-tasks">
            {dayEvents.map(event => (
              <div
                key={event.id}
                className="calendar-task"
                style={{
                  backgroundColor: 'rgba(99, 102, 241, 0.25)',
                  borderLeft: '3px solid #6366f1',
                  color: '#e0e7ff',
                }}
                title={`Event: ${event.title}\n${event.description || ''}`}
              >
                <div className="task-title" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={11} style={{ flexShrink: 0 }} />
                  <span>{event.title}</span>
                </div>
              </div>
            ))}
            {dayTasks.map(task => (
              <div 
                key={task.id} 
                className={`calendar-task status-${task.status.toLowerCase()}`}
                onClick={() => setSelectedTask(task)}
                style={{ cursor: 'pointer' }}
                title={task.description ? `${task.title}\n\n${task.description}` : task.title}
              >
                <div className="task-title">{task.title}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return cells;
  };

  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <div className="calendar-title">
          <CalendarIcon size={24} className="text-primary" />
          <h2>{monthName} {year}</h2>
        </div>
        <div className="calendar-actions">
          {/* View Mode Toggle: Grid vs Agenda */}
          <div className="segmented-pills-track" style={{ padding: '2px' }}>
            <button
              className={`segmented-pill-item ${viewMode === 'month' ? 'active' : ''}`}
              onClick={() => setViewMode('month')}
              style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
              title="Month Grid View"
              type="button"
            >
              <CalendarIcon size={13} />
              <span>Grid</span>
            </button>
            <button
              className={`segmented-pill-item ${viewMode === 'agenda' ? 'active' : ''}`}
              onClick={() => setViewMode('agenda')}
              style={{ padding: '4px 10px', fontSize: '0.75rem', gap: '4px' }}
              title="Agenda List View"
              type="button"
            >
              <List size={13} />
              <span>Agenda</span>
            </button>
          </div>

          <button className="btn btn-ghost" onClick={today} style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}>Today</button>
          <div className="calendar-nav">
            <button className="btn btn-icon" onClick={prevMonth} aria-label="Previous month"><ChevronLeft size={18} /></button>
            <button className="btn btn-icon" onClick={nextMonth} aria-label="Next month"><ChevronRight size={18} /></button>
          </div>
        </div>
      </div>
      
      {viewMode === 'month' ? (
        <div className="calendar-grid-wrapper">
          <div className="calendar-grid">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="calendar-day-header">{day}</div>
            ))}
            {renderCells()}
          </div>
        </div>
      ) : (
        <div className="calendar-agenda-view">
          {Array.from({ length: daysInMonth }, (_, idx) => idx + 1)
            .filter(day => tasksByDay(day).length > 0 || eventsByDay(day).length > 0)
            .map(day => {
              const dayTasks = tasksByDay(day);
              const dayEvents = eventsByDay(day);
              const dateObj = new Date(year, month, day);
              const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              const isCurrentDay = isToday(day);

              return (
                <div key={day} className="agenda-day-card">
                  <div className={`agenda-day-header ${isCurrentDay ? 'today' : ''}`}>
                    <span>{dayName} {isCurrentDay ? '• Today' : ''}</span>
                    <span className="badge badge-neutral" style={{ fontSize: '0.68rem' }}>
                      {dayTasks.length + dayEvents.length} item{dayTasks.length + dayEvents.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="agenda-items-list">
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        className="agenda-item-card"
                        style={{ borderLeft: '3px solid #6366f1' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Clock size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {event.title}
                          </span>
                        </div>
                        <span className="badge badge-primary" style={{ fontSize: '0.68rem', flexShrink: 0 }}>Event</span>
                      </div>
                    ))}
                    {dayTasks.map(task => (
                      <div
                        key={task.id}
                        className="agenda-item-card"
                        onClick={() => setSelectedTask(task)}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {task.title}
                          </div>
                          {task.description && (
                            <div style={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                              {task.description}
                            </div>
                          )}
                        </div>
                        <span className={`badge ${task.status === 'DONE' ? 'badge-success' : task.status === 'IN_PROGRESS' ? 'badge-warning' : 'badge-neutral'}`} style={{ fontSize: '0.68rem', flexShrink: 0 }}>
                          {task.status.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          {Array.from({ length: daysInMonth }, (_, idx) => idx + 1).filter(d => tasksByDay(d).length > 0 || eventsByDay(d).length > 0).length === 0 && (
            <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: '#94a3b8', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 12, border: '1px dashed rgba(255, 255, 255, 0.08)' }}>
              <CalendarIcon size={28} style={{ margin: '0 auto 8px auto', opacity: 0.5, color: '#818cf8' }} />
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff' }}>No events or task deadlines</div>
              <p style={{ fontSize: '0.78rem', marginTop: 4 }}>There are no scheduled milestones in {monthName} {year}.</p>
            </div>
          )}
        </div>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal 
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        members={members}
      />
    </div>
  );
};

export default ProjectCalendar;
