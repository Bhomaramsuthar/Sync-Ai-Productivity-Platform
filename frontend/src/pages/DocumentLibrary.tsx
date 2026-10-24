import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { type Project } from '../services/projectService';
import { 
  documentService, 
  type Document, 
  type DocumentTextResponse, 
  type ChunkMetadata,
  type SemanticSearchResultItem
} from '../services/documentService';
import { memberService, type Member } from '../services/workspaceService';
import { 
  Upload, Search, Trash2, Download, FileText, File, 
  CheckCircle2, AlertCircle, AlertTriangle, RotateCw, 
  Clock, Copy, Check, X, Eye, Layers, Sparkles, Compass, Info, MessageSquare,
  LayoutGrid, List, ArrowUpDown, SlidersHorizontal
} from 'lucide-react';
import './DocumentLibrary.css';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { SelectBox } from '../components/ui/select';
import { toast } from '../utils/toast';

const SUGGESTED_PROMPTS = [
  { label: 'System architecture & stack', query: 'What are the system architecture components and technology stack?' },
  { label: 'Project goals & milestones', query: 'What are the main project goals, milestones, and deliverables?' },
  { label: 'Security & auth policies', query: 'What are the security, authentication, and access control policies?' },
  { label: 'Database models & schema', query: 'What are the core database models, tables, and schemas?' },
];

export const DocumentLibrary = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingIndexId, setRetryingIndexId] = useState<string | null>(null);

  // Document Filtering & Sorting state
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'pdf' | 'docx' | 'md' | 'csv' | 'txt'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'PROCESSING' | 'FAILED'>('ALL');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name' | 'size'>('newest');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Semantic Search state
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticLimit, setSemanticLimit] = useState(5);
  const [semanticSensitivity, setSemanticSensitivity] = useState<'balanced' | 'strict' | 'permissive'>('balanced');
  const [appliedThreshold, setAppliedThreshold] = useState<number>(0.45);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResultItem[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');
  const [copiedPassageId, setCopiedPassageId] = useState<string | null>(null);

  // Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<Document | null>(null);
  const [previewTab, setPreviewTab] = useState<'text' | 'chunks'>('text');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<DocumentTextResponse | null>(null);
  const [chunksList, setChunksList] = useState<ChunkMetadata[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async (showLoadingSpinner = false) => {
    if (showLoadingSpinner) setLoading(true);
    try {
      const res = await documentService.list(project.id);
      setDocuments(res.data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    } finally {
      if (showLoadingSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error);
  }, [project.workspace_id]);

  useEffect(() => {
    loadDocuments(true);
  }, [project.id]);

  // Live polling for in-progress documents (both text extraction & indexing)
  useEffect(() => {
    const hasPending = documents.some(
      d => d.status === 'PROCESSING' || 
           d.status === 'UPLOADED' || 
           d.indexing_status === 'PROCESSING'
    );
    if (!hasPending) return;

    const interval = setInterval(() => {
      loadDocuments(false);
    }, 2500);

    return () => clearInterval(interval);
  }, [documents, project.id]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit (10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.warning('File Too Large', 'Maximum file size allowed is 10MB.');
      return;
    }

    setUploading(true);
    try {
      await documentService.upload(project.id, file);
      toast.success('Document Uploaded', `${file.name} uploaded successfully and queued for indexing.`);
      await loadDocuments(false);
    } catch (err: any) {
      toast.error('Upload Failed', err.response?.data?.detail?.error?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRetryExtraction = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRetryingId(docId);
    toast.info('Retrying Extraction', 'Restarting document text extraction...');
    try {
      await documentService.retry(docId);
      toast.success('Extraction Retried', 'Text extraction initiated.');
      await loadDocuments(false);
    } catch (err: any) {
      toast.error('Extraction Retry Failed', err.response?.data?.detail?.error?.message || 'Failed to retry document processing');
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryIndexing = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRetryingIndexId(docId);
    toast.info('Retrying Indexing', 'Regenerating vector embeddings for document...');
    try {
      await documentService.retryIndexing(docId);
      toast.success('Indexing Retried', 'Vector embedding generation initiated.');
      await loadDocuments(false);
    } catch (err: any) {
      toast.error('Indexing Retry Failed', err.response?.data?.detail?.error?.message || 'Failed to retry document indexing');
    } finally {
      setRetryingIndexId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document? All associated vector embeddings will also be removed.')) return;
    try {
      await documentService.delete(id);
      toast.success('Document Deleted', 'Document and associated vector embeddings removed.');
      await loadDocuments(false);
      if (previewDoc?.id === id) {
        setPreviewDoc(null);
        setPreviewData(null);
        setChunksList([]);
      }
    } catch (err: any) {
      toast.error('Delete Failed', err.response?.data?.detail?.error?.message || 'Failed to delete document');
    }
  };

  const handleDownload = async (doc: Document, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await documentService.get(doc.id);
      if (res.data.download_url) {
        window.open(res.data.download_url, '_blank');
      } else {
        toast.error('Download Unavailable', 'Download URL is not available for this document.');
      }
    } catch (err: any) {
      toast.error('Download Error', 'Failed to retrieve download link.');
    }
  };

  const openPreview = async (doc: Document, initialTab: 'text' | 'chunks' = 'text') => {
    setPreviewDoc(doc);
    setPreviewTab(initialTab);
    setPreviewLoading(true);
    setCopied(false);
    setChunksList([]);

    try {
      const textRes = await documentService.getText(doc.id);
      setPreviewData(textRes.data);
    } catch (err: any) {
      setPreviewData({
        id: doc.id,
        filename: doc.filename,
        status: 'FAILED',
        extracted_text: null,
        extracted_chars: 0,
        processed_at: null,
        processing_error: err.response?.data?.detail?.error?.message || 'Failed to load extracted text'
      });
    } finally {
      setPreviewLoading(false);
    }

    // Also fetch chunks metadata
    setChunksLoading(true);
    try {
      const chunksRes = await documentService.getChunks(doc.id);
      setChunksList(chunksRes.data.chunks || []);
    } catch (err) {
      console.warn("Could not load document chunks:", err);
    } finally {
      setChunksLoading(false);
    }
  };

  const openPreviewById = async (docId: string, initialTab: 'text' | 'chunks' = 'text') => {
    const existing = documents.find(d => d.id === docId);
    if (existing) {
      openPreview(existing, initialTab);
      return;
    }
    try {
      const res = await documentService.get(docId);
      openPreview(res.data, initialTab);
    } catch (err) {
      toast.error('Preview Failed', 'Failed to load document content.');
    }
  };

  // Filter and sort documents
  const filteredAndSortedDocuments = useMemo(() => {
    return documents
      .filter((doc) => {
        // Filename search filter
        if (search.trim()) {
          const matchName = doc.filename.toLowerCase().includes(search.toLowerCase().trim());
          if (!matchName) return false;
        }

        // File type filter
        if (typeFilter !== 'ALL') {
          const ext = doc.filename.split('.').pop()?.toLowerCase();
          const mime = doc.content_type?.toLowerCase() || '';
          if (typeFilter === 'pdf' && ext !== 'pdf' && !mime.includes('pdf')) return false;
          if (typeFilter === 'docx' && ext !== 'docx' && !mime.includes('word')) return false;
          if (typeFilter === 'md' && ext !== 'md' && !mime.includes('markdown')) return false;
          if (typeFilter === 'csv' && ext !== 'csv' && !mime.includes('csv')) return false;
          if (typeFilter === 'txt' && ext !== 'txt' && !mime.includes('plain')) return false;
        }

        // Status filter
        if (statusFilter !== 'ALL') {
          if (statusFilter === 'READY') {
            if (doc.status !== 'READY') return false;
          } else if (statusFilter === 'PROCESSING') {
            if (doc.status !== 'PROCESSING' && doc.status !== 'UPLOADED' && doc.indexing_status !== 'PROCESSING') return false;
          } else if (statusFilter === 'FAILED') {
            if (doc.status !== 'FAILED' && doc.indexing_status !== 'FAILED') return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        if (sortBy === 'name') {
          return a.filename.localeCompare(b.filename);
        }
        if (sortBy === 'size') {
          return (b.file_size || 0) - (a.file_size || 0);
        }
        return 0;
      });
  }, [documents, search, typeFilter, statusFilter, sortBy]);

  // Execute Semantic Search
  const handleExecuteSemanticSearch = async (
    queryOverride?: string,
    sensitivityOverride?: 'balanced' | 'strict' | 'permissive'
  ) => {
    const q = (queryOverride !== undefined ? queryOverride : semanticQuery).trim();
    if (!q) {
      setSemanticError("Please enter a question or keywords to search document passages.");
      return;
    }
    if (q.length > 1000) {
      setSemanticError("Query exceeds maximum length of 1,000 characters.");
      return;
    }

    if (queryOverride !== undefined) {
      setSemanticQuery(queryOverride);
    }

    const sens = sensitivityOverride || semanticSensitivity;
    if (sensitivityOverride) {
      setSemanticSensitivity(sensitivityOverride);
    }

    setSemanticLoading(true);
    setSemanticError(null);
    try {
      const maxDistance = sens === 'strict' ? 0.35 : sens === 'permissive' ? 0.55 : 0.45;
      const res = await documentService.search(project.id, {
        query: q,
        limit: semanticLimit,
        max_distance: maxDistance
      });
      setSemanticResults(res.data.results);
      if (res.data.threshold !== undefined) {
        setAppliedThreshold(res.data.threshold);
      }
      setLastSearchedQuery(q);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || "Semantic search request failed.";
      setSemanticError(msg);
      setSemanticResults(null);
    } finally {
      setSemanticLoading(false);
    }
  };

  const handleClearSearch = () => {
    setSemanticQuery('');
    setSemanticResults(null);
    setSemanticError(null);
    setLastSearchedQuery('');
  };

  const handleCopyPassage = (item: SemanticSearchResultItem) => {
    navigator.clipboard.writeText(item.content);
    setCopiedPassageId(item.chunk_id);
    toast.info('Passage Copied', 'Semantic snippet copied to clipboard.');
    setTimeout(() => setCopiedPassageId(null), 2000);
  };

  const renderRelevanceBadge = (item: SemanticSearchResultItem) => {
    const tier = item.relevance_tier || (item.distance <= 0.25 ? 'strong' : item.distance <= 0.40 ? 'moderate' : 'marginal');
    const approxPct = Math.min(99, Math.max(50, Math.round(item.similarity_score * 100)));

    if (tier === 'strong') {
      return (
        <span className="match-score-badge strong" title={`High vector similarity (~${approxPct}%). Matches key concepts closely.`}>
          <CheckCircle2 size={12} />
          <span>Strong Match ({approxPct}%)</span>
        </span>
      );
    }
    if (tier === 'moderate') {
      return (
        <span className="match-score-badge moderate" title={`Moderate vector similarity (~${approxPct}%). Related context.`}>
          <Sparkles size={12} />
          <span>Good Match ({approxPct}%)</span>
        </span>
      );
    }
    return (
      <span className="match-score-badge marginal" title={`Marginal vector similarity (~${approxPct}%). Broad match.`}>
        <Info size={12} />
        <span>Related Context ({approxPct}%)</span>
      </span>
    );
  };

  const handleCopyText = () => {
    if (!previewData?.extracted_text) return;
    navigator.clipboard.writeText(previewData.extracted_text);
    setCopied(true);
    toast.info('Text Copied', 'Full document text copied to clipboard.');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (contentType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || contentType.includes('pdf')) return <FileText size={20} style={{ color: '#f87171' }} />;
    if (ext === 'docx' || contentType.includes('word')) return <FileText size={20} style={{ color: '#60a5fa' }} />;
    if (ext === 'csv' || contentType.includes('csv')) return <FileText size={20} style={{ color: '#34d399' }} />;
    if (ext === 'md' || contentType.includes('markdown')) return <FileText size={20} style={{ color: '#a78bfa' }} />;
    return <File size={20} style={{ color: '#94a3b8' }} />;
  };

  const renderExtractionBadge = (doc: Document) => {
    switch (doc.status) {
      case 'READY':
        return (
          <span className="badge badge-success flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title="Text extracted successfully">
            <CheckCircle2 size={11} />
            <span>Text Ready</span>
            {doc.extracted_chars ? <span className="opacity-80">({doc.extracted_chars.toLocaleString()} c)</span> : null}
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="badge badge-warning flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title="Extracting text">
            <RotateCw size={11} className="animate-spin" />
            <span>Extracting...</span>
          </span>
        );
      case 'UPLOADED':
        return (
          <span className="badge badge-neutral flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>
            <Clock size={11} />
            <span>Queued</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-danger flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title="Extraction failed">
            <AlertCircle size={11} />
            <span>Extraction Failed</span>
          </span>
        );
      default:
        return <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '2px 7px' }}>{doc.status}</span>;
    }
  };

  const renderIndexingBadge = (doc: Document) => {
    const status = doc.indexing_status || 'PENDING';
    switch (status) {
      case 'READY':
        return (
          <span className="badge badge-primary flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px', backgroundColor: 'rgba(99, 102, 241, 0.18)', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.35)' }} title="Vectors generated and stored in PostgreSQL">
            <Sparkles size={11} />
            <span>Indexed ({doc.chunk_count || 0} chunks)</span>
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="badge badge-warning flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title="Generating embeddings">
            <RotateCw size={11} className="animate-spin" />
            <span>Indexing...</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-danger flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title={doc.indexing_error || "Indexing failed"}>
            <AlertTriangle size={11} />
            <span>Indexing Failed</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="badge badge-neutral flex items-center gap-1" style={{ fontSize: '0.68rem', padding: '2px 7px' }} title="Pending chunking and vector indexing">
            <Clock size={11} />
            <span>Index Pending</span>
          </span>
        );
    }
  };

  const activeFiltersCount = (search.trim() ? 1 : 0) + (typeFilter !== 'ALL' ? 1 : 0) + (statusFilter !== 'ALL' ? 1 : 0);

  const handleResetFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setStatusFilter('ALL');
    setSortBy('newest');
  };

  return (
    <div className="doc-library-container">
      {/* Primary Navigation & Upload Bar */}
      <div className="meetings-toolbar">
        <div className="meetings-filter-tabs">
          <button 
            className={`filter-tab-pill ${activeTab === 'documents' ? 'active' : ''}`}
            onClick={() => setActiveTab('documents')}
            id="tab-btn-documents"
          >
            <FileText size={15} />
            <span>Document Library</span>
            <span className="filter-badge-count">{documents.length}</span>
          </button>
          <button 
            className={`filter-tab-pill ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
            id="tab-btn-semantic-search"
          >
            <Sparkles size={15} />
            <span>AI Semantic Search</span>
          </button>
          <button 
            className="filter-tab-pill"
            onClick={() => navigate(`/projects/${project.id}/chat`)}
            title="Chat with documents using conversational RAG"
            id="tab-btn-document-chat"
          >
            <MessageSquare size={15} />
            <span>Document Chat</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input 
            type="file" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            accept=".pdf,.txt,.md,.docx,.csv"
          />
          <button 
            className="btn-new-meeting" 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            id="btn-upload-document"
            title="Upload PDF, TXT, MD, DOCX, CSV (Max 10MB)"
          >
            {uploading ? (
              <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Uploading...</>
            ) : (
              <><Upload size={15} /> Upload Document</>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: DOCUMENT LIBRARY & SEARCH */}
      {activeTab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Secondary Filter & Search Control Bar */}
          <div className="doc-filter-bar">
            {/* Left: Quick Search Input & Type Filter Pills */}
            <div className="doc-filter-group" style={{ flex: 1, minWidth: 280 }}>
              <div className="meetings-search-wrap" style={{ minWidth: 240, flex: '1 1 240px' }}>
                <Search className="meetings-search-icon" size={15} />
                <input 
                  className="meetings-search-input" 
                  placeholder="Filter documents by name..." 
                  value={search} 
                  onChange={e => setSearch(e.target.value)}
                  id="doc-filter-search-input"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
                    title="Clear search"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Type Filter Pills */}
              <div className="doc-type-pills">
                {(['ALL', 'pdf', 'docx', 'md', 'csv', 'txt'] as const).map(t => (
                  <button
                    key={t}
                    className={`doc-type-pill ${typeFilter === t ? 'active' : ''}`}
                    onClick={() => setTypeFilter(t)}
                  >
                    {t === 'ALL' ? 'All Types' : t.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: Status Filter, Sorting, View Toggle */}
            <div className="doc-filter-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <SlidersHorizontal size={13} color="#71717a" />
                <div style={{ minWidth: 135 }}>
                  <SelectBox
                    size="sm"
                    value={statusFilter}
                    onValueChange={val => setStatusFilter(val as any)}
                    id="doc-status-filter"
                    options={[
                      { value: 'ALL', label: 'All Status' },
                      { value: 'READY', label: 'Ready' },
                      { value: 'PROCESSING', label: 'Processing' },
                      { value: 'FAILED', label: 'Needs Attention' },
                    ]}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ArrowUpDown size={13} color="#71717a" />
                <div style={{ minWidth: 140 }}>
                  <SelectBox
                    size="sm"
                    value={sortBy}
                    onValueChange={val => setSortBy(val as any)}
                    id="doc-sort-select"
                    options={[
                      { value: 'newest', label: 'Newest First' },
                      { value: 'oldest', label: 'Oldest First' },
                      { value: 'name', label: 'Name (A-Z)' },
                      { value: 'size', label: 'File Size' },
                    ]}
                  />
                </div>
              </div>

              {/* View Mode Toggle: Grid vs Table */}
              <div className="doc-view-toggle">
                <button
                  className={`doc-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  title="Card Grid View"
                  id="btn-view-grid"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  className={`doc-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Table / List View"
                  id="btn-view-table"
                >
                  <List size={15} />
                </button>
              </div>
            </div>
          </div>

          {/* Active Filter Indicator */}
          {activeFiltersCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#a1a1aa', padding: '0 4px' }}>
              <span>
                Showing <strong>{filteredAndSortedDocuments.length}</strong> of {documents.length} documents matching filters
              </span>
              <button
                onClick={handleResetFilters}
                className="btn btn-ghost"
                style={{ fontSize: '0.72rem', padding: '2px 8px' }}
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* Content Area */}
          {loading ? (
            <ThinkingLoader
              state="working"
              size={64}
              message="Loading project documents..."
              description="Retrieving indexed documents, vector chunks, and extraction status"
            />
          ) : documents.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-state-icon">
                <FileText size={24} />
              </div>
              <h3 className="empty-state-title">No documents yet</h3>
              <p className="text-muted text-sm max-w-md">
                Upload PDFs, Markdown specs, DOCX reports, or CSV spreadsheets. Text will be extracted, chunked, and embedded automatically for AI search and chat.
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '0.75rem' }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={15} /> Upload First Document
              </button>
            </div>
          ) : filteredAndSortedDocuments.length === 0 ? (
            <div className="empty-state py-12">
              <div className="empty-state-icon">
                <Search size={22} />
              </div>
              <h3 className="empty-state-title">No documents match your filters</h3>
              <p className="text-muted text-sm max-w-md">
                Try adjusting your search query, selecting "All Types", or clearing the status filter.
              </p>
              <button
                className="btn btn-secondary"
                style={{ marginTop: '0.75rem' }}
                onClick={handleResetFilters}
              >
                Clear All Filters
              </button>
            </div>
          ) : viewMode === 'table' ? (
            /* Table View */
            <div className="doc-table-container">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Text Extraction</th>
                    <th>Vector Indexing</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAndSortedDocuments.map((doc) => {
                    const uploaderName = members.find(m => m.user_id === doc.uploader_id)?.user_name || 'Member';
                    return (
                      <tr key={doc.id} style={{ cursor: doc.status === 'READY' ? 'pointer' : 'default' }} onClick={() => doc.status === 'READY' && openPreview(doc)}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div style={{ padding: '5px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getFileIcon(doc.content_type, doc.filename)}
                            </div>
                            <span style={{ fontWeight: 600, color: '#ffffff' }} title={doc.filename}>
                              {doc.filename}
                            </span>
                          </div>
                        </td>
                        <td>{renderExtractionBadge(doc)}</td>
                        <td>{renderIndexingBadge(doc)}</td>
                        <td style={{ color: '#a1a1aa' }}>{formatSize(doc.file_size)}</td>
                        <td style={{ color: '#71717a' }}>
                          <div>{new Date(doc.created_at).toLocaleDateString()}</div>
                          <div style={{ fontSize: '0.68rem', color: '#52525b' }}>by {uploaderName}</div>
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {doc.status === 'READY' && (
                              <button
                                className="btn btn-ghost"
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                onClick={() => openPreview(doc)}
                                title="View Extracted Content"
                              >
                                <Eye size={13} />
                              </button>
                            )}
                            {doc.status === 'FAILED' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                onClick={e => handleRetryExtraction(doc.id, e)}
                                disabled={retryingId === doc.id}
                                title="Retry Extraction"
                              >
                                <RotateCw size={12} className={retryingId === doc.id ? 'animate-spin' : ''} />
                              </button>
                            )}
                            {doc.status === 'READY' && doc.indexing_status === 'FAILED' && (
                              <button
                                className="btn btn-secondary"
                                style={{ padding: '4px 8px', fontSize: '0.72rem', color: '#fca5a5', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                                onClick={e => handleRetryIndexing(doc.id, e)}
                                disabled={retryingIndexId === doc.id}
                                title="Retry Indexing"
                              >
                                <RotateCw size={12} className={retryingIndexId === doc.id ? 'animate-spin' : ''} />
                              </button>
                            )}
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              onClick={e => handleDownload(doc, e)}
                              title="Download File"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              className="btn btn-ghost"
                              style={{ padding: '4px 8px', fontSize: '0.75rem', color: '#ef4444' }}
                              onClick={e => handleDelete(doc.id, e)}
                              title="Delete Document"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Grid View */
            <div className="meetings-cards-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
              {filteredAndSortedDocuments.map(doc => {
                const uploaderName = members.find(m => m.user_id === doc.uploader_id)?.user_name || 'Member';
                return (
                  <div 
                    key={doc.id} 
                    className="meeting-card"
                    style={{
                      padding: '1.15rem',
                      cursor: doc.status === 'READY' ? 'pointer' : 'default',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: 185
                    }}
                    onClick={() => {
                      if (doc.status === 'READY') openPreview(doc);
                    }}
                  >
                    <div>
                      {/* Top Row: File icon, Title & Delete */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0, flex: 1 }}>
                          <div style={{ padding: '7px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {getFileIcon(doc.content_type, doc.filename)}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.filename}>
                              {doc.filename}
                            </h4>
                            <span style={{ fontSize: '0.72rem', color: '#71717a' }}>{formatSize(doc.file_size)}</span>
                          </div>
                        </div>

                        <button 
                          className="btn-icon btn-ghost" 
                          style={{ color: '#ef4444', padding: '4px', opacity: 0.7 }}
                          onClick={e => handleDelete(doc.id, e)} 
                          title="Delete Document"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* Dual Badges */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '0.75rem' }}>
                        {renderExtractionBadge(doc)}
                        {doc.status === 'READY' && renderIndexingBadge(doc)}
                      </div>

                      {/* Extraction Failure Alert */}
                      {doc.status === 'FAILED' && (
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.72rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
                          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.processing_error || 'Text extraction failed.'}</span>
                        </div>
                      )}

                      {/* Indexing Failure Alert */}
                      {doc.status === 'READY' && doc.indexing_status === 'FAILED' && (
                        <div style={{ padding: '6px 10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.25)', fontSize: '0.72rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem' }}>
                          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.indexing_error || 'Vector indexing failed.'}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Footer: Metadata & Quick Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem', borderTop: '1px solid rgba(255, 255, 255, 0.06)', gap: '0.5rem', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                      <span style={{ fontSize: '0.7rem', color: '#71717a' }}>
                        {uploaderName} • {new Date(doc.created_at).toLocaleDateString()}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {doc.status === 'READY' && (
                          <button 
                            className="btn-card-action secondary" 
                            style={{ padding: '4px 9px', fontSize: '0.72rem' }}
                            onClick={() => openPreview(doc)}
                            title="View Extracted Text and Chunks"
                          >
                            <Eye size={13} /> View
                          </button>
                        )}
                        {doc.status === 'FAILED' && (
                          <button 
                            className="btn-card-action secondary" 
                            style={{ padding: '4px 9px', fontSize: '0.72rem', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}
                            onClick={e => handleRetryExtraction(doc.id, e)}
                            disabled={retryingId === doc.id}
                          >
                            <RotateCw size={12} className={retryingId === doc.id ? 'animate-spin' : ''} /> Retry
                          </button>
                        )}
                        {doc.status === 'READY' && doc.indexing_status === 'FAILED' && (
                          <button 
                            className="btn-card-action secondary" 
                            style={{ padding: '4px 9px', fontSize: '0.72rem', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}
                            onClick={e => handleRetryIndexing(doc.id, e)}
                            disabled={retryingIndexId === doc.id}
                          >
                            <RotateCw size={12} className={retryingIndexId === doc.id ? 'animate-spin' : ''} /> Retry Index
                          </button>
                        )}
                        <button 
                          className="btn-card-action secondary" 
                          style={{ padding: '4px 8px', fontSize: '0.72rem' }}
                          onClick={e => handleDownload(doc, e)} 
                          title="Download File"
                        >
                          <Download size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: AI SEMANTIC PASSAGE SEARCH */}
      {activeTab === 'search' && (
        <div className="semantic-search-panel">
          {/* Command Hero Search Card */}
          <div className="semantic-search-hero-card">
            <div className="semantic-hero-header">
              <div className="semantic-hero-title-group">
                <div className="semantic-hero-icon">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h3 className="semantic-hero-title">AI Semantic Passage Search</h3>
                  <p className="semantic-hero-desc">
                    Search inside the text of your uploaded project documents using natural language questions.
                  </p>
                </div>
              </div>

              {/* Match Precision & Limit Settings */}
              <div className="semantic-settings-group">
                <div className="semantic-setting-item">
                  <label htmlFor="semantic-precision-select" style={{ fontWeight: 600 }}>Precision:</label>
                  <div style={{ minWidth: 190 }}>
                    <SelectBox
                      size="sm"
                      id="semantic-precision-select"
                      value={semanticSensitivity}
                      onValueChange={val => setSemanticSensitivity(val as any)}
                      disabled={semanticLoading}
                      options={[
                        { value: 'balanced', label: 'Balanced (Recommended)' },
                        { value: 'strict', label: 'High Precision (Strict)' },
                        { value: 'permissive', label: 'Broad Search (Permissive)' },
                      ]}
                    />
                  </div>
                </div>

                <div className="semantic-setting-item">
                  <label htmlFor="semantic-limit-select" style={{ fontWeight: 600 }}>Results:</label>
                  <div style={{ minWidth: 110 }}>
                    <SelectBox
                      size="sm"
                      id="semantic-limit-select"
                      value={String(semanticLimit)}
                      onValueChange={val => setSemanticLimit(Number(val))}
                      disabled={semanticLoading}
                      options={[
                        { value: '3', label: 'Top 3' },
                        { value: '5', label: 'Top 5' },
                        { value: '10', label: 'Top 10' },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Interactive Search Bar */}
            <form onSubmit={e => { e.preventDefault(); handleExecuteSemanticSearch(); }}>
              <div className="semantic-search-box">
                <Search size={18} color="#71717a" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  className="semantic-search-input"
                  placeholder="Ask a question or enter concepts (e.g. 'What are the system architecture components?')..."
                  value={semanticQuery}
                  onChange={e => setSemanticQuery(e.target.value)}
                  maxLength={1000}
                  disabled={semanticLoading}
                  id="semantic-search-input"
                />
                {semanticQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="semantic-btn-clear"
                    disabled={semanticLoading}
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  className="semantic-btn-submit"
                  disabled={semanticLoading || !semanticQuery.trim()}
                  id="btn-run-semantic-search"
                >
                  {semanticLoading ? (
                    <><div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Searching...</>
                  ) : (
                    <><Sparkles size={15} /> Search Passages</>
                  )}
                </button>
              </div>
            </form>

            {/* Clickable Suggestion Prompt Chips */}
            <div className="semantic-prompt-suggestions">
              <span className="semantic-prompt-label">
                <Compass size={13} />
                Try searching for:
              </span>
              <div className="semantic-prompt-chips-row">
                {SUGGESTED_PROMPTS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="semantic-prompt-chip"
                    onClick={() => handleExecuteSemanticSearch(p.query)}
                    disabled={semanticLoading}
                  >
                    <Sparkles size={12} />
                    <span>{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Error Banner */}
            {semanticError && (
              <div className="mt-2 p-3 rounded-lg bg-surface-hover border border-danger/40 text-xs text-danger flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{semanticError}</span>
                </div>
                <button 
                  className="btn btn-ghost btn-sm text-xs" 
                  onClick={() => handleExecuteSemanticSearch()}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Search Loading State */}
          {semanticLoading && (
            <ThinkingLoader
              state="searching"
              size={64}
              message="Generating vector embeddings & querying pgvector..."
              description="Analyzing semantic cosine similarity across document passages"
            />
          )}

          {/* Search Results Display */}
          {!semanticLoading && semanticResults !== null && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: '#a1a1aa', padding: '0 4px', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span>
                  Found <strong>{semanticResults.length}</strong> matching {semanticResults.length === 1 ? 'passage' : 'passages'} for: <strong style={{ color: '#ffffff' }}>"{lastSearchedQuery}"</strong>
                </span>
                <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                  Threshold: Distance ≤ {appliedThreshold} ({semanticSensitivity === 'strict' ? 'Strict' : semanticSensitivity === 'permissive' ? 'Broad' : 'Balanced'})
                </span>
              </div>

              {semanticResults.length === 0 ? (
                <div className="empty-state py-12">
                  <Compass size={32} className="text-muted mb-2" />
                  <h4 className="empty-state-title">No matching passages found</h4>
                  <p className="text-muted text-sm max-w-md">
                    No passages in your documents met the current precision threshold for "{lastSearchedQuery}".
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleExecuteSemanticSearch(lastSearchedQuery, 'permissive')}
                    >
                      <Sparkles size={14} /> Try Broad Search
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={handleClearSearch}
                    >
                      Clear Search
                    </button>
                  </div>
                </div>
              ) : (
                <div className="search-results-list">
                  {semanticResults.map((item, idx) => {
                    const isCopied = copiedPassageId === item.chunk_id;
                    return (
                      <div key={item.chunk_id} className="search-result-card">
                        <div className="search-result-card-header">
                          <div className="search-result-doc-info">
                            <span className="search-result-rank">#{idx + 1}</span>
                            <div style={{ padding: '5px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FileText size={16} color="#818cf8" />
                            </div>
                            <span 
                              className="search-result-filename" 
                              title={`Click to view ${item.document_filename}`}
                              style={{ cursor: 'pointer' }}
                              onClick={() => openPreviewById(item.document_id, 'chunks')}
                            >
                              {item.document_filename}
                            </span>
                            <span className="search-result-chunk-tag">
                              Chunk #{item.chunk_index + 1}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {renderRelevanceBadge(item)}
                          </div>
                        </div>

                        {/* Passage Quote with Accent Left Border */}
                        <div className="search-passage-quote">
                          {item.content}
                        </div>

                        {/* Bottom Actions Bar */}
                        <div className="search-result-actions-bar">
                          <span>{item.char_count} characters</span>

                          <div className="search-result-btns">
                            <button
                              className="btn-passage-action"
                              onClick={() => handleCopyPassage(item)}
                              title="Copy Passage Text"
                            >
                              {isCopied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
                              <span>{isCopied ? 'Copied!' : 'Copy Passage'}</span>
                            </button>

                            <button
                              className="btn-passage-action"
                              onClick={() => openPreviewById(item.document_id, 'chunks')}
                              title="View Document Chunks in Modal"
                            >
                              <Eye size={13} />
                              <span>View Context</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Initial State before searching */}
          {!semanticLoading && semanticResults === null && (
            <div className="empty-state py-10" style={{ background: 'rgba(20, 20, 24, 0.5)', border: '1px dashed rgba(255, 255, 255, 0.08)', borderRadius: '16px' }}>
              <div className="empty-state-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: '#818cf8' }}>
                <Sparkles size={24} />
              </div>
              <h3 className="empty-state-title">Ask anything across your project documents</h3>
              <p className="text-muted text-sm max-w-md text-center">
                Search specifications, reports, schemas, and meeting notes using vector similarity. Click one of the suggested prompts above or type your own question.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Extracted Text & Vector Chunks Preview Modal */}
      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="modal-content" style={{ maxWidth: '52rem' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-surface-active rounded-lg shrink-0">
                  {getFileIcon(previewDoc.content_type, previewDoc.filename)}
                </div>
                <div className="min-w-0">
                  <h3 className="card-title truncate" title={previewDoc.filename}>
                    {previewDoc.filename}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {renderExtractionBadge(previewDoc)}
                    {renderIndexingBadge(previewDoc)}
                    <span className="text-xs text-muted">
                      {formatSize(previewDoc.file_size)}
                    </span>
                  </div>
                </div>
              </div>

              <button 
                className="btn-icon btn-ghost" 
                onClick={() => setPreviewDoc(null)}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              {/* Tab Selector: Extracted Text vs Vector Chunks */}
              <div className="tab-list">
                <button 
                  className={`tab-btn ${previewTab === 'text' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('text')}
                >
                  <FileText size={14} className="inline mr-1.5" />
                  Extracted Text {previewData?.extracted_chars ? `(${previewData.extracted_chars.toLocaleString()} chars)` : ''}
                </button>
                <button 
                  className={`tab-btn ${previewTab === 'chunks' ? 'active' : ''}`}
                  onClick={() => setPreviewTab('chunks')}
                >
                  <Layers size={14} className="inline mr-1.5" />
                  Vector Chunks ({chunksList.length})
                </button>
              </div>

              {previewTab === 'text' ? (
                previewLoading ? (
                  <ThinkingLoader
                    state="working"
                    size={32}
                    message="Retrieving extracted document text..."
                  />
                ) : previewData?.status === 'FAILED' ? (
                  <div className="p-4 rounded-lg bg-surface-hover border border-danger/30 text-sm text-danger flex flex-col gap-3">
                    <div className="flex items-center gap-2 font-medium">
                      <AlertTriangle size={18} />
                      <span>Document text extraction failed</span>
                    </div>
                    <p className="text-xs text-muted">
                      {previewData.processing_error || 'No readable text could be retrieved for this file.'}
                    </p>
                    <div>
                      <button 
                        className="btn btn-secondary text-xs" 
                        onClick={() => handleRetryExtraction(previewDoc.id)}
                        disabled={retryingId === previewDoc.id}
                      >
                        <RotateCw size={13} className={`mr-1 ${retryingId === previewDoc.id ? 'animate-spin' : ''}`} /> 
                        Retry Extraction
                      </button>
                    </div>
                  </div>
                ) : previewData?.extracted_text ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>
                        Processed on {previewData.processed_at ? new Date(previewData.processed_at).toLocaleString() : 'N/A'}
                      </span>
                      <button 
                        className="btn btn-ghost text-xs" 
                        onClick={handleCopyText}
                        title="Copy Extracted Text"
                      >
                        {copied ? (
                          <><Check size={14} className="mr-1 text-success" /> Copied!</>
                        ) : (
                          <><Copy size={14} className="mr-1" /> Copy Text</>
                        )}
                      </button>
                    </div>
                    <pre className="code-preview-block">
                      {previewData.extracted_text}
                    </pre>
                  </div>
                ) : (
                  <div className="empty-state py-12">
                    <p className="text-muted text-sm">No text content available for this document.</p>
                  </div>
                )
              ) : (
                /* Vector Chunks Tab */
                chunksLoading ? (
                  <ThinkingLoader
                    state="searching"
                    size={32}
                    message="Loading vector chunks & embeddings..."
                  />
                ) : chunksList.length === 0 ? (
                  <div className="p-6 rounded-lg bg-surface-hover border border-border-subtle flex flex-col items-center justify-center gap-3 text-center">
                    <Layers size={28} className="text-muted" />
                    <div>
                      <h4 className="text-sm font-medium text-primary">No Vector Chunks Available</h4>
                      <p className="text-xs text-muted mt-1 max-w-sm">
                        {previewDoc.indexing_status === 'PROCESSING' 
                          ? 'Vector embeddings are currently being generated in the background...'
                          : previewDoc.indexing_status === 'FAILED'
                          ? `Indexing failed: ${previewDoc.indexing_error || 'Unknown error'}`
                          : 'Document has not been chunked or indexed yet.'}
                      </p>
                    </div>
                    {previewDoc.indexing_status === 'FAILED' && (
                      <button 
                        className="btn btn-secondary text-xs" 
                        onClick={() => handleRetryIndexing(previewDoc.id)}
                        disabled={retryingIndexId === previewDoc.id}
                      >
                        <RotateCw size={13} className={`mr-1 ${retryingIndexId === previewDoc.id ? 'animate-spin' : ''}`} /> 
                        Retry Indexing
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3" style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                    <div className="flex items-center justify-between text-xs text-muted px-1">
                      <span>Total {chunksList.length} indexed chunks (384-dimensional vectors stored)</span>
                      <span>Configured window: ~800-1000 chars</span>
                    </div>
                    {chunksList.map(chunk => (
                      <div key={chunk.id} className="chunk-item">
                        <div className="chunk-header">
                          <span className="font-semibold text-primary">
                            Chunk #{chunk.chunk_index + 1}
                          </span>
                          <span className="opacity-80">
                            {chunk.char_count} characters
                          </span>
                        </div>
                        <p className="text-xs text-secondary leading-relaxed whitespace-pre-wrap font-mono">
                          {chunk.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="modal-footer">
              <button 
                className="btn btn-secondary text-sm" 
                onClick={() => handleDownload(previewDoc)}
              >
                <Download size={14} className="mr-1.5" /> Download File
              </button>
              <button 
                className="btn btn-primary text-sm" 
                onClick={() => setPreviewDoc(null)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentLibrary;
