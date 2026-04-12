// Analysis prompt builder for AI-curated session summaries

import type { SessionDigest, AnalysisSectionType } from '../../shared/analysisTypes'

// --- Constants ---

const MAX_PROMPTS = 20
const MAX_ERRORS = 10
const MAX_FILE_CHANGES = 50
const MAX_GIT_OPERATIONS = 20

// --- Valid section types ---

export const VALID_SECTION_TYPES: AnalysisSectionType[] = [
  'summary',
  'changes',
  'key-moments',
  'next-steps',
  'decisions',
  'action-items',
  'open-questions',
]

// --- System instructions ---

const SYSTEM_INSTRUCTIONS = `You are a session analyst. Your job is to analyze a developer session digest and produce a structured summary.

Return ONLY valid JSON matching this schema:
{
  "sections": [
    {
      "type": "<section-type>",
      "title": "<human-readable title>",
      "content": <section-specific content object>
    }
  ]
}

Section types and their content shapes:

- "summary": { "text": "<concise paragraph summarizing the session>" }

- "changes": { "files": [{ "path": "<file path>", "changeType": "created" | "modified" | "deleted" }] }

- "key-moments": { "moments": [{ "timestamp": "<ISO timestamp>", "description": "<what happened>" }] }

- "next-steps": { "items": ["<step 1>", "<step 2>", ...] }

- "decisions": { "decisions": [{ "decision": "<what was decided>", "rationale": "<why>" }] }

- "action-items": { "items": [{ "text": "<task description>", "completed": true | false }] }

- "open-questions": { "questions": ["<question 1>", "<question 2>", ...] }

Rules:
1. Always include "summary" as the first section.
2. Omit sections that are not relevant to the session content.
3. Use the exact hyphenated type names shown above (e.g., "key-moments", not "key_moments").
4. Return ONLY the JSON object — no markdown, no explanation, no code fences.
5. Keep summaries concise but include actual details from the session.
6. Base all content strictly on the provided digest data.

Example output:
{
  "sections": [
    {
      "type": "summary",
      "title": "Session Summary",
      "content": { "text": "Fixed the authentication bug in the login flow and added unit tests." }
    },
    {
      "type": "changes",
      "title": "Files Changed",
      "content": {
        "files": [
          { "path": "src/auth.ts", "changeType": "modified" },
          { "path": "tests/auth.test.ts", "changeType": "created" }
        ]
      }
    },
    {
      "type": "next-steps",
      "title": "Next Steps",
      "content": { "items": ["Deploy to staging", "Request code review"] }
    }
  ]
}

Analyze the following session digest and return the JSON summary:`

// --- Truncation ---

function truncateDigest(digest: SessionDigest): SessionDigest {
  // Truncate prompts
  let prompts = digest.prompts
  if (prompts.length > MAX_PROMPTS) {
    const overflow = prompts.length - MAX_PROMPTS
    prompts = [
      ...prompts.slice(0, MAX_PROMPTS),
      { text: `... and ${overflow} more prompts`, timestamp: '' },
    ]
  }

  // Truncate errors
  const errors =
    digest.errors.length > MAX_ERRORS ? digest.errors.slice(0, MAX_ERRORS) : digest.errors

  // Truncate filesChanged
  const filesChanged =
    digest.filesChanged.length > MAX_FILE_CHANGES
      ? digest.filesChanged.slice(0, MAX_FILE_CHANGES)
      : digest.filesChanged

  // Truncate gitOperations
  const gitOperations =
    digest.gitOperations.length > MAX_GIT_OPERATIONS
      ? digest.gitOperations.slice(0, MAX_GIT_OPERATIONS)
      : digest.gitOperations

  return { ...digest, prompts, errors, filesChanged, gitOperations }
}

// --- Public API ---

export function buildAnalysisPrompt(digest: SessionDigest): string {
  const truncated = truncateDigest(digest)
  const digestJson = JSON.stringify(truncated, null, 2)
  return `${SYSTEM_INSTRUCTIONS}\n\n${digestJson}`
}
