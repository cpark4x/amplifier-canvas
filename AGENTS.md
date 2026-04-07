# Amplifier Canvas — Agent Playbook

How we work on Canvas. Read this at session start.

## Session Start Checklist

1. Read `STATE.yaml` — know what's done, what's next, what's blocked
2. Read `LESSONS.md` — don't repeat known mistakes
3. Read the relevant plan in `docs/plans/` — know the task breakdown

## Build Rules

### Pre-Commit Gate (non-negotiable)

Before EVERY commit, run:

```bash
npm run build && npx playwright test
```

Both must pass. No exceptions. If a test fails, fix it before committing.

### Feature Workflow

1. Feature spec exists before implementation starts
2. Write the E2E test first (TDD)
3. Verify the test fails
4. Write minimal implementation to pass the test
5. Verify all tests pass
6. Commit with descriptive message
7. Update `STATE.yaml` (mark feature done)

### Stop Conditions

- **Stop on blocker** — don't work around it. Mark it blocked in STATE.yaml.
- **Stop on ambiguity** — don't guess. Surface the question.
- **Stop on repeated failure (3x)** — it's architectural, not implementational. Step back.
- **Stop on coherence loss** — exit cleanly, update STATE.yaml and LESSONS.md.

## Plan Structure

This is Plan 1A of 3:
- **Plan 1A:** Scaffold + Terminal (T1-T5) ← you are here
- **Plan 1B:** Sidebar (S1-S5)
- **Plan 1C:** Viewer + Integration (V1-V5, I1-I3)

Each plan ends with an antagonistic review checkpoint.

## Key Architecture Facts

- **Two-process model:** Main process (Node.js) owns I/O. Renderer process (Chromium) owns UI.
- **IPC is the API:** Main and renderer talk via Electron IPC channels.
- **Canvas reads, Amplifier writes:** Canvas never modifies Amplifier's data.