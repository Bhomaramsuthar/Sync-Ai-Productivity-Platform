import io
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.rag.embeddings.mock_provider import MockEmbeddingProvider
from app.rag.embeddings.fastembed_provider import FastEmbedProvider
from app.rag.embeddings.base import EmbeddingError
from app.rag.embeddings.factory import set_embedding_provider
from app.core.database import SessionLocal
from app.documents.service import process_document

@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c

@pytest.fixture
def test_user(client: TestClient):
    email = f"search_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Search User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def other_user(client: TestClient):
    email = f"search_other_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Other User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post("/api/v1/workspaces", json={"name": "Search Workspace", "description": "Test"}, headers=test_user["headers"])
    ws = res.json()
    yield ws
    # Teardown workspace to prevent orphaned rows
    try:
        client.delete(f"/api/v1/workspaces/{ws['id']}", headers=test_user["headers"])
    except Exception:
        pass

@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "Search Project"}, headers=test_user["headers"])
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
    """Default unit tests to deterministic mock embeddings."""
    mock_prov = MockEmbeddingProvider(dimension=384, model_name="mock-deterministic")
    set_embedding_provider(mock_prov)
    yield
    set_embedding_provider(None)


# ==============================================================================
# Semantic Search Tests
# ==============================================================================

def test_semantic_search_valid(client: TestClient, test_user, project, mock_storage):
    """Verifies semantic search returns ranked document chunks with valid metadata."""
    auth_doc_content = "Authentication and Security System. The platform utilizes JWT tokens and bcrypt password hashing for session control."
    db_doc_content = "Database and Storage Architecture. PostgreSQL with pgvector stores document chunks, and Supabase Storage stores raw uploads."

    # Upload document 1
    file1 = ("auth_guide.txt", io.BytesIO(auth_doc_content.encode("utf-8")), "text/plain")
    res1 = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file1}, headers=test_user["headers"])
    doc1_id = res1.json()["id"]

    # Upload document 2
    file2 = ("db_architecture.txt", io.BytesIO(db_doc_content.encode("utf-8")), "text/plain")
    res2 = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file2}, headers=test_user["headers"])
    doc2_id = res2.json()["id"]

    # Process and index both documents
    db = SessionLocal()
    try:
        process_document(db, doc1_id)
        process_document(db, doc2_id)
    finally:
        db.close()

    # Search for authentication with permissive mock threshold
    search_payload = {"query": "How does JWT user authentication work?", "limit": 5, "max_distance": 2.0}
    search_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json=search_payload,
        headers=test_user["headers"]
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["project_id"] == project["id"]
    assert data["query"] == "How does JWT user authentication work?"
    assert data["threshold"] == 2.0
    assert data["results_count"] >= 1
    assert len(data["results"]) <= 5

    # Check top result metadata
    top_result = data["results"][0]
    assert "chunk_id" in top_result
    assert "document_id" in top_result
    assert "document_filename" in top_result
    assert "content" in top_result
    assert "similarity_score" in top_result
    assert "distance" in top_result
    assert "relevance_tier" in top_result
    assert "char_count" in top_result
    assert "created_at" in top_result
    assert isinstance(top_result["similarity_score"], float)
    assert isinstance(top_result["distance"], float)
    assert top_result["relevance_tier"] in ("strong", "moderate", "marginal")


def test_semantic_search_empty_and_oversized_queries(client: TestClient, test_user, project):
    """Verifies that empty, whitespace-only, and oversized queries are rejected safely."""
    # Empty query
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": ""},
        headers=test_user["headers"]
    )
    assert res.status_code in (400, 422)

    # Whitespace only
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "    \n\t  "},
        headers=test_user["headers"]
    )
    assert res.status_code == 400
    assert res.json()["detail"]["error"]["code"] == "EMPTY_QUERY"

    # Query exceeding 1000 characters
    long_query = "word " * 250  # > 1000 characters
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": long_query},
        headers=test_user["headers"]
    )
    assert res.status_code in (400, 422)


def test_semantic_search_limit_boundaries(client: TestClient, test_user, project, mock_storage):
    """Verifies limit parameter boundaries."""
    # Limit 3
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "general search query", "limit": 3},
        headers=test_user["headers"]
    )
    assert res.status_code == 200
    assert len(res.json()["results"]) <= 3

    # Limit 0 or > 10 rejected or clamped
    res_invalid = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "test query", "limit": 0},
        headers=test_user["headers"]
    )
    assert res_invalid.status_code in (400, 422)


def test_semantic_search_no_matching_chunks(client: TestClient, test_user, project):
    """Verifies searching an empty project returns an empty list without error."""
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "non-existent concept in empty project", "limit": 5},
        headers=test_user["headers"]
    )
    assert res.status_code == 200
    data = res.json()
    assert data["results_count"] == 0
    assert data["results"] == []


def test_semantic_search_excludes_failed_and_unindexed_documents(client: TestClient, test_user, project, mock_storage):
    """Verifies that chunks from FAILED documents are never returned."""
    valid_content = "Production document text for indexing."
    file_valid = ("valid.txt", io.BytesIO(valid_content.encode("utf-8")), "text/plain")
    res_valid = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_valid}, headers=test_user["headers"])
    valid_doc_id = res_valid.json()["id"]

    # Also upload a document that will fail text extraction
    file_empty = ("empty.txt", io.BytesIO(b""), "text/plain")
    res_empty = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_empty}, headers=test_user["headers"])
    empty_doc_id = res_empty.json()["id"]

    db = SessionLocal()
    try:
        process_document(db, valid_doc_id)
        process_document(db, empty_doc_id)
    finally:
        db.close()

    search_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "Production document", "limit": 5},
        headers=test_user["headers"]
    )
    assert search_res.status_code == 200
    results = search_res.json()["results"]
    doc_ids_returned = {r["document_id"] for r in results}
    assert empty_doc_id not in doc_ids_returned


def test_semantic_search_cross_project_and_unauthenticated_isolation(client: TestClient, test_user, other_user, project):
    """Verifies unauthenticated users and cross-project members cannot access search."""
    # 1. Unauthenticated request
    unauth_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "test query"}
    )
    assert unauth_res.status_code in (401, 403)

    # 2. Other user tries to search test_user's project
    cross_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "confidential data"},
        headers=other_user["headers"]
    )
    assert cross_res.status_code == 403


def test_semantic_search_provider_failure_handling(client: TestClient, test_user, project):
    """Verifies provider failure returns a clean HTTP 500 error without exposing stack traces."""
    failing_prov = MockEmbeddingProvider(dimension=384)
    failing_prov.should_fail = True
    failing_prov.failure_message = "Upstream provider timeout"
    set_embedding_provider(failing_prov)

    res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "testing provider outage"},
        headers=test_user["headers"]
    )
    assert res.status_code == 500
    detail = res.json()["detail"]
    assert detail["error"]["code"] == "EMBEDDING_FAILURE"


def test_semantic_search_relevant_query_retrieves_matching_passage(client: TestClient, test_user, project, mock_storage):
    """Integration test: A relevant query retrieves its matching passage using real FastEmbed."""
    set_embedding_provider(FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dimension=384))

    website_content = "How to improve website — Typography, Spacing, Micro-interactions, Clean Layouts, and Responsive Design."
    file_tuple = ("website_guide.txt", io.BytesIO(website_content.encode("utf-8")), "text/plain")
    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    db = SessionLocal()
    try:
        process_document(db, doc_id)
    finally:
        db.close()

    # Search with a relevant query
    search_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "How to improve website typography and fonts?", "limit": 5},
        headers=test_user["headers"]
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["results_count"] == 1
    assert data["threshold"] == 0.45
    top = data["results"][0]
    assert "Typography" in top["content"]
    assert top["distance"] <= 0.45
    assert top["similarity_score"] >= 0.55
    assert top["relevance_tier"] in ("strong", "moderate")


def test_semantic_search_unrelated_query_returns_no_results(client: TestClient, test_user, project, mock_storage):
    """
    Integration test: Unrelated query against website document returns 0 results
    due to distance threshold filtering (resolves printing-press false positive).
    """
    set_embedding_provider(FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dimension=384))

    website_content = "How to improve website — Typography, Spacing, Micro-interactions, Clean Layouts, and Responsive Design."
    file_tuple = ("website_design.txt", io.BytesIO(website_content.encode("utf-8")), "text/plain")
    res = client.post(f"/api/v1/projects/{project['id']}/documents", files={"file": file_tuple}, headers=test_user["headers"])
    doc_id = res.json()["id"]

    db = SessionLocal()
    try:
        process_document(db, doc_id)
    finally:
        db.close()

    # Query completely unrelated to website design
    search_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "Who invented the printing press?", "limit": 5},
        headers=test_user["headers"]
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["results_count"] == 0
    assert data["results"] == []
    assert data["threshold"] == 0.45


def test_semantic_search_mixed_relevance_excludes_irrelevant_chunks(client: TestClient, test_user, project, mock_storage):
    """
    Integration test: In a project with both website design and history documents,
    querying the printing press returns ONLY the history document and excludes the website design.
    """
    set_embedding_provider(FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dimension=384))

    website_content = "How to improve website — Typography, Spacing, Micro-interactions, Clean Layouts, and Responsive Design."
    history_content = "Johannes Gutenberg invented the movable type printing press around 1440 in Mainz, Germany, revolutionizing information sharing."

    res_web = client.post(
        f"/api/v1/projects/{project['id']}/documents",
        files={"file": ("web.txt", io.BytesIO(website_content.encode("utf-8")), "text/plain")},
        headers=test_user["headers"]
    )
    res_hist = client.post(
        f"/api/v1/projects/{project['id']}/documents",
        files={"file": ("gutenberg.txt", io.BytesIO(history_content.encode("utf-8")), "text/plain")},
        headers=test_user["headers"]
    )

    db = SessionLocal()
    try:
        process_document(db, res_web.json()["id"])
        process_document(db, res_hist.json()["id"])
    finally:
        db.close()

    # Query for the printing press
    search_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "Who invented the printing press?", "limit": 5},
        headers=test_user["headers"]
    )
    assert search_res.status_code == 200
    data = search_res.json()
    assert data["results_count"] == 1
    # Only Gutenberg document is returned
    assert data["results"][0]["document_filename"] == "gutenberg.txt"
    assert "Johannes Gutenberg" in data["results"][0]["content"]
    assert data["results"][0]["distance"] <= 0.45
    # The website document is NOT returned
    filenames = [r["document_filename"] for r in data["results"]]
    assert "web.txt" not in filenames


def test_semantic_search_custom_threshold_override(client: TestClient, test_user, project, mock_storage):
    """Integration test: Client can override the default threshold using max_distance or similarity_threshold."""
    set_embedding_provider(FastEmbedProvider(model_name="BAAI/bge-small-en-v1.5", dimension=384))

    website_content = "How to improve website — Typography, Spacing, Micro-interactions."
    res = client.post(
        f"/api/v1/projects/{project['id']}/documents",
        files={"file": ("site.txt", io.BytesIO(website_content.encode("utf-8")), "text/plain")},
        headers=test_user["headers"]
    )
    db = SessionLocal()
    try:
        process_document(db, res.json()["id"])
    finally:
        db.close()

    # 1. Permissive override allows marginal result (distance ~0.60)
    perm_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "Who invented the printing press?", "max_distance": 0.70},
        headers=test_user["headers"]
    )
    assert perm_res.status_code == 200
    assert perm_res.json()["threshold"] == 0.70
    assert perm_res.json()["results_count"] == 1

    # 2. Strict override excludes marginal result
    strict_res = client.post(
        f"/api/v1/projects/{project['id']}/documents/search",
        json={"query": "Who invented the printing press?", "max_distance": 0.30},
        headers=test_user["headers"]
    )
    assert strict_res.status_code == 200
    assert strict_res.json()["threshold"] == 0.30
    assert strict_res.json()["results_count"] == 0
