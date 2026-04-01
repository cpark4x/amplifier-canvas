# Navigation Shell (v6 — V5 Baseline + Distinct Header)

## Core Rule
EVERYTHING matches storyboard_v5.png EXACTLY. The ONLY delta is the header bar.

## Palette (unchanged from v5)
- #F9F9F7 — paper white (content, file panels)
- #F2F0EB — warm stone (sidebar, terminal zone)
- #2C2825 — deep warm brown (all primary text)
- #8B8B90 — muted gray (secondary text, metadata)
- #8DAE92 — muted sage green (3px dots, 1px underlines ONLY)

## The ONE Change: Header Bar
- v5 header: transparent/blended — same tone as content beneath, barely visible
- v6 header: a DISTINCT full-width bar with its own subtle background (#F5F3EE — a gentle warm gray, slightly darker than paper white, lighter than stone). NOT stark white. NOT invisible. Like a slightly different paper stock at the top. Spans full width above sidebar + content.
- Height: ~32px
- Content: ‹ toggle + breadcrumb text + panel icons (same as v5 but on this distinct bar)

## Everything Else — Cloned from V5

### Sidebar (identical to v5)
- 200px expanded / 28px collapsed strip / collapsible
- #F2F0EB warm stone. NO border.
- 11px project names, 10px sessions, 9px UPPERCASE tracked labels
- 4-6px gaps. Linear tight.

### Terminal (identical to v5)
- #F2F0EB warm stone background
- 11px monospace, #2C2825 warm brown text
- Muted syntax tones

### Right Panel (identical to v5 + PREVIEW tab)
- #F9F9F7 paper white. NO left border.
- 9px UPPERCASE tracked tab labels
- Active: #2C2825 + 1px #8DAE92 underline
- v6 adds PREVIEW tab alongside FILES and ANALYSIS

### Typography (identical to v5)
- Serif for headlines/editorial. Sans for UI.
- UPPERCASE + wide tracking for labels.
- Weight 400-500 only.

### Projects
- Team Pulse — sessions: main, feature/notifications
- Canvas-App — sessions: main, redesign-sidebar
- Ridecast — session: main
