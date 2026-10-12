import io
import csv
from typing import Tuple
import pypdf
import docx

MAX_EXTRACTED_CHARS = 500_000

class ExtractionError(Exception):
    """Custom safe exception for document extraction failures."""
    pass

def _decode_bytes(file_bytes: bytes) -> str:
    """Safely decode plain text bytes with fallback encodings."""
    if not file_bytes:
        return ""
    for encoding in ("utf-8", "utf-8-sig", "latin-1", "cp1252"):
        try:
            return file_bytes.decode(encoding)
        except (UnicodeDecodeError, LookupError):
            continue
    raise ExtractionError("Unable to decode file: unsupported character encoding.")

def _extract_pdf(file_bytes: bytes) -> str:
    """Extract text from PDF using pypdf."""
    try:
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
    except Exception as e:
        raise ExtractionError("Unable to read PDF file: file may be corrupted or invalid.")

    if reader.is_encrypted:
        raise ExtractionError("PDF document is encrypted or password-protected.")

    total_pages = len(reader.pages)
    if total_pages == 0:
        raise ExtractionError("PDF document contains no pages.")

    pages_text = []
    for idx, page in enumerate(reader.pages):
        try:
            page_content = page.extract_text() or ""
            if page_content.strip():
                pages_text.append(page_content.strip())
        except Exception:
            # Continue extracting remaining pages if one page fails
            continue

    full_text = "\n\n".join(pages_text).strip()
    if not full_text:
        raise ExtractionError(
            "No extractable text found in PDF. Scanned documents or images without text layer (OCR) are not currently supported."
        )
    return full_text

def _extract_docx(file_bytes: bytes) -> str:
    """Extract text from DOCX using python-docx."""
    try:
        doc = docx.Document(io.BytesIO(file_bytes))
    except Exception:
        raise ExtractionError("Unable to read DOCX file: file may be corrupted or invalid.")

    content_blocks = []
    
    # Extract paragraphs
    for p in doc.paragraphs:
        text = p.text.strip()
        if text:
            content_blocks.append(text)

    # Extract tables
    for table in doc.tables:
        for row in table.rows:
            row_cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if row_cells:
                content_blocks.append(" | ".join(row_cells))

    full_text = "\n\n".join(content_blocks).strip()
    if not full_text:
        raise ExtractionError("DOCX document contains no readable text.")
    return full_text

def _extract_txt(file_bytes: bytes) -> str:
    """Extract text from TXT file."""
    text = _decode_bytes(file_bytes).strip()
    if not text:
        raise ExtractionError("Document is empty and contains no text.")
    return text

def _extract_markdown(file_bytes: bytes) -> str:
    """Extract text from Markdown file while preserving structure."""
    text = _decode_bytes(file_bytes).strip()
    if not text:
        raise ExtractionError("Document is empty and contains no text.")
    return text

def _extract_csv(file_bytes: bytes) -> str:
    """Extract and format text from CSV file."""
    raw_text = _decode_bytes(file_bytes)
    if not raw_text.strip():
        raise ExtractionError("CSV document is empty and contains no data.")

    try:
        reader = csv.reader(io.StringIO(raw_text))
        rows = []
        for row in reader:
            cleaned_row = [col.strip() for col in row if col.strip()]
            if cleaned_row:
                rows.append(" | ".join(cleaned_row))
    except Exception:
        raise ExtractionError("Unable to parse CSV document: malformed rows.")

    full_text = "\n".join(rows).strip()
    if not full_text:
        raise ExtractionError("CSV document contains no readable data rows.")
    return full_text

def extract_text(file_bytes: bytes, filename: str) -> Tuple[str, int]:
    """
    Main extraction dispatcher for supported file types.
    Returns (extracted_text, character_count).
    Enforces maximum text limits and safe error reporting.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise ExtractionError("File is empty (0 bytes).")

    ext = filename.split(".")[-1].lower() if "." in filename else ""

    if ext == "pdf":
        text = _extract_pdf(file_bytes)
    elif ext == "docx":
        text = _extract_docx(file_bytes)
    elif ext == "txt":
        text = _extract_txt(file_bytes)
    elif ext == "md":
        text = _extract_markdown(file_bytes)
    elif ext == "csv":
        text = _extract_csv(file_bytes)
    else:
        raise ExtractionError(f"Unsupported file extension for extraction: .{ext}")

    char_count = len(text)
    if char_count > MAX_EXTRACTED_CHARS:
        text = text[:MAX_EXTRACTED_CHARS] + f"\n\n[Content truncated: reached maximum extraction limit of {MAX_EXTRACTED_CHARS:,} characters]"
        char_count = len(text)

    return text, char_count
