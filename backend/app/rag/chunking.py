from dataclasses import dataclass
from typing import List
from app.core.config import settings

@dataclass
class TextChunk:
    chunk_index: int
    content: str
    char_count: int
    start_char: int
    end_char: int

def chunk_text(
    text: str,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None
) -> List[TextChunk]:
    """
    Paragraph- and line-aware text chunker with configurable size and overlap.
    
    Splits text into meaningful semantic windows (~800-1000 characters)
    with smooth overlap (~100-150 characters), preserving paragraph, line, 
    sentence, and word boundaries where practical.
    
    Handles short texts, empty strings, whitespace-only inputs, and long documents.
    Guarantees non-empty chunks and sequential chunk indices starting at 0.
    """
    if not text:
        return []

    # Clean leading/trailing outer whitespace
    cleaned = text.strip()
    if not cleaned:
        return []

    # Fall back to configured settings if not passed
    size = chunk_size if chunk_size is not None else settings.CHUNK_SIZE
    overlap = chunk_overlap if chunk_overlap is not None else settings.CHUNK_OVERLAP

    # Defensive boundary constraints
    if size < 50:
        size = 50
    if overlap >= size:
        overlap = max(0, size // 5)

    text_len = len(cleaned)

    # Fast path for short texts that comfortably fit in a single chunk
    if text_len <= size:
        return [
            TextChunk(
                chunk_index=0,
                content=cleaned,
                char_count=text_len,
                start_char=0,
                end_char=text_len
            )
        ]

    chunks: List[TextChunk] = []
    start = 0
    chunk_idx = 0

    while start < text_len:
        end = min(start + size, text_len)

        # If not at the end of the document, search for the best boundary in the final 30% of the window
        if end < text_len:
            search_start = max(start + overlap, end - int(size * 0.3))
            
            # 1. Paragraph boundary (\n\n)
            break_pos = cleaned.rfind("\n\n", search_start, end)
            
            # 2. Line boundary (\n)
            if break_pos == -1:
                break_pos = cleaned.rfind("\n", search_start, end)
                
            # 3. Sentence boundary (". ", "! ", "? ")
            if break_pos == -1:
                for punct in (". ", "! ", "? "):
                    pos = cleaned.rfind(punct, search_start, end)
                    if pos != -1 and pos > break_pos:
                        break_pos = pos + 1  # Include the punctuation mark
                        
            # 4. Word boundary (space)
            if break_pos == -1:
                break_pos = cleaned.rfind(" ", search_start, end)
                
            # If a clean boundary was found, snap the chunk end to it
            if break_pos != -1:
                end = break_pos

        chunk_content = cleaned[start:end].strip()
        if chunk_content:
            chunks.append(
                TextChunk(
                    chunk_index=chunk_idx,
                    content=chunk_content,
                    char_count=len(chunk_content),
                    start_char=start,
                    end_char=end
                )
            )
            chunk_idx += 1

        if end >= text_len:
            break

        # Calculate start of next chunk with overlap
        new_start = max(start + 1, end - overlap)

        # Avoid starting next chunk in the middle of a word if possible
        if new_start < end and cleaned[new_start - 1].isalnum() and cleaned[new_start].isalnum():
            next_space = cleaned.find(" ", new_start, end)
            if next_space != -1:
                new_start = next_space + 1

        # Prevent infinite loop if boundary doesn't advance
        if new_start <= start:
            new_start = end

        start = new_start

    return chunks
