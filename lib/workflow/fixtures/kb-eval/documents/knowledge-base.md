# Knowledge Base Engine

## Document Parsing and Size Constraints
The Knowledge Base accepts Markdown (.md) and plain text (.txt) files. Each document must not exceed 1 MB in size, and a project can hold up to 50 documents. Unsupported file types such as PDF or binary images are rejected at upload time with an immediate HTTP 400 Bad Request.

## Heading Aware Chunking
Documents are chunked according to markdown heading boundaries (#, ##, ###). A single chunk aims for a target size of approximately 1,500 characters. Each chunk retains a reference to its nearest heading and maintains a sequential ordinal number starting from zero.

## Content Deduplication and Embedding Cache
When a file is uploaded, a SHA-256 hash is computed for the entire file. If an identical file hash already exists in the project, the ingestion process skips re-processing. During chunking, if an individual chunk's content hash matches an existing chunk with a valid embedding, that embedding vector is reused, avoiding redundant LLM embedding calls and saving quota.

## Hybrid Retrieval Scoring
Search retrieval combines dense vector similarity and lexical keyword matching. Vector similarity is calculated via cosine similarity between query and chunk vectors, weighted at 0.7. Keyword scoring is calculated by normalizing Vietnamese diacritics and computing whole-word matches, weighted at 0.3. The final combined score ranks the top K documents.
