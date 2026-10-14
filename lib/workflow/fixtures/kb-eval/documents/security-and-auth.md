# Security and Isolation

## Project and Owner Multi-Tenant Isolation
All workflows, documents, chunks, and execution runs are strictly partitioned by owner email and project ID. Every database query for retrieval enforces a `where: { projectId }` filter clause. Even if two different projects upload identical documents, project A will never retrieve chunks belonging to project B.

## Storage Isolation and Cleanup Protection
Documents are stored under the prefix `workflow-kb/{projectId}/{documentId}` in Cloudflare R2 or the local `.data/workflow-kb` directory. This prefix is completely isolated from the `uploads/` directory used by blog and portfolio images. The system cleanup job scans only `uploads/`, guaranteeing that workflow documents are never deleted by cleanup routines.

## Atomic Daily Quota Management
To protect LLM costs and prevent abuse, all calls to LLM generation and embedding are wrapped with atomic daily quota tracking. An SQLite transaction checks and increments the daily counter. If the limit is reached, a QuotaExceededError is thrown before calling external APIs, ensuring quota cannot be bypassed by concurrent requests.

## Write Access Route Guarding
All mutating API routes (POST, PUT, PATCH, DELETE) under the workflow API verify authentication using `requireWriteAccess`. Any unauthorized or anonymous request is immediately rejected with a 401 Unauthorized status before any database or storage operations can be invoked.
