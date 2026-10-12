import io
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.rag.chunking import chunk_text, TextChunk
from app.rag.embeddings.mock_provider import MockEmbeddingProvider
from app.rag.embeddings.fastembed_provider import FastEmbedProvider
from app.rag.embeddings.base import EmbeddingError
from app.rag.embeddings.factory import set_embedding_provider, get_embedding_provider
from app.documents.models import Document
from app.rag.models import DocumentChunk
from app.core.database import SessionLocal

@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c

@pytest.fixture
def test_user(client: TestClient):
    email = f"rag_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "RAG User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def other_user(client: TestClient):
    email = f"rag_other_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Other User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post("/api/v1/workspaces", json={"name": "RAG Workspace", "description": "Test"}, headers=test_user["headers"])
    return res.json()

@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "RAG Project"}, headers=test_user["headers"])
    return res.json()

@pytest.fixture
def mock_storage(monkeypatch):
    storage_dict = {}

    def mock_upload(file_bytes, filename, content_type):
        key = f"mock/{uuid.uuid4()}_{filename}"
        storage_dict[key] = file_bytes
        return key

    def mock_download(path):
        if path not in storage_dict:
            raise Exception("Object not found in mock storage")
        return storage_dict[path]

    def mock_get_url(path):
        return f"https://mock-signed-url.com/{path}"

    def mock_delete(path):
        storage_dict.pop(path, None)

    monkeypatch.setattr("app.documents.service.upload_file", mock_upload)
    monkeypatch.setattr("app.documents.service.download_file", mock_download)
    monkeypatch.setattr("app.documents.service.get_signed_url", mock_get_url)
    monkeypatch.setattr("app.documents.service.delete_file", mock_delete)

    return storage_dict

@pytest.fixture(autouse=True)
def use_mock_embeddings():
    """Ensure test suite defaults to deterministic mock embeddings."""
    mock_prov = MockEmbeddingProvider(dimension=384, model_name="mock-deterministic")
    set_embedding_provider(mock_prov)
    yield
    set_embedding_provider(None)


# ==============================================================================
# Unit Tests: Text Chunking
# ==============================================================================

def test_chunking_empty_and_whitespace():
    assert chunk_text("") == []
    assert chunk_text("   \n\t   \n") == []
    assert chunk_text(None) == []

def test_chunking_short_text():
    short = "This is a single short sentence."
    chunks = chunk_text(short, chunk_size=500, chunk_overlap=50)
    assert len(chunks) == 1
    assert chunks[0].chunk_index == 0
    assert chunks[0].content == short
    assert chunks[0].char_count == len(short)

def test_chunking_paragraphs_and_overlap():
    p1 = "Paragraph 1 is about AI platform architectures and scalable system designs. " * 8
    p2 = "Paragraph 2 details the PostgreSQL vector storage, indexing, and embeddings. " * 8
    p3 = "Paragraph 3 explains FastAPI routing, Alembic migrations, and security models. " * 8
    full_text = f"{p1}\n\n{p2}\n\n{p3}"

    chunks = chunk_text(full_text, chunk_size=600, chunk_overlap=100)
    assert len(chunks) > 1

    # Indices must be strictly monotonic starting at 0
    for idx, chunk in enumerate(chunks):
        assert chunk.chunk_index == idx
        assert len(chunk.content) > 0
        assert len(chunk.content) <= 750  # Snapping allows slight flexibility

    # Overlap verification: subsequent chunk content should share words with previous chunk
    chunk_0_words = set(chunks[0].content.split()[-10:])
    chunk_1_words = set(chunks[1].content.split()[:10])
    # Should have some overlapping tokens
    assert len(chunk_0_words.intersection(chunk_1_words)) >= 1

def test_chunking_very_long_document():
    # 20,000 characters
    long_doc = ("Section discussing neural networks and vector spaces. " * 20 + "\n\n") * 15
    chunks = chunk_text(long_doc, chunk_size=800, chunk_overlap=120)
    assert len(chunks) >= 10
    total_text_recovered = " ".join([c.content for c in chunks])
    assert "neural networks" in total_text_recovered


# ==============================================================================
# Unit Tests: Embedding Providers
# ==============================================================================

def test_mock_embedding_provider_deterministic():
    mock = MockEmbeddingProvider(dimension=384)
    assert mock.get_dimension() == 384
    vecs = mock.generate_embeddings(["test document", "test document", "different content"])
    assert len(vecs) == 3
    assert len(vecs[0]) == 384
    assert len(vecs[1]) == 384
    # Deterministic: identical texts give identical vectors
    assert vecs[0] == vecs[1]
    # Different text gives different vector
    assert vecs[0] != vecs[2]

def test_fastembed_provider_local():
    """Verify local FastEmbed ONNX model runs and outputs 384 dimensions."""
    provider = FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dimension=384)
    assert provider.get_dimension() == 384
    vecs = provider.generate_embeddings(["FastEmbed vector integration test."])
    assert len(vecs) == 1
    assert len(vecs[0]) == 384
    assert isinstance(vecs[0][0], float)


# ==============================================================================
# Integration Tests: Pipeline & Endpoints
# ==============================================================================

def test_upload_and_auto_indexing_flow(client: TestClient, test_user, project, mock_storage):
    """Verifies UPLOADED -> text extracted -> READY -> chunked and indexed automatically."""
    content = "Antigravity AI Platform.\n\nThis is a test document covering Week 9 chunking and vector storage."
    file_tuple = ("platform_spec.txt", io.BytesIO(content.encode("utf-8")), "text/plain")

    res = client.post(
        f"/api/v1/projects/{project['id']}/documents",
        files={"file": file_tuple},
        headers=test_user["headers"]
    )
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # In test environment, manually trigger background processing or verify
    from app.documents.service import process_document
    db = SessionLocal()
    try:
        process_document(db, doc_id)
    finally:
        db.close()

    # Query document status
    status_res = client.get(f"/api/v1/documents/{doc_id}/status", headers=test_user["headers"])
    assert status_res.status_code == 200
    status_data = status_res.json()
    assert status_data["status"] == "READY"
    assert status_data["indexing_status"] == "READY"
    assert status_data["chunk_count"] >= 1
    assert status_data["indexing_error"] is None

    # Query chunk metadata endpoint
    chunks_res = client.get(f"/api/v1/documents/{doc_id}/chunks", headers=test_user["headers"])
    assert chunks_res.status_code == 200
    chunks_data = chunks_res.json()
    assert chunks_data["document_id"] == doc_id
    assert chunks_data["indexing_status"] == "READY"
    assert len(chunks_data["chunks"]) == status_data["chunk_count"]
    assert chunks_data["chunks"][0]["chunk_index"] == 0
    assert "Antigravity AI Platform" in chunks_data["chunks"][0]["content"]

def test_idempotent_reindexing(client: TestClient, test_user, project, mock_storage):
    """Verifies that re-indexing does not duplicate chunks."""
    content = "Initial document content for idempotency check.\n\nSecond paragraph."
    file_tuple = ("idempotent.txt", io.BytesIO(content.encode("utf-8")), "text/plain")

    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    from app.documents.service import process_document
    from app.rag.service import index_document
    db = SessionLocal()
    try:
        process_document(db, doc_id)
        first_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count()

        # Run index_document again
        index_document(db, doc_id)
        second_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count()
        assert first_count == second_count
        assert second_count > 0
    finally:
        db.close()

def test_embedding_provider_error_handling(client: TestClient, test_user, project, mock_storage):
    """Verifies that provider errors mark indexing as FAILED with safe error, leaving extraction intact."""
    content = "Document intended to test embedding failure."
    file_tuple = ("fail_embed.txt", io.BytesIO(content.encode("utf-8")), "text/plain")
    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    failing_prov = MockEmbeddingProvider(dimension=384)
    failing_prov.should_fail = True
    failing_prov.failure_message = "Simulated upstream provider timeout"
    set_embedding_provider(failing_prov)

    from app.documents.service import process_document
    db = SessionLocal()
    try:
        process_document(db, doc_id)
    finally:
        db.close()

    # Document extraction succeeded, but indexing failed
    status_res = client.get(f"/api/v1/documents/{doc_id}/status", headers=test_user["headers"])
    assert status_res.status_code == 200
    data = status_res.json()
    assert data["status"] == "READY"
    assert data["indexing_status"] == "FAILED"
    assert "Simulated upstream provider timeout" in data["indexing_error"]

    # Now fix provider and retry indexing
    set_embedding_provider(MockEmbeddingProvider(dimension=384))
    retry_res = client.post(f"/api/v1/documents/{doc_id}/retry-indexing", headers=test_user["headers"])
    assert retry_res.status_code == 200

    # Execute indexing
    from app.rag.service import index_document
    db = SessionLocal()
    try:
        index_document(db, doc_id)
    finally:
        db.close()

    # Verify document is now READY
    status_res = client.get(f"/api/v1/documents/{doc_id}/status", headers=test_user["headers"])
    assert status_res.json()["indexing_status"] == "READY"
    assert status_res.json()["indexing_error"] is None

def test_cascade_delete_chunks_on_document_delete(client: TestClient, test_user, project, mock_storage):
    """Verifies that deleting a document cleans up all associated chunks."""
    content = "Content that will be deleted along with document."
    file_tuple = ("cleanup.txt", io.BytesIO(content.encode("utf-8")), "text/plain")
    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    from app.documents.service import process_document
    db = SessionLocal()
    try:
        process_document(db, doc_id)
        chunks_count = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count()
        assert chunks_count > 0
    finally:
        db.close()

    # Delete document
    del_res = client.delete(f"/api/v1/documents/{doc_id}", headers=test_user["headers"])
    assert del_res.status_code == 204

    # Verify chunks are gone
    db = SessionLocal()
    try:
        post_del_chunks = db.query(DocumentChunk).filter(DocumentChunk.document_id == doc_id).count()
        assert post_del_chunks == 0
    finally:
        db.close()

def test_cross_project_authorization(client: TestClient, test_user, other_user, project, mock_storage):
    """Verifies other workspace/project members cannot access indexing or chunks."""
    content = "Confidential project text chunk."
    file_tuple = ("secret.txt", io.BytesIO(content.encode("utf-8")), "text/plain")
    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    from app.documents.service import process_document
    db = SessionLocal()
    try:
        process_document(db, doc_id)
    finally:
        db.close()

    # Other user tries to access chunks
    chunks_res = client.get(f"/api/v1/documents/{doc_id}/chunks", headers=other_user["headers"])
    assert chunks_res.status_code == 403

    # Other user tries to access indexing status
    status_res = client.get(f"/api/v1/documents/{doc_id}/indexing-status", headers=other_user["headers"])
    assert status_res.status_code == 403

    # Other user tries to retry indexing
    retry_res = client.post(f"/api/v1/documents/{doc_id}/retry-indexing", headers=other_user["headers"])
    assert retry_res.status_code == 403
