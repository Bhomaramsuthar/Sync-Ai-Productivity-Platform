import io
import uuid
import pytest
import docx
import pypdf
from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.documents.extractor import extract_text, ExtractionError

@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c

@pytest.fixture
def test_user(client: TestClient):
    email = f"doc_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Doc User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def other_user(client: TestClient):
    email = f"other_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Other User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post("/api/v1/workspaces", json={"name": "Doc Workspace", "description": "Test"}, headers=test_user["headers"])
    return res.json()

@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "Doc Project"}, headers=test_user["headers"])
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

def make_valid_pdf_bytes(text: str) -> bytes:
    content = f"BT /F1 12 Tf 72 712 Td ({text}) Tj ET\n".encode("latin1")
    body = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/MediaBox[0 0 300 144]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj\n"
        b"4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        + f"5 0 obj<</Length {len(content)}>>stream\n".encode("latin1")
        + content
        + b"endstream\nendobj\n"
    )
    offsets = [0] + [body.find(f"{i} 0 obj".encode("ascii")) for i in range(1, 6)]
    xref = b"xref\n0 6\n0000000000 65535 f \n" + b"".join(f"{off:010d} 00000 n \n".encode("ascii") for off in offsets[1:])
    return body + xref + f"trailer<</Size 6/Root 1 0 R>>\nstartxref\n{len(body)}\n%%EOF".encode("ascii")

def make_blank_pdf_bytes() -> bytes:
    writer = pypdf.PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

def make_docx_bytes(paragraphs: list[str]) -> bytes:
    doc = docx.Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()

# ==================== TESTS ====================

def test_document_upload_and_txt_extraction(client: TestClient, test_user, project, mock_storage):
    file_content = b"Line 1: System requirements\nLine 2: Performance benchmarks\nLine 3: Implementation guide"
    files = {"file": ("requirements.txt", io.BytesIO(file_content), "text/plain")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    # Retrieve text endpoint
    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    data = text_res.json()
    assert data["status"] == "READY"
    assert "System requirements" in data["extracted_text"]
    assert data["extracted_chars"] > 0

    # Retrieve status endpoint
    status_res = client.get(f"/api/v1/documents/{doc_id}/status", headers=test_user["headers"])
    assert status_res.status_code == 200
    assert status_res.json()["status"] == "READY"
    assert status_res.json()["processing_error"] is None

def test_document_markdown_extraction(client: TestClient, test_user, project, mock_storage):
    file_content = b"# Architecture\n\n## Monolith Core\n- FastAPI\n- PostgreSQL\n- Supabase"
    files = {"file": ("arch.md", io.BytesIO(file_content), "text/markdown")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    assert text_res.json()["status"] == "READY"
    assert "Monolith Core" in text_res.json()["extracted_text"]

def test_document_csv_extraction(client: TestClient, test_user, project, mock_storage):
    file_content = b"Task,Owner,Status\nAuth,Alice,Done\nDocuments,Bob,In Progress\nCalendar,Charlie,Done"
    files = {"file": ("sprint.csv", io.BytesIO(file_content), "text/csv")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    assert text_res.json()["status"] == "READY"
    assert "Task | Owner | Status" in text_res.json()["extracted_text"]
    assert "Documents | Bob | In Progress" in text_res.json()["extracted_text"]

def test_document_docx_extraction(client: TestClient, test_user, project, mock_storage):
    docx_bytes = make_docx_bytes(["Chapter 1: Project Overview", "Chapter 2: Text Extraction Architecture"])
    files = {"file": ("spec.docx", io.BytesIO(docx_bytes), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    assert text_res.json()["status"] == "READY"
    assert "Chapter 1: Project Overview" in text_res.json()["extracted_text"]

def test_document_pdf_extraction(client: TestClient, test_user, project, mock_storage):
    pdf_bytes = make_valid_pdf_bytes("Deep Learning and Full Stack Roadmap 2026")
    files = {"file": ("roadmap.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    assert text_res.json()["status"] == "READY"
    assert "Deep Learning and Full Stack Roadmap 2026" in text_res.json()["extracted_text"]

def test_document_empty_file_fails_safely(client: TestClient, test_user, project, mock_storage):
    files = {"file": ("empty.txt", io.BytesIO(b""), "text/plain")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    data = text_res.json()
    assert data["status"] == "FAILED"
    assert "empty" in data["processing_error"].lower()

def test_document_scanned_pdf_without_text_fails_safely(client: TestClient, test_user, project, mock_storage):
    blank_pdf = make_blank_pdf_bytes()
    files = {"file": ("scanned.pdf", io.BytesIO(blank_pdf), "application/pdf")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    data = text_res.json()
    assert data["status"] == "FAILED"
    assert "OCR" in data["processing_error"] or "No extractable text" in data["processing_error"]

def test_document_corrupted_pdf_fails_safely(client: TestClient, test_user, project, mock_storage):
    corrupt_bytes = b"NOT_A_REAL_PDF_HEADER_DATA_CORRUPT"
    files = {"file": ("corrupt.pdf", io.BytesIO(corrupt_bytes), "application/pdf")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 201
    doc_id = res.json()["id"]

    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    data = text_res.json()
    assert data["status"] == "FAILED"
    assert "corrupted" in data["processing_error"].lower() or "invalid" in data["processing_error"].lower()

def test_document_unsupported_file_type(client: TestClient, test_user, project):
    files = {"file": ("app.exe", io.BytesIO(b"MZ\x90\x00"), "application/x-msdownload")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    assert res.status_code == 400
    assert "not allowed" in res.json()["detail"]["error"]["message"]

def test_document_retry_processing(client: TestClient, test_user, project, mock_storage):
    # Upload corrupted file first
    files = {"file": ("retry_doc.txt", io.BytesIO(b""), "text/plain")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    doc_id = res.json()["id"]
    doc_data = res.json()

    # Check status is FAILED
    status_res = client.get(f"/api/v1/documents/{doc_id}/status", headers=test_user["headers"])
    assert status_res.json()["status"] == "FAILED"

    # Now update mock storage with valid content
    for key in list(mock_storage.keys()):
        if "retry_doc.txt" in key:
            mock_storage[key] = b"Recovered document content successfully processed!"

    # Trigger retry
    retry_res = client.post(f"/api/v1/documents/{doc_id}/retry", headers=test_user["headers"])
    assert retry_res.status_code == 200

    # Verify status changed to READY
    text_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert text_res.status_code == 200
    assert text_res.json()["status"] == "READY"
    assert "Recovered document content" in text_res.json()["extracted_text"]

def test_document_authorization_and_cross_workspace_isolation(client: TestClient, test_user, other_user, project, mock_storage):
    files = {"file": ("secret.txt", io.BytesIO(b"Confidential project data"), "text/plain")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    doc_id = res.json()["id"]

    # Authorized user can access
    auth_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=test_user["headers"])
    assert auth_res.status_code == 200

    # Other user from different workspace cannot access (403 or 404)
    unauth_res = client.get(f"/api/v1/documents/{doc_id}/text", headers=other_user["headers"])
    assert unauth_res.status_code in (403, 404)

    # Unauthenticated request returns 401
    no_auth_res = client.get(f"/api/v1/documents/{doc_id}/text")
    assert no_auth_res.status_code == 401

def test_document_list_download_and_delete_regressions(client: TestClient, test_user, project, mock_storage):
    files = {"file": ("regression.txt", io.BytesIO(b"Regression check content"), "text/plain")}
    res = client.post(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"], files=files)
    doc_id = res.json()["id"]

    # List documents
    list_res = client.get(f"/api/v1/projects/{project['id']}/documents", headers=test_user["headers"])
    assert list_res.status_code == 200
    doc_items = [d for d in list_res.json() if d["id"] == doc_id]
    assert len(doc_items) == 1
    assert doc_items[0]["status"] == "READY"

    # Get single document with download url
    single_res = client.get(f"/api/v1/documents/{doc_id}", headers=test_user["headers"])
    assert single_res.status_code == 200
    assert single_res.json()["download_url"] is not None

    # Delete document
    del_res = client.delete(f"/api/v1/documents/{doc_id}", headers=test_user["headers"])
    assert del_res.status_code == 204

    # Deleted document returns 404
    get_del = client.get(f"/api/v1/documents/{doc_id}", headers=test_user["headers"])
    assert get_del.status_code == 404
