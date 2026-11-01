import datetime
from typing import List, Optional, Any
from pydantic import BaseModel, Field, ConfigDict


class CitationItem(BaseModel):
    chunk_id: str
    document_id: str
    document_filename: str
    chunk_index: int
    content: str
    similarity_score: float
    distance: float
    relevance_tier: Optional[str] = "moderate"

    model_config = ConfigDict(from_attributes=True)


class MessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_role: str
    content: str
    citations: List[CitationItem] = Field(default_factory=list)
    created_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    id: str
    user_id: str
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    scope: str = "PROJECT"
    title: str
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    message_count: int = 0
    last_message_preview: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ConversationDetailResponse(BaseModel):
    id: str
    user_id: str
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    scope: str = "PROJECT"
    title: str
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    messages: List[MessageResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CreateConversationRequest(BaseModel):
    title: Optional[str] = Field(default="New Conversation", max_length=255)
    initial_question: Optional[str] = Field(default=None, max_length=1000)


class UpdateConversationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)


class SubmitQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


class ChatQuestionResponse(BaseModel):
    conversation_id: str
    user_message: MessageResponse
    assistant_message: MessageResponse


# ==============================================================================
# Global Workspace-Aware Assistant Schemas
# ==============================================================================

class AssistantCitationItem(BaseModel):
    source_id: str
    source_type: str  # DOCUMENT, TASK, PROJECT, MEETING, CALENDAR_EVENT, WORKSPACE, ACTIVITY
    title: str
    excerpt: str
    url: Optional[str] = None
    route: Optional[str] = None
    metadata: Optional[dict] = None

    model_config = ConfigDict(from_attributes=True)

    def model_post_init(self, __context: Any) -> None:
        if self.source_type:
            self.source_type = self.source_type.lower()
        if self.url and not self.route:
            self.route = self.url
        elif self.route and not self.url:
            self.url = self.route


class AssistantMessageResponse(BaseModel):
    id: str
    conversation_id: str
    sender_role: str
    content: str
    citations: List[AssistantCitationItem] = Field(default_factory=list)
    created_at: Optional[datetime.datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AssistantConversationResponse(BaseModel):
    id: str
    user_id: str
    scope: str  # GLOBAL, WORKSPACE, PROJECT
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    title: str
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    message_count: int = 0
    last_message_preview: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AssistantConversationDetailResponse(BaseModel):
    id: str
    user_id: str
    scope: str
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    title: str
    created_at: Optional[datetime.datetime] = None
    updated_at: Optional[datetime.datetime] = None
    messages: List[AssistantMessageResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CreateAssistantConversationRequest(BaseModel):
    scope: str = Field(default="GLOBAL", description="GLOBAL, WORKSPACE, or PROJECT")
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    title: Optional[str] = Field(default="New Chat", max_length=255)
    initial_question: Optional[str] = Field(default=None, max_length=2000)
    current_page_context: Optional[str] = Field(default=None, max_length=1000)


class SubmitAssistantQuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    current_page_context: Optional[str] = Field(default=None, max_length=1000)


class SubmitAssistantQuestionResponse(BaseModel):
    conversation_id: str
    user_message: AssistantMessageResponse
    assistant_message: AssistantMessageResponse
    scope: Optional[str] = "GLOBAL"
    citations: List[AssistantCitationItem] = Field(default_factory=list)
    suggested_followups: List[str] = Field(default_factory=list)


# ==============================================================================
# Week 12: AI-Powered Project Productivity Schemas
# ==============================================================================

class TaskExpandRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    context: Optional[str] = Field(default=None, max_length=1000)


class TaskExpandResponse(BaseModel):
    description: str
    acceptance_criteria: List[str] = Field(default_factory=list)
    suggested_priority: str = Field(default="MEDIUM")


class TaskBreakdownRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)


class ProposedSubtask(BaseModel):
    title: str
    description: str = ""
    priority: str = "MEDIUM"


class TaskBreakdownResponse(BaseModel):
    subtasks: List[ProposedSubtask] = Field(default_factory=list)


class TaskPrioritySuggestionRequest(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    due_date: Optional[datetime.datetime] = None


class TaskPrioritySuggestionResponse(BaseModel):
    suggested_priority: str
    reasoning: str


class TaskUnblockRequest(BaseModel):
    task_id: Optional[str] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    blocker: str = Field(min_length=1, max_length=1000)


class TaskUnblockResponse(BaseModel):
    next_action: str
    unblocking_steps: List[str] = Field(default_factory=list)
    rationale: str


class TaskSummaryItem(BaseModel):
    id: str
    title: str
    status: str
    priority: str
    due_date: Optional[datetime.datetime] = None
    assignee_id: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProjectFactualMetrics(BaseModel):
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    todo_tasks: int
    overdue_tasks: int
    completion_percentage: float
    overdue_task_items: List[TaskSummaryItem] = Field(default_factory=list)
    upcoming_deadlines: List[TaskSummaryItem] = Field(default_factory=list)
    recent_activity_count: int = 0


class TaskActionReference(BaseModel):
    task_id: Optional[str] = None
    task_title: Optional[str] = None
    action: str
    priority: Optional[str] = "MEDIUM"


class ProjectAISummaryResponse(BaseModel):
    project_id: str
    project_name: str
    generated_at: datetime.datetime
    factual_metrics: ProjectFactualMetrics
    executive_summary: str
    key_highlights: List[str] = Field(default_factory=list)
    potential_blockers: List[str] = Field(default_factory=list)
    recommended_actions: List[TaskActionReference] = Field(default_factory=list)
    is_empty_project: bool = False


class ProductivityRecommendation(BaseModel):
    id: str
    type: str  # OVERDUE_RISK, BLOCKED_WORK, UNASSIGNED_HIGH_PRIORITY, UPCOMING_DEADLINE, STAGNANT_TASK, GENERAL
    priority: str  # HIGH, MEDIUM, LOW
    title: str
    explanation: str
    suggested_action: str
    related_task_id: Optional[str] = None
    related_task_title: Optional[str] = None


class ProjectProductivityInsightsResponse(BaseModel):
    project_id: str
    project_name: str
    factual_metrics: ProjectFactualMetrics
    recommendations: List[ProductivityRecommendation] = Field(default_factory=list)
    ai_synthesis: Optional[str] = None
    generated_at: datetime.datetime

