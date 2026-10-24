import React, { useEffect, useState } from 'react';
import {
  productivityService,
  type ProjectAISummaryResponse,
  type ProjectProductivityInsightsResponse,
} from '../services/productivityService';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  Clock,
  UserX,
  ShieldAlert,
  Info,
} from 'lucide-react';
import './ProjectAISummary.css';
import { ThinkingLoader } from './ThinkingLoader';
import { toast } from '../utils/toast';

interface Props {
  projectId: string;
  onNavigateToTasks?: () => void;
}

export const ProjectAISummary: React.FC<Props> = ({ projectId, onNavigateToTasks }) => {
  const [summary, setSummary] = useState<ProjectAISummaryResponse | null>(null);
  const [insights, setInsights] = useState<ProjectProductivityInsightsResponse | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingInsights, setLoadingInsights] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [providerNotConfigured, setProviderNotConfigured] = useState(false);

  // Load deterministic insights on mount
  useEffect(() => {
    let isMounted = true;
    const fetchInsights = async () => {
      setLoadingInsights(true);
      try {
        const res = await productivityService.getInsights(projectId);
        if (isMounted) {
          setInsights(res.data);
        }
      } catch (err: any) {
        console.error('Failed to load project insights:', err);
      } finally {
        if (isMounted) {
          setLoadingInsights(false);
        }
      }
    };
    fetchInsights();
    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const handleGenerateSummary = async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    setProviderNotConfigured(false);
    try {
      const res = await productivityService.getSummary(projectId);
      setSummary(res.data);
      toast.success('AI Summary Generated', 'Executive project health summary is ready.');
    } catch (err: any) {
      if (err.response?.status === 503) {
        setProviderNotConfigured(true);
        toast.error('AI Unavailable', 'AI provider not configured in backend/.env');
      } else {
        const msg = err.response?.data?.detail?.error?.message || 'Failed to generate project summary.';
        setSummaryError(msg);
        toast.error('Summary Failed', msg);
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  // Extract factual metrics from summary or fallback to insights
  const metrics = summary?.factual_metrics || insights?.factual_metrics;

  const getRecommendationCardClass = (type: string) => {
    switch (type) {
      case 'OVERDUE_RISK':
        return 'overdue-risk';
      case 'UNASSIGNED_HIGH_PRIORITY':
        return 'unassigned';
      case 'BLOCKED_WORK':
        return 'blocked';
      case 'UPCOMING_DEADLINE':
        return 'deadline';
      default:
        return '';
    }
  };

  const getRecommendationIcon = (type: string) => {
    switch (type) {
      case 'OVERDUE_RISK':
        return <ShieldAlert size={15} className="text-status-danger" />;
      case 'UNASSIGNED_HIGH_PRIORITY':
        return <UserX size={15} className="text-status-warning" />;
      case 'BLOCKED_WORK':
        return <AlertTriangle size={15} className="text-status-info" />;
      case 'UPCOMING_DEADLINE':
        return <Clock size={15} style={{ color: '#8b5cf6' }} />;
      default:
        return <Lightbulb size={15} className="text-accent-primary" />;
    }
  };

  return (
    <div className="ai-summary-container">
      {/* Header */}
      <div className="ai-summary-header">
        <div className="ai-summary-title-group">
          <div className="ai-summary-icon-badge">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="ai-summary-title">AI Project Summary & Productivity Insights</h3>
            <p className="ai-summary-subtitle">
              Authorized synthesis of real task records, deadlines, and activity
            </p>
          </div>
        </div>

        <button
          className="btn btn-secondary text-xs flex items-center gap-1.5"
          onClick={handleGenerateSummary}
          disabled={loadingSummary}
        >
          {loadingSummary ? (
            <ThinkingLoader state="composing" size={20} inline message="Generating Summary..." />
          ) : (
            <>
              <RefreshCw size={13} /> {summary ? 'Refresh Summary' : 'Generate AI Summary'}
            </>
          )}
        </button>
      </div>

      {/* Provider Not Configured Alert */}
      {providerNotConfigured && (
        <div className="provider-setup-banner">
          <Info size={18} className="shrink-0 mt-0.5" />
          <div>
            <strong>AI Provider Not Configured</strong>
            <p>
              Please set <code>LLM_API_KEY</code>, <code>GROQ_API_KEY</code>, or <code>OPENAI_API_KEY</code> in your <code>backend/.env</code> file to enable AI-powered narrative progress summarization. Deterministic task metrics and recommendations below remain fully operational.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {summaryError && (
        <div className="p-3 rounded-md bg-status-danger-bg border border-status-danger text-xs text-primary flex items-center gap-2">
          <AlertTriangle size={16} className="text-status-danger shrink-0" />
          <span>{summaryError}</span>
        </div>
      )}

      {/* Live Factual Metrics Strip */}
      {loadingInsights && !metrics ? (
        <div className="flex items-center justify-center py-6">
          <ThinkingLoader state="working" size={20} inline message="Loading project metrics..." />
        </div>
      ) : metrics ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
            Verified Project Metrics (Live Database)
          </div>
          <div className="factual-metrics-strip">
            <div className="factual-metric-cell">
              <div className="factual-metric-value">{metrics.total_tasks}</div>
              <div className="factual-metric-label">Total Tasks</div>
            </div>
            <div className="factual-metric-cell">
              <div className="factual-metric-value completed">{metrics.completed_tasks}</div>
              <div className="factual-metric-label">Completed</div>
            </div>
            <div className="factual-metric-cell">
              <div className="factual-metric-value active">
                {metrics.todo_tasks + metrics.in_progress_tasks}
              </div>
              <div className="factual-metric-label">Active</div>
            </div>
            <div className="factual-metric-cell">
              <div className="factual-metric-value overdue">{metrics.overdue_tasks}</div>
              <div className="factual-metric-label">Overdue</div>
            </div>
            <div className="factual-metric-cell">
              <div className="factual-metric-value">{metrics.completion_percentage}%</div>
              <div className="factual-metric-label">Progress</div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Executive Summary Narrative */}
      {summary && (
        <div className="ai-narrative-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-accent-primary uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} /> Executive Summary
            </span>
            <span className="text-xs text-muted">
              Generated {new Date(summary.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="m-0 leading-relaxed">{summary.executive_summary}</p>
        </div>
      )}

      {/* Highlights & Potential Blockers Grid */}
      {summary && !summary.is_empty_project && (
        <div className="ai-highlights-grid">
          <div className="ai-box">
            <div className="ai-box-title highlights">
              <CheckCircle2 size={15} /> Key Highlights
            </div>
            <ul className="ai-list">
              {summary.key_highlights.length > 0 ? (
                summary.key_highlights.map((h, i) => (
                  <li key={i} className="ai-list-item">
                    <span className="text-status-success font-bold shrink-0">•</span>
                    <span>{h}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted italic">No key highlights reported.</li>
              )}
            </ul>
          </div>

          <div className="ai-box">
            <div className="ai-box-title blockers">
              <AlertTriangle size={15} /> Potential Blockers & Risks
            </div>
            <ul className="ai-list">
              {summary.potential_blockers.length > 0 ? (
                summary.potential_blockers.map((b, i) => (
                  <li key={i} className="ai-list-item">
                    <span className="text-status-warning font-bold shrink-0">•</span>
                    <span>{b}</span>
                  </li>
                ))
              ) : (
                <li className="text-xs text-muted italic">Zero blockers identified. Project is on schedule.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {/* Context-Aware Recommendations */}
      {insights && insights.recommendations.length > 0 && (
        <div className="recommendations-section">
          <div className="recommendations-header">
            <Lightbulb size={16} className="text-accent-primary" />
            <span>Context-Aware Productivity Recommendations ({insights.recommendations.length})</span>
          </div>
          <div className="recommendations-grid">
            {insights.recommendations.map((rec) => (
              <div key={rec.id} className={`recommendation-card ${getRecommendationCardClass(rec.type)}`}>
                <div className="recommendation-top">
                  <div className="flex items-center gap-1.5">
                    {getRecommendationIcon(rec.type)}
                    <span className="recommendation-title">{rec.title}</span>
                  </div>
                  <span
                    className={`badge ${
                      rec.priority === 'HIGH'
                        ? 'badge-danger'
                        : rec.priority === 'MEDIUM'
                        ? 'badge-warning'
                        : 'badge-neutral'
                    }`}
                    style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}
                  >
                    {rec.priority}
                  </span>
                </div>

                <div className="recommendation-explanation">{rec.explanation}</div>

                <div className="recommendation-action">
                  <ArrowRight size={13} className="shrink-0" />
                  <span>{rec.suggested_action}</span>
                </div>

                {rec.related_task_id && onNavigateToTasks && (
                  <button
                    className="btn btn-ghost text-xs self-start py-0.5 px-1.5 text-muted hover:text-primary mt-1"
                    onClick={onNavigateToTasks}
                  >
                    View Task in Task List &rarr;
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
