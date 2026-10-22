import React, { useState, useEffect } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { calendarService, type CalendarEvent } from '../services/calendarService';
import { memberService, type Member } from '../services/workspaceService';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
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

  useEffect(() => {
    Promise.all([
      memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error),
      taskService.list(project.id).then(res => setTasks(res.data)).catch(console.error),
      calendarService.list(project.workspace_id, { project_id: project.id }).then(res => setEvents(res.data)).catch(console.error),
    ]).finally(() => setLoading(false));
  }, [project.id, project.workspace_id]);

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
          <button className="btn btn-ghost" onClick={today}>Today</button>
          <div className="calendar-nav">
            <button className="btn btn-icon" onClick={prevMonth}><ChevronLeft size={20} /></button>
            <button className="btn btn-icon" onClick={nextMonth}><ChevronRight size={20} /></button>
          </div>
        </div>
      </div>
      
      <div className="calendar-grid">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="calendar-day-header">{day}</div>
        ))}
        {renderCells()}
      </div>

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
