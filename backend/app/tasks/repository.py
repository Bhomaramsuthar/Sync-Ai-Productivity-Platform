from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional
from .models import Task, TaskStatusEnum, TaskPriorityEnum

def create_task(db: Session, project_id: str, created_by: str, title: str, description: str | None, status: TaskStatusEnum, priority: TaskPriorityEnum, assignee_id: str | None, due_date: str | None) -> Task:
    task = Task(
        project_id=project_id,
        created_by=created_by,
        title=title,
        description=description,
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        due_date=due_date
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task

def get_tasks_by_project(db: Session, project_id: str, status: Optional[TaskStatusEnum] = None, priority: Optional[TaskPriorityEnum] = None, assignee_id: Optional[str] = None, search: Optional[str] = None, sort: Optional[str] = None) -> list[Task]:
    query = db.query(Task).filter(Task.project_id == project_id)
    
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    if search:
        search_filter = f"%{search}%"
        query = query.filter(or_(Task.title.ilike(search_filter), Task.description.ilike(search_filter)))
        
    if sort:
        if sort == "createdAt:desc":
            query = query.order_by(Task.created_at.desc())
        elif sort == "createdAt:asc":
            query = query.order_by(Task.created_at.asc())
        elif sort == "deadline:asc":
            query = query.order_by(Task.due_date.asc())
        elif sort == "deadline:desc":
            query = query.order_by(Task.due_date.desc())
    else:
        query = query.order_by(Task.created_at.desc())
        
    return query.all()

def get_task(db: Session, task_id: str) -> Task | None:
    return db.query(Task).filter(Task.id == task_id).first()

def update_task(db: Session, task: Task, update_data: dict) -> Task:
    for key, value in update_data.items():
        setattr(task, key, value)
        
    db.commit()
    db.refresh(task)
    return task

def delete_task(db: Session, task: Task) -> None:
    db.delete(task)
    db.commit()
