import logging
from typing import List
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import (
    ConversationResponse,
    ConversationDetailResponse,
    CreateConversationRequest,
    UpdateConversationRequest,
    SubmitQuestionRequest,
    ChatQuestionResponse,
    MessageResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get(
    "/projects/{project_id}/conversations",
    response_model=List[ConversationResponse],
    summary="List conversations for a project",
)
def list_project_conversations(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all document conversations in the given project for the authenticated member.
    """
    return service.list_conversations_for_member(db, project_id, current_user.id)


@router.post(
    "/projects/{project_id}/conversations",
    response_model=ConversationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation in a project",
)
def create_project_conversation(
    project_id: str,
    payload: CreateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new conversation in the project. If an initial question is provided,
    it automatically runs the RAG pipeline to generate the first grounded answer.
    """
    conversation = service.create_conversation_for_member(
        db, project_id, current_user.id, title=payload.title
    )

    messages_response: List[MessageResponse] = []
    if payload.initial_question and payload.initial_question.strip():
        user_msg, asst_msg = service.submit_question_to_conversation(
            db, conversation.id, current_user.id, payload.initial_question
        )
        messages_response = [
            service.format_message_response(user_msg),
            service.format_message_response(asst_msg),
        ]

    return ConversationDetailResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        workspace_id=conversation.workspace_id,
        project_id=conversation.project_id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=messages_response,
    )


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
    summary="Retrieve a conversation and its messages",
)
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves full conversation details and its message history with citations.
    """
    conversation = service.get_conversation_for_member(db, conversation_id, current_user.id)
    return ConversationDetailResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        workspace_id=conversation.workspace_id,
        project_id=conversation.project_id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[
            service.format_message_response(m) for m in conversation.messages
        ],
    )


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationResponse,
    summary="Rename a conversation",
)
def update_conversation(
    conversation_id: str,
    payload: UpdateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates the title of a conversation.
    """
    conversation = service.update_conversation_for_member(
        db, conversation_id, current_user.id, payload.title
    )
    return ConversationResponse(
        id=conversation.id,
        user_id=conversation.user_id,
        workspace_id=conversation.workspace_id,
        project_id=conversation.project_id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        message_count=len(conversation.messages),
    )


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
)
def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes a conversation and all its messages.
    """
    service.delete_conversation_for_member(db, conversation_id, current_user.id)
    return None


@router.post(
    "/conversations/{conversation_id}/messages",
    response_model=ChatQuestionResponse,
    status_code=status.HTTP_200_OK,
    summary="Submit a question to a conversation",
)
def submit_question(
    conversation_id: str,
    payload: SubmitQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a question to an existing conversation.
    Performs vector retrieval, relevance filtering, context bounding,
    answer generation, and returns both user message and grounded assistant response.
    """
    user_msg, asst_msg = service.submit_question_to_conversation(
        db, conversation_id, current_user.id, payload.question
    )

    return ChatQuestionResponse(
        conversation_id=conversation_id,
        user_message=service.format_message_response(user_msg),
        assistant_message=service.format_message_response(asst_msg),
    )


# ==============================================================================
# Week 12: AI-Powered Project Productivity Endpoints
# ==============================================================================

from . import productivity_service
from .schemas import (
    TaskExpandRequest,
    TaskExpandResponse,
    TaskBreakdownRequest,
    TaskBreakdownResponse,
    TaskPrioritySuggestionRequest,
    TaskPrioritySuggestionResponse,
    TaskUnblockRequest,
    TaskUnblockResponse,
    ProjectAISummaryResponse,
    ProjectProductivityInsightsResponse,
)


@router.post(
    "/projects/{project_id}/ai/task-assistant/expand",
    response_model=TaskExpandResponse,
    status_code=status.HTTP_200_OK,
    summary="Expand a short task title into description and acceptance criteria",
)
def expand_task(
    project_id: str,
    payload: TaskExpandRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Expands a short task title into a professional description, structured
    acceptance criteria, and suggested priority.
    Does NOT persist to the database without explicit user confirmation.
    """
    return productivity_service.expand_task_description(
        db=db, project_id=project_id, user_id=current_user.id, req=payload
    )


@router.post(
    "/projects/{project_id}/ai/task-assistant/breakdown",
    response_model=TaskBreakdownResponse,
    status_code=status.HTTP_200_OK,
    summary="Break a task into proposed subtasks",
)
def breakdown_task_endpoint(
    project_id: str,
    payload: TaskBreakdownRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Decomposes a larger task into a proposed list of smaller subtasks with suggested priorities.
    Suggestions are proposals for user review; no tasks are created without explicit confirmation.
    """
    return productivity_service.breakdown_task(
        db=db, project_id=project_id, user_id=current_user.id, req=payload
    )


@router.post(
    "/projects/{project_id}/ai/task-assistant/suggest-priority",
    response_model=TaskPrioritySuggestionResponse,
    status_code=status.HTTP_200_OK,
    summary="Suggest task priority based on context and deadline",
)
def suggest_priority_endpoint(
    project_id: str,
    payload: TaskPrioritySuggestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Suggests an objective task priority (LOW, MEDIUM, HIGH, URGENT) with transparent reasoning.
    """
    return productivity_service.suggest_task_priority(
        db=db, project_id=project_id, user_id=current_user.id, req=payload
    )


@router.post(
    "/projects/{project_id}/ai/task-assistant/unblock",
    response_model=TaskUnblockResponse,
    status_code=status.HTTP_200_OK,
    summary="Suggest next action for a blocked task",
)
def unblock_task_endpoint(
    project_id: str,
    payload: TaskUnblockRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Recommends a concrete immediate next action and actionable unblocking steps for a blocked task.
    """
    return productivity_service.suggest_task_unblock(
        db=db, project_id=project_id, user_id=current_user.id, req=payload
    )


@router.post(
    "/projects/{project_id}/ai/summary",
    response_model=ProjectAISummaryResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate an authorized AI project progress summary",
)
def get_project_summary(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generates a progress summary strictly grounded in authorized database tasks and activity.
    Distinguishes factual metrics from AI analysis. Handles empty projects gracefully.
    """
    return productivity_service.generate_project_progress_summary(
        db=db, project_id=project_id, user_id=current_user.id
    )


@router.get(
    "/projects/{project_id}/ai/insights",
    response_model=ProjectProductivityInsightsResponse,
    status_code=status.HTTP_200_OK,
    summary="Get context-aware productivity insights and recommendations",
)
def get_project_insights_endpoint(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Evaluates factual project status and task deadlines using deterministic rules,
    linking each actionable recommendation to a real task or verified condition.
    """
    return productivity_service.get_project_productivity_insights(
        db=db, project_id=project_id, user_id=current_user.id
    )

