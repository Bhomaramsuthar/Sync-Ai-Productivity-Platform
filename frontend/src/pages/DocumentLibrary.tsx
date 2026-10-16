import { useState, useEffect, useRef } from 'react';
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
  Clock, Copy, Check, X, Eye, Layers, Sparkles, Compass, Info, MessageSquare
} from 'lucide-react';

export const DocumentLibrary = ({ project }: { project: Project }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'documents' | 'search'>('documents');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryingIndexId, setRetryingIndexId] = useState<string | null>(null);

  // Semantic Search state
  const [semanticQuery, setSemanticQuery] = useState('');
  const [semanticLimit, setSemanticLimit] = useState(5);
  const [semanticSensitivity, setSemanticSensitivity] = useState<'balanced' | 'strict' | 'permissive'>('balanced');
  const [appliedThreshold, setAppliedThreshold] = useState<number>(0.45);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResultItem[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [semanticError, setSemanticError] = useState<string | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');

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
      const res = await documentService.list(project.id, search || undefined);
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
  }, [project.id, search]);

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
      alert("File is too large. Maximum size is 10MB.");
      return;
    }

    setUploading(true);
    try {
      await documentService.upload(project.id, file);
      await loadDocuments(false);
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || "Failed to upload document");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRetryExtraction = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRetryingId(docId);
    try {
      await documentService.retry(docId);
      await loadDocuments(false);
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || "Failed to retry document processing");
    } finally {
      setRetryingId(null);
    }
  };

  const handleRetryIndexing = async (docId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRetryingIndexId(docId);
    try {
      await documentService.retryIndexing(docId);
      await loadDocuments(false);
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || "Failed to retry document indexing");
    } finally {
      setRetryingIndexId(null);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this document? All associated vector embeddings will also be removed.')) return;
    try {
      await documentService.delete(id);
      await loadDocuments(false);
      if (previewDoc?.id === id) {
        setPreviewDoc(null);
        setPreviewData(null);
        setChunksList([]);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || "Failed to delete document");
    }
  };

  const handleDownload = async (doc: Document, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await documentService.get(doc.id);
      if (res.data.download_url) {
        window.open(res.data.download_url, '_blank');
      } else {
        alert("Download URL not available");
      }
    } catch (err: any) {
      alert("Failed to get download link");
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
      alert("Failed to load document content.");
    }
  };

  const handleSemanticSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const queryTrimmed = semanticQuery.trim();
    if (!queryTrimmed) {
      setSemanticError("Please enter a question or query.");
      return;
    }
    if (queryTrimmed.length > 1000) {
      setSemanticError("Query exceeds maximum length of 1,000 characters.");
      return;
    }

    setSemanticLoading(true);
    setSemanticError(null);
    try {
      const maxDistance = semanticSensitivity === 'strict' ? 0.35 : semanticSensitivity === 'permissive' ? 0.55 : 0.45;
      const res = await documentService.search(project.id, {
        query: queryTrimmed,
        limit: semanticLimit,
        max_distance: maxDistance
      });
      setSemanticResults(res.data.results);
      if (res.data.threshold !== undefined) {
        setAppliedThreshold(res.data.threshold);
      }
      setLastSearchedQuery(queryTrimmed);
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

  const renderRelevanceBadge = (item: SemanticSearchResultItem) => {
    const tier = item.relevance_tier || (item.distance <= 0.25 ? 'strong' : item.distance <= 0.40 ? 'moderate' : 'marginal');
    const approxPct = Math.round(item.similarity_score * 100);
    const tooltip = `Cosine distance: ${item.distance.toFixed(4)} | Approx. vector similarity: ${(item.similarity_score * 100).toFixed(1)}%. Note: Measures semantic vector proximity, not factual accuracy or confidence.`;

    if (tier === 'strong') {
      return (
        <span className="badge badge-success flex items-center gap-1 text-xs" title={tooltip}>
          <CheckCircle2 size={11} />
          Strong Match (~{approxPct}%)
        </span>
      );
    }
    if (tier === 'moderate') {
      return (
        <span className="badge badge-primary flex items-center gap-1 text-xs" title={tooltip}>
          <Sparkles size={11} />
          Moderate Match (~{approxPct}%)
        </span>
      );
    }
    return (
      <span className="badge badge-neutral flex items-center gap-1 text-xs" title={tooltip}>
        <Info size={11} />
        Marginal Match (~{approxPct}%)
      </span>
    );
  };

  const handleCopyText = () => {
    if (!previewData?.extracted_text) return;
    navigator.clipboard.writeText(previewData.extracted_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getFileIcon = (contentType: string, filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'pdf' || contentType.includes('pdf')) return <FileText size={22} className="text-primary" />;
    if (ext === 'docx' || contentType.includes('word')) return <FileText size={22} style={{ color: '#60a5fa' }} />;
    if (ext === 'csv' || contentType.includes('csv')) return <FileText size={22} style={{ color: '#34d399' }} />;
    if (ext === 'md' || contentType.includes('markdown')) return <FileText size={22} style={{ color: '#a78bfa' }} />;
    return <File size={22} className="text-muted" />;
  };

  const renderExtractionBadge = (doc: Document) => {
    switch (doc.status) {
      case 'READY':
        return (
          <span className="badge badge-success flex items-center gap-1" title="Text extracted successfully">
            <CheckCircle2 size={12} />
            <span>Text Ready</span>
            {doc.extracted_chars ? <span className="opacity-80">({doc.extracted_chars.toLocaleString()} c)</span> : null}
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="badge badge-warning flex items-center gap-1" title="Extracting text">
            <RotateCw size={12} className="animate-spin" />
            <span>Extracting...</span>
          </span>
        );
      case 'UPLOADED':
        return (
          <span className="badge badge-neutral flex items-center gap-1">
            <Clock size={12} />
            <span>Queued</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-danger flex items-center gap-1" title="Extraction failed">
            <AlertCircle size={12} />
            <span>Extraction Failed</span>
          </span>
        );
      default:
        return <span className="badge badge-neutral">{doc.status}</span>;
    }
  };

  const renderIndexingBadge = (doc: Document) => {
    const status = doc.indexing_status || 'PENDING';
    switch (status) {
      case 'READY':
        return (
          <span className="badge badge-primary flex items-center gap-1" style={{ backgroundColor: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', borderColor: 'rgba(99, 102, 241, 0.4)' }} title="Vectors generated and stored in PostgreSQL">
            <Sparkles size={12} />
            <span>Indexed ({doc.chunk_count || 0} chunks)</span>
          </span>
        );
      case 'PROCESSING':
        return (
          <span className="badge badge-warning flex items-center gap-1" title="Generating embeddings">
            <RotateCw size={12} className="animate-spin" />
            <span>Indexing...</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="badge badge-danger flex items-center gap-1" title={doc.indexing_error || "Indexing failed"}>
            <AlertTriangle size={12} />
            <span>Indexing Failed</span>
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="badge badge-neutral flex items-center gap-1" title="Pending chunking and vector indexing">
            <Clock size={12} />
            <span>Index Pending</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & View Navigation */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-2 bg-surface-active p-1 rounded-lg">
          <button 
            className={`btn btn-sm ${activeTab === 'documents' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('documents')}
          >
            <FileText size={15} className="mr-1.5" />
            Document Library ({documents.length})
          </button>
          <button 
            className={`btn btn-sm ${activeTab === 'search' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('search')}
          >
            <Sparkles size={15} className="mr-1.5" />
            Semantic Search
          </button>
          <button 
            className="btn btn-sm btn-ghost"
            onClick={() => navigate(`/projects/${project.id}/chat`)}
            title="Chat with documents using conversational RAG"
          >
            <MessageSquare size={15} className="mr-1.5 text-primary" />
            Document Chat
          </button>
        </div>

        {activeTab === 'documents' && (
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-xs text-muted hidden md:inline">
              PDF, TXT, MD, DOCX, CSV (Max 10MB)
            </span>
            <input 
              type="file" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept=".pdf,.txt,.md,.docx,.csv"
            />
            <button 
              className="btn btn-primary whitespace-nowrap" 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <><div className="spinner mr-2" style={{width: 14, height: 14, borderWidth: 2}}></div> Uploading...</>
              ) : (
                <><Upload size={16} className="mr-1.5" /> Upload Document</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* VIEW 1: DOCUMENT LIBRARY */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
              <input 
                className="form-input" 
                style={{ paddingLeft: '2.5rem' }}
                placeholder="Filter document filename..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
              />
            </div>
            
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('search')}
            >
              <Sparkles size={14} className="mr-1.5 text-accent" /> Search Passages with AI
            </button>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted gap-4">
              <div className="spinner"></div>
              <p>Loading document library...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <FileText size={24} />
              </div>
              <h3 className="empty-state-title">No documents yet</h3>
              <p className="text-muted text-sm max-w-md">
                Upload PDFs, Markdown specs, DOCX reports, or CSV spreadsheets. Text will be extracted, chunked, and embedded automatically.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map(doc => (
                <div 
                  key={doc.id} 
                  className="card hover:border-primary/50 transition-colors group flex flex-col justify-between"
                  style={{ cursor: doc.status === 'READY' ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (doc.status === 'READY') openPreview(doc);
                  }}
                >
                  <div className="card-body">
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 bg-surface-active rounded-lg shrink-0">
                        {getFileIcon(doc.content_type, doc.filename)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="font-medium text-primary truncate" title={doc.filename}>
                            {doc.filename}
                          </h4>
                        </div>

                        {/* Dual Status Badges: Extraction + Vector Indexing */}
                        <div className="mt-2.5 mb-2 flex flex-wrap gap-1.5 items-center">
                          {renderExtractionBadge(doc)}
                          {doc.status === 'READY' && renderIndexingBadge(doc)}
                        </div>

                        <div className="flex flex-col gap-0.5 text-xs text-muted">
                          <span>Size: {formatSize(doc.file_size)}</span>
                          <span>By: {members.find(m => m.user_id === doc.uploader_id)?.user_name || 'Project Member'}</span>
                          <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                        </div>

                        {/* Extraction Failure Alert */}
                        {doc.status === 'FAILED' && (
                          <div className="mt-3 p-2.5 rounded bg-surface-hover border border-danger/30 text-xs text-danger flex items-start gap-2">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                            <span className="flex-1 leading-snug">
                              {doc.processing_error || 'Text extraction failed.'}
                            </span>
                          </div>
                        )}

                        {/* Indexing Failure Alert */}
                        {doc.status === 'READY' && doc.indexing_status === 'FAILED' && (
                          <div className="mt-3 p-2.5 rounded bg-surface-hover border border-danger/30 text-xs text-danger flex items-start gap-2">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                            <span className="flex-1 leading-snug">
                              {doc.indexing_error || 'Vector indexing failed.'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="card-footer flex items-center justify-between py-2.5 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {doc.status === 'READY' && (
                        <button 
                          className="btn btn-ghost text-xs" 
                          onClick={() => openPreview(doc)}
                          title="View Extracted Text and Chunks"
                        >
                          <Eye size={14} className="mr-1" /> View Content
                        </button>
                      )}
                      {doc.status === 'FAILED' && (
                        <button 
                          className="btn btn-secondary text-xs" 
                          onClick={e => handleRetryExtraction(doc.id, e)}
                          disabled={retryingId === doc.id}
                          title="Retry Text Extraction"
                        >
                          <RotateCw size={13} className={`mr-1 ${retryingId === doc.id ? 'animate-spin' : ''}`} /> 
                          {retryingId === doc.id ? 'Retrying...' : 'Retry Extraction'}
                        </button>
                      )}
                      {doc.status === 'READY' && doc.indexing_status === 'FAILED' && (
                        <button 
                          className="btn btn-secondary text-xs" 
                          onClick={e => handleRetryIndexing(doc.id, e)}
                          disabled={retryingIndexId === doc.id}
                          title="Retry Vector Indexing"
                        >
                          <RotateCw size={13} className={`mr-1 ${retryingIndexId === doc.id ? 'animate-spin' : ''}`} /> 
                          {retryingIndexId === doc.id ? 'Indexing...' : 'Retry Indexing'}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button 
                        className="btn btn-ghost text-xs" 
                        onClick={e => handleDownload(doc, e)} 
                        title="Download File"
                      >
                        <Download size={14} className="mr-1" /> Download
                      </button>
                      <button 
                        className="btn-icon btn-ghost text-danger opacity-0 group-hover:opacity-100 transition-opacity" 
                        onClick={e => handleDelete(doc.id, e)} 
                        title="Delete Document and Chunks"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SEMANTIC SEARCH */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Header Form */}
          <div className="card p-5 border-border-subtle">
            <form onSubmit={handleSemanticSearch} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-primary flex items-center gap-2">
                    <Sparkles size={18} className="text-accent-primary" />
                    Semantic Document Search
                  </h3>
                  <p className="text-xs text-muted mt-0.5">
                    Search document passages using PostgreSQL pgvector similarity and FastEmbed embeddings.
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <label htmlFor="sensitivity-select" className="text-xs text-muted">Relevance:</label>
                    <select 
                      id="sensitivity-select"
                      className="form-input text-xs py-1 px-2"
                      value={semanticSensitivity}
                      onChange={e => setSemanticSensitivity(e.target.value as 'balanced' | 'strict' | 'permissive')}
                      disabled={semanticLoading}
                      title="Threshold filtering: Balanced excludes unrelated passages (dist > 0.45), Strict requires high precision (dist > 0.35), Permissive allows broad matches (dist > 0.55)"
                    >
                      <option value="balanced">Balanced (≤ 0.45)</option>
                      <option value="strict">Strict (≤ 0.35)</option>
                      <option value="permissive">Permissive (≤ 0.55)</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label htmlFor="limit-select" className="text-xs text-muted">Limit:</label>
                    <select 
                      id="limit-select"
                      className="form-input text-xs py-1 px-2"
                      value={semanticLimit}
                      onChange={e => setSemanticLimit(Number(e.target.value))}
                      disabled={semanticLoading}
                    >
                      <option value={3}>Top 3</option>
                      <option value={5}>Top 5</option>
                      <option value={10}>Top 10</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={17} />
                  <input
                    type="text"
                    className="form-input w-full"
                    style={{ paddingLeft: '2.75rem' }}
                    placeholder="Ask a question or enter keywords (e.g. 'What are the system architecture components?')..."
                    value={semanticQuery}
                    onChange={e => setSemanticQuery(e.target.value)}
                    maxLength={1000}
                    disabled={semanticLoading}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn btn-primary whitespace-nowrap"
                  disabled={semanticLoading || !semanticQuery.trim()}
                >
                  {semanticLoading ? (
                    <><div className="spinner mr-2" style={{ width: 14, height: 14, borderWidth: 2 }}></div> Searching...</>
                  ) : (
                    <><Sparkles size={15} className="mr-1.5" /> Search</>
                  )}
                </button>

                {semanticResults !== null && (
                  <button 
                    type="button" 
                    className="btn btn-ghost whitespace-nowrap"
                    onClick={handleClearSearch}
                    disabled={semanticLoading}
                  >
                    Clear
                  </button>
                )}
              </div>
            </form>

            {/* Error Banner */}
            {semanticError && (
              <div className="mt-4 p-3 rounded-lg bg-surface-hover border border-danger/40 text-xs text-danger flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{semanticError}</span>
                </div>
                <button 
                  className="btn btn-ghost btn-sm text-xs" 
                  onClick={() => handleSemanticSearch()}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Search Loading State */}
          {semanticLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
              <div className="spinner"></div>
              <p className="text-sm">Generating vector embedding and querying pgvector similarity...</p>
            </div>
          )}

          {/* Search Results Display */}
          {!semanticLoading && semanticResults !== null && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted px-1 flex-wrap gap-2">
                <span>
                  Found <strong>{semanticResults.length}</strong> relevant {semanticResults.length === 1 ? 'passage' : 'passages'} for: <em>"{lastSearchedQuery}"</em>
                </span>
                <span className="font-mono text-[11px] opacity-80">
                  Threshold: Distance ≤ {appliedThreshold}
                </span>
              </div>

              {semanticResults.length === 0 ? (
                <div className="empty-state py-12">
                  <Compass size={28} className="text-muted mb-2" />
                  <h4 className="empty-state-title">No sufficiently relevant passages found</h4>
                  <p className="text-muted text-sm max-w-md">
                    No document passages in this project met the relevance threshold (cosine distance ≤ {appliedThreshold}) for your question. Try rephrasing your question or uploading relevant documents.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {semanticResults.map((item, idx) => (
                    <div key={item.chunk_id} className="search-result-card">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-neutral text-xs font-mono font-bold">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-primary text-sm flex items-center gap-1.5">
                            <FileText size={15} className="text-primary" />
                            {item.document_filename}
                          </span>
                          <span className="badge badge-neutral text-xs">
                            Chunk #{item.chunk_index + 1}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {renderRelevanceBadge(item)}
                          <button
                            className="btn btn-ghost btn-sm text-xs"
                            onClick={() => openPreviewById(item.document_id, 'chunks')}
                            title="View document chunks in modal"
                          >
                            <Eye size={13} className="mr-1" /> View Context
                          </button>
                        </div>
                      </div>

                      <div className="search-passage-quote font-mono">
                        {item.content}
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted mt-2.5 pt-2 border-t border-border-subtle flex-wrap gap-2">
                        <span>Length: {item.char_count} chars</span>
                        <span title="Cosine distance from pgvector (<=>). Values <= threshold are retained.">
                          Distance: <strong>{item.distance}</strong> (Threshold: ≤ {appliedThreshold})
                        </span>
                        <span className="italic opacity-70 hidden sm:inline text-[11px]">
                          Vector proximity, not factual certainty
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Initial State before searching */}
          {!semanticLoading && semanticResults === null && (
            <div className="empty-state py-16">
              <div className="empty-state-icon">
                <Sparkles size={26} className="text-accent-primary" />
              </div>
              <h3 className="empty-state-title">Search Project Documents with AI</h3>
              <p className="text-muted text-sm max-w-lg text-center">
                Query requirements, specifications, meeting notes, and project documents using vector similarity. FastEmbed generates 384-dimensional embeddings and Supabase pgvector retrieves the closest matching passages.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Extracted Text & Vector Chunks Preview Modal */}
      {previewDoc && (
        <div className="modal-overlay" onClick={() => setPreviewDoc(null)}>
          <div className="modal-content" style={{ maxWidth: '48rem' }} onClick={e => e.stopPropagation()}>
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
                  <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
                    <div className="spinner"></div>
                    <p className="text-sm">Retrieving extracted document text...</p>
                  </div>
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
                  <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
                    <div className="spinner"></div>
                    <p className="text-sm">Loading vector chunks...</p>
                  </div>
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
