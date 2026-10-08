# Testing Rules

## General Principle

A feature is NOT considered complete merely because the code compiles.

A feature is complete only when:

1. Code runs without syntax errors
2. Database operations work
3. API works
4. Frontend works
5. End-to-end user flow works
6. No obvious console/network errors remain

## Before Declaring Completion

Always:

1. Start required services.
2. Test the API.
3. Test the browser flow where applicable.
4. Check browser console.
5. Check network/API failures.
6. Verify database persistence.

## Backend Testing

Test:

- Services
- Business rules
- Authentication
- Authorization
- API Endpoints

Important security cases:

- Unauthenticated request
- Invalid JWT
- Unauthorized workspace access

## Frontend Testing

Test important:

- Pages
- Forms
- Loading states
- Error states
- Empty states

## AI Testing

Test:

- Valid prompts
- Invalid prompts
- LLM failure
- Malformed AI output
- Unauthorized tool calls
- Tool execution failure

## AI Tool Calling

Never assume AI tool calls are valid.

Validate:

- Tool name
- Arguments
- User permissions
- Resource ownership
- Required confirmation

Example:

AI requests:

```json
{
  "name": "create_task",
  "arguments": {
    "projectId": "abc",
    "title": "..."
  }
}
```

Backend must independently verify that the user can modify project "abc".