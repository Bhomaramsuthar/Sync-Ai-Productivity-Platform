import logging
import uuid
import json
import datetime
from typing import List, Tuple, Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.config import settings
from app.projects.service import get_project_for_member
from app.projects.repository import record_activity
from app.rag.service import search_document_chunks
from .models import Conversation, Message
from .schemas import (
    ConversationResponse,
    ConversationDetailResponse,
    MessageResponse,
    CitationItem,
)
from .rag_pipeline import execute_rag_pipeline, RAGPipelineResult
from .llm.base import (
    LLMError,
    LLMConfigError,
    LLMAuthError,
    LLMRateLimitError,
    LLMTimeoutError,
)

logger = logging.getLogger(__name__)


def parse_citations_json(citations_json: Optional[str]) -> List[CitationItem]:
    """Safely deserializes stored citation JSON into CitationItem schema models."""
    if not citations_json:
        return []
    try:
        raw_items = json.loads(citations_json)
        if isinstance(raw_items, list):
            return [CitationItem(**item) for item in raw_items]
    except Exception as e:
        logger.warning(f"Failed to parse stored citations JSON: {e}")
    return []


def format_message_response(msg: Message) -> MessageResponse:
    return MessageResponse(
        id=msg.id,
        conversation_id=msg.conversation_id,
        sender_role=msg.sender_role,
        content=msg.content,
        citations=parse_citations_json(msg.citations_json),
        created_at=msg.created_at,
    )


def list_conversations_for_member(
    db: Session, project_id: str, user_id: str
) -> List[ConversationResponse]:
    """
    Lists conversations within a project for an authorized project member.
    """
    # 1. Authorize member access to project
    get_project_for_member(db, project_id, user_id)

    conversations = (
        db.query(Conversation)
        .filter(Conversation.project_id == project_id)
        .order_by(desc(Conversation.updated_at))
        .all()
    )

    results = []
    for conv in conversations:
        # Get count and last message preview
        msgs = conv.messages
        count = len(msgs)
        last_preview = None
        if count > 0:
            last_msg = msgs[-1]
            last_preview = (
                last_msg.content[:80] + "..."
                if len(last_msg.content) > 80
                else last_msg.content
            )

        results.append(
            ConversationResponse(
                id=conv.id,
                user_id=conv.user_id,
                workspace_id=conv.workspace_id,
                project_id=conv.project_id,
                title=conv.title,
                created_at=conv.created_at,
                updated_at=conv.updated_at,
                message_count=count,
                last_message_preview=last_preview,
            )
        )
    return results


def create_conversation_for_member(
    db: Session, project_id: str, user_id: str, title: Optional[str] = None
) -> Conversation:
    """
    Creates a new conversation in a project for an authorized project member.
    """
    project, _ = get_project_for_member(db, project_id, user_id)

    clean_title = (title or "").strip() or "New Conversation"
    if len(clean_title) > 255:
        clean_title = clean_title[:255]

    conversation = Conversation(
        id=str(uuid.uuid4()),
        user_id=user_id,
        workspace_id=project.workspace_id,
        project_id=project.id,
        scope="PROJECT",
        title=clean_title,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)

    record_activity(
        db,
        project.id,
        user_id,
        "CONVERSATION_CREATED",
        "conversation",
        conversation.id,
        {"title": conversation.title},
    )
    return conversation


def get_conversation_for_member(
    db: Session, conversation_id: str, user_id: str
) -> Conversation:
    """
    Retrieves a conversation and verifies the user has access to its project.
    """
    conversation = (
        db.query(Conversation).filter(Conversation.id == conversation_id).first()
    )
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "error": {
                    "code": "CONVERSATION_NOT_FOUND",
                    "message": "Conversation does not exist.",
                }
            },
        )

    # Verify authorization in project
    get_project_for_member(db, conversation.project_id, user_id)
    return conversation


def update_conversation_for_member(
    db: Session, conversation_id: str, user_id: str, title: str
) -> Conversation:
    """
    Renames a conversation.
    """
    conversation = get_conversation_for_member(db, conversation_id, user_id)
    clean_title = (title or "").strip()
    if not clean_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMPTY_TITLE",
                    "message": "Conversation title cannot be empty.",
                }
            },
        )
    if len(clean_title) > 255:
        clean_title = clean_title[:255]

    conversation.title = clean_title
    conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(conversation)
    return conversation


def delete_conversation_for_member(
    db: Session, conversation_id: str, user_id: str
) -> None:
    """
    Deletes a conversation and its messages.
    """
    conversation = get_conversation_for_member(db, conversation_id, user_id)
    project_id = conversation.project_id
    db.delete(conversation)
    db.commit()

    record_activity(
        db,
        project_id,
        user_id,
        "CONVERSATION_DELETED",
        "conversation",
        conversation_id,
        {},
    )


def submit_question_to_conversation(
    db: Session,
    conversation_id: str,
    user_id: str,
    question: str,
) -> Tuple[Message, Message]:
    """
    Submits a question to an existing conversation:
    1. Validates project membership & question content.
    2. Persists user message.
    3. Retrieves relevant chunks using Week 10 semantic search service with threshold filtering.
    4. Executes grounded RAG pipeline.
    5. Persists assistant response with structured citation metadata.
    6. Updates conversation timestamp & auto-titles if appropriate.
    """
    conversation = get_conversation_for_member(db, conversation_id, user_id)

    clean_question = (question or "").strip()
    if not clean_question:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "EMPTY_QUESTION",
                    "message": "Question cannot be empty or whitespace-only.",
                }
            },
        )
    if len(clean_question) > 1000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "QUESTION_TOO_LONG",
                    "message": "Question exceeds maximum length of 1000 characters.",
                }
            },
        )

    # 1. Collect existing conversation history before adding current question
    existing_messages = conversation.messages
    history_dicts = [
        {"role": "user" if m.sender_role == "USER" else "assistant", "content": m.content}
        for m in existing_messages
    ]

    # 2. Persist User Message
    user_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation.id,
        sender_role="USER",
        content=clean_question,
        citations_json=None,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(user_msg)
    db.commit()
    db.refresh(user_msg)

    # 3. Retrieve relevant document chunks using existing semantic retrieval service
    # (enforces project boundary, extraction readiness, and relevance distance threshold)
    try:
        search_response = search_document_chunks(
            db=db,
            project_id=conversation.project_id,
            user_id=user_id,
            query=clean_question,
            limit=5,
            max_distance=settings.RAG_MAX_DISTANCE,
        )
        retrieved_chunks = search_response.results
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic search failed during RAG retrieval: {e}", exc_info=True)
        retrieved_chunks = []

    # 4. Execute RAG pipeline
    try:
        rag_result: RAGPipelineResult = execute_rag_pipeline(
            question=clean_question,
            retrieved_chunks=retrieved_chunks,
            conversation_history=history_dicts,
        )
    except LLMConfigError as e:
        logger.warning(f"LLM configuration error: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "LLM_NOT_CONFIGURED",
                    "message": (
                        "AI language model is not configured. Please configure LLM_API_KEY "
                        "or OPENAI_API_KEY in the backend environment to enable answer generation."
                    ),
                }
            },
        )
    except LLMAuthError as e:
        logger.error(f"LLM authentication failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "LLM_AUTH_ERROR",
                    "message": "AI provider rejected credentials. Please verify your API key configuration.",
                }
            },
        )
    except LLMRateLimitError as e:
        logger.warning(f"LLM rate limited: {e}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "LLM_RATE_LIMIT",
                    "message": "AI provider rate limit reached. Please wait a moment before asking again.",
                }
            },
        )
    except LLMTimeoutError as e:
        logger.warning(f"LLM timed out: {e}")
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                "error": {
                    "code": "LLM_TIMEOUT",
                    "message": "The AI provider took too long to respond. Please retry your question.",
                }
            },
        )
    except LLMError as e:
        logger.error(f"LLM generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "LLM_GENERATION_FAILED",
                    "message": f"AI provider error: {str(e)}",
                }
            },
        )
    except Exception as e:
        logger.error(f"Unexpected error during RAG answer generation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": {
                    "code": "RAG_PIPELINE_ERROR",
                    "message": "An unexpected error occurred while generating the document answer.",
                }
            },
        )

    # 5. Persist Assistant Response
    serialized_citations = (
        json.dumps([c.to_dict() for c in rag_result.citations])
        if rag_result.citations
        else None
    )

    asst_msg = Message(
        id=str(uuid.uuid4()),
        conversation_id=conversation.id,
        sender_role="ASSISTANT",
        content=rag_result.answer,
        citations_json=serialized_citations,
        created_at=datetime.datetime.now(datetime.timezone.utc),
    )
    db.add(asst_msg)

    # Update conversation title if still default
    if conversation.title in ["New Conversation", ""] or not conversation.title:
        title_summary = clean_question[:36]
        if len(clean_question) > 36:
            title_summary += "..."
        conversation.title = title_summary

    conversation.updated_at = datetime.datetime.now(datetime.timezone.utc)
    db.commit()
    db.refresh(asst_msg)
    db.refresh(conversation)

    return user_msg, asst_msg
