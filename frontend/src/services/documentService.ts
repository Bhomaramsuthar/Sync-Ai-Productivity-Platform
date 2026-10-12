import api from './api';

export interface Document {
  id: string;
  project_id: string;
  uploader_id: string | null;
  filename: string;
  content_type: string;
  file_size: number;
  status: string;
  extracted_chars?: number;
  processing_error?: string | null;
  processed_at?: string | null;
  indexing_status?: string;
  indexing_error?: string | null;
  indexed_at?: string | null;
  chunk_count?: number;
  created_at: string;
  download_url: string | null;
}

export interface DocumentTextResponse {
  id: string;
  filename: string;
  status: string;
  extracted_text: string | null;
  extracted_chars: number;
  processed_at: string | null;
  processing_error: string | null;
}

export interface DocumentStatusResponse {
  id: string;
  status: string;
  extracted_chars: number;
  processing_error: string | null;
  processed_at: string | null;
  indexing_status?: string;
  indexing_error?: string | null;
  indexed_at?: string | null;
  chunk_count?: number;
}

export interface ChunkMetadata {
  id: string;
  document_id: string;
  project_id: string;
  chunk_index: number;
  content: string;
  char_count: number;
  created_at: string;
}

export interface DocumentChunksListResponse {
  document_id: string;
  indexing_status: string;
  chunk_count: number;
  chunks: ChunkMetadata[];
}

export interface IndexingStatusResponse {
  document_id: string;
  indexing_status: string;
  chunk_count: number;
  indexing_error: string | null;
  indexed_at: string | null;
}

export interface SemanticSearchResultItem {
  chunk_id: string;
  document_id: string;
  document_filename: string;
  chunk_index: number;
  content: string;
  similarity_score: number;
  distance: number;
  relevance_tier?: 'strong' | 'moderate' | 'marginal';
  char_count: number;
  created_at: string;
}

export interface SemanticSearchResponse {
  project_id: string;
  query: string;
  threshold?: number;
  results_count: number;
  results: SemanticSearchResultItem[];
}

export interface SemanticSearchRequest {
  query: string;
  limit?: number;
  max_distance?: number;
  similarity_threshold?: number;
}

export const documentService = {
  list: (projectId: string, search?: string) => 
    api.get<Document[]>(`/projects/${projectId}/documents`, { params: { search } }),
    
  upload: (projectId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<Document>(`/projects/${projectId}/documents`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
    
  get: (docId: string) => api.get<Document>(`/documents/${docId}`),

  getStatus: (docId: string) => api.get<DocumentStatusResponse>(`/documents/${docId}/status`),

  getText: (docId: string) => api.get<DocumentTextResponse>(`/documents/${docId}/text`),

  retry: (docId: string) => api.post<Document>(`/documents/${docId}/retry`),

  getIndexingStatus: (docId: string) => api.get<IndexingStatusResponse>(`/documents/${docId}/indexing-status`),

  retryIndexing: (docId: string) => api.post<IndexingStatusResponse>(`/documents/${docId}/retry-indexing`),

  getChunks: (docId: string) => api.get<DocumentChunksListResponse>(`/documents/${docId}/chunks`),

  search: (projectId: string, data: SemanticSearchRequest) =>
    api.post<SemanticSearchResponse>(`/projects/${projectId}/documents/search`, data),
  
  delete: (docId: string) => api.delete(`/documents/${docId}`)
};
