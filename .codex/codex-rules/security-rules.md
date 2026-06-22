# Security Rules

## Scope

Apply these rules across frontend, backend, full-stack, React, Next.js, Node.js, and TypeScript projects.

## Required

- Never hardcode secrets, API keys, credentials, private tokens, or sensitive configuration.
- Use environment variables or the project's approved secret-management system for sensitive configuration.
- Validate and sanitize untrusted input at API, server, and persistence boundaries.
- Treat all client input as untrusted.
- Use HTTPS for external API calls unless a trusted local development exception applies.
- Never expose server-only secrets to client-side code.
- Avoid logging secrets, tokens, passwords, session values, or sensitive personal data.
- Fail safely when authorization, validation, or security checks cannot be completed.

## Secrets And Configuration

- Keep secrets out of source code, test fixtures, logs, screenshots, and committed config files.
- Use public environment variables only for values that are safe to expose to the browser.
- For Next.js, treat variables prefixed with `NEXT_PUBLIC_` as public client-exposed values.
- Rotate any secret that may have been committed, logged, or exposed.
- Prefer centralized configuration loading and validation.

## Input Validation

- Validate request payloads before processing.
- Validate query params, route params, headers, cookies, form data, and uploaded files when used.
- Validate on the server even if validation also exists on the client.
- Prefer schema validation where the project already uses or permits it.
- Sanitize output or escape content when rendering user-generated content.

## Authentication And Authorization

- Authentication verifies who the user is.
- Authorization verifies what the user is allowed to access or change.
- Do not rely on client-side checks for authorization.
- Enforce authorization at server, API, or data-access boundaries.
- Check ownership and permissions before reading, updating, or deleting protected resources.
- Use secure session and token handling patterns already established by the project.

## Route Handlers And APIs

- Apply CORS deliberately when exposing cross-origin endpoints.
- Do not add permissive CORS policies unless the route genuinely requires them.
- Restrict allowed origins, methods, and headers to the smallest practical set.
- Validate request payloads before processing.
- Avoid leaking internal error details to clients.
- Use appropriate HTTP status codes.
- Rate-limit or otherwise protect sensitive, expensive, or abuse-prone endpoints when the project supports it.

## Data Protection

- Minimize collection and exposure of sensitive data.
- Return only the fields needed by the caller.
- Avoid sending privileged internal fields to clients.
- Use parameterized queries or the project's ORM/query builder protections for database access.
- Avoid building raw queries from untrusted strings.

## File Uploads

When handling uploads:

- Validate file type, size, and extension.
- Do not trust client-provided MIME types alone.
- Store uploaded files in approved storage locations.
- Avoid executing or directly serving untrusted uploaded files unless explicitly safe.
- Generate server-controlled file names when practical.

## Error Handling And Logging

- Do not expose stack traces, internal exception messages, secrets, tokens, or implementation details to users.
- Log security-relevant failures with safe context.
- Avoid duplicate noisy logs that hide important security events.
- Use the project's existing monitoring and alerting tools when available.

## Dependencies

- Prefer maintained, trusted dependencies.
- Avoid adding new dependencies for simple security-sensitive logic unless they are clearly justified.
- Follow project tooling for vulnerability checks and dependency updates.
- Be careful with packages that affect authentication, cryptography, request parsing, uploads, or serialization.

## Review Checklist

- Are secrets kept out of code and client bundles?
- Is untrusted input validated at the server/API boundary?
- Are authentication and authorization enforced server-side?
- Are internal errors hidden from clients?
- Is CORS as restrictive as practical?
- Are logs useful without exposing sensitive data?
- Are database queries protected from injection?
- Are uploaded files validated and handled safely?
- Does the change avoid unnecessary sensitive data exposure?
