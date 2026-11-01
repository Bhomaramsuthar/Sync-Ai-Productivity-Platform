import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from .models import Conversation
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


# ==============================================================================
# Global Workspace-Aware Assistant Endpoints
# ==============================================================================

from .global_assistant import GlobalAssistantService
from .schemas import (
    AssistantCitationItem,
    AssistantMessageResponse,
    AssistantConversationResponse,
    AssistantConversationDetailResponse,
    CreateAssistantConversationRequest,
    SubmitAssistantQuestionRequest,
    SubmitAssistantQuestionResponse,
)


@router.post(
    "/ai/assistant/conversations",
    response_model=AssistantConversationDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new global or scoped assistant conversation",
)
def create_assistant_conversation(
    payload: CreateAssistantConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new AI Assistant conversation scoped to GLOBAL, WORKSPACE, or PROJECT.
    If an initial question is supplied, generates the initial grounded response.
    """
    conv = GlobalAssistantService.create_conversation(
        db=db,
        user=current_user,
        scope=payload.scope,
        workspace_id=payload.workspace_id,
        project_id=payload.project_id,
        title=payload.title,
    )

    messages: List[AssistantMessageResponse] = []
    if payload.initial_question and payload.initial_question.strip():
        user_msg, asst_msg, _ = GlobalAssistantService.submit_question(
            db=db,
            conversation_id=conv.id,
            user=current_user,
            question=payload.initial_question,
            current_page_context=payload.current_page_context,
        )
        messages = [
            GlobalAssistantService.format_message_response(user_msg),
            GlobalAssistantService.format_message_response(asst_msg),
        ]

    return AssistantConversationDetailResponse(
        id=conv.id,
        user_id=conv.user_id,
        scope=conv.scope or "GLOBAL",
        workspace_id=conv.workspace_id,
        project_id=conv.project_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages,
    )


@router.get(
    "/ai/assistant/conversations",
    response_model=List[AssistantConversationResponse],
    summary="List the authenticated user's assistant conversations",
)
def list_assistant_conversations(
    scope: Optional[str] = None,
    workspace_id: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all AI Assistant conversations belonging to the authenticated user.
    Supports filtering by scope, workspace_id, and project_id.
    """
    return GlobalAssistantService.list_conversations(
        db=db,
        user=current_user,
        scope=scope,
        workspace_id=workspace_id,
        project_id=project_id,
    )


@router.get(
    "/ai/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationDetailResponse,
    summary="Get assistant conversation details and message history",
)
def get_assistant_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Retrieves the conversation details and full message history with citations.
    """
    conv = GlobalAssistantService.get_conversation(db, conversation_id, current_user)
    return AssistantConversationDetailResponse(
        id=conv.id,
        user_id=conv.user_id,
        scope=conv.scope or "GLOBAL",
        workspace_id=conv.workspace_id,
        project_id=conv.project_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[GlobalAssistantService.format_message_response(m) for m in conv.messages],
    )


@router.patch(
    "/ai/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationResponse,
    summary="Rename an assistant conversation",
)
def rename_assistant_conversation(
    conversation_id: str,
    payload: UpdateConversationRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Renames an existing assistant conversation.
    """
    conv = GlobalAssistantService.update_conversation(db, conversation_id, current_user, payload.title)
    return AssistantConversationResponse(
        id=conv.id,
        user_id=conv.user_id,
        scope=conv.scope or "GLOBAL",
        workspace_id=conv.workspace_id,
        project_id=conv.project_id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(conv.messages),
        last_message_preview=conv.messages[-1].content[:80] + "..." if conv.messages else None,
    )


@router.delete(
    "/ai/assistant/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an assistant conversation",
)
def delete_assistant_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Permanently deletes an assistant conversation.
    """
    GlobalAssistantService.delete_conversation(db, conversation_id, current_user)
    return None


@router.post(
    "/ai/assistant/conversations/{conversation_id}/messages",
    response_model=SubmitAssistantQuestionResponse,
    summary="Submit a question to an assistant conversation",
)
def submit_assistant_question(
    conversation_id: str,
    payload: SubmitAssistantQuestionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Submits a user question to the assistant conversation.
    Retrieves authorized structured facts and semantic document passages,
    generates grounded AI response with structured citations, and returns the chat turn.
    """
    user_msg, asst_msg, _ = GlobalAssistantService.submit_question(
        db=db,
        conversation_id=conversation_id,
        user=current_user,
        question=payload.question,
        current_page_context=payload.current_page_context,
    )
    conv = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    scope = conv.scope if conv else "GLOBAL"
    formatted_asst = GlobalAssistantService.format_message_response(asst_msg)

    return SubmitAssistantQuestionResponse(
        conversation_id=conversation_id,
        user_message=GlobalAssistantService.format_message_response(user_msg),
        assistant_message=formatted_asst,
        scope=scope,
        citations=formatted_asst.citations,
        suggested_followups=[],
    )

