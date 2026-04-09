# Screen Inventory — Amplifier-Canvas v6 (V5 Baseline + Distinct Header, 15 Screens)

## Core Rule
Everything matches storyboard_v5.png. The ONLY delta is a distinct warm header bar.

## Palette (from v5)
- #F9F9F7 — paper white (content, file panels)
- #F2F0EB — warm stone (sidebar, terminal zone)
- #F5F3EE — header bar band (v6 addition — gentle warm gray)
- #2C2825 — warm brown (all primary text)
- #8B8B90 — muted gray (secondary text)
- #8DAE92 — muted sage green (3px dots, 1px underlines only)

## Storyboard Panels
- `storyboard_v6_panel1.png` — Screens 1-8
- `storyboard_v6_panel2.png` — Screens 9-15

## Screen Inventory (15 screens)

### Panel 1 — Onboarding & File Exploration (Screens 1-8)

| # | Screen | Purpose |
|---|--------|---------|
| 1 | Welcome | First-time empty state — serif headline, text CTA, warm stone sidebar empty |
| 2 | New Project | Inline form — underline inputs, minimal dot selection, "Create →" text link |
| 3 | Collapsed Sidebar | Thin 28px strip with initials/dots, full warm terminal |
| 4 | Rename Project | Editable project name in header, cursor visible |
| 5 | Opening File | Terminal shows "open the vision doc", right panel mid-open |
| 6 | Vision Doc | Right panel: rendered VISION.md markdown, FILES tab active |
| 7 | File Browser | Borderless file list with breadcrumbs |
| 8 | Source Code | Raw markdown source, Source/Preview toggle |

### Panel 2 — Advanced Features & Power User (Screens 9-15)

| # | Screen | Purpose |
|---|--------|---------|
| 9 | Web Preview | PREVIEW tab, live web app in panel, dev server in terminal |
| 10 | Session Stats | Floating typographic stats, activity log |
| 11 | Progress | Thin sage progress bar at 30%, long session |
| 12 | Dual Sessions | Expanded sidebar, two active sessions, session tab strip |
| 13 | Notification | Subtle toast: "Session complete", non-intrusive |
| 14 | Merge | Git merge in terminal, "Merged to main ✓" |
| 15 | Full Workspace | 3 projects, 5 sessions, settings gear — power user |

## User Journey

```
[1] Welcome → [2] New Project → [3] Collapsed Sidebar → [4] Rename
→ [5] Opening File → [6] Vision Doc → [7] File Browser → [8] Source Code
→ [9] Web Preview → [10] Session Stats → [11] Progress → [12] Dual Sessions
→ [13] Notification → [14] Merge → [15] Full Workspace
```

## Analysis Results

### Cross-Panel Consistency: 10/10
Panels 1 and 2 are visually indistinguishable in style — same canvas, frames, labels, arrows, palette.

### V5 Match Assessment
The comparison against v5 baseline found deviations:
- **Typography:** 9/10 match — serif/sans pairing and UPPERCASE tracking correct
- **Screen frames:** 10/10 match — proportions, canvas, arrows identical
- **Header change:** Achieved — distinct band visible
- **Palette warmth:** Shifted slightly cooler than v5's warm tones
- **Terminal treatment:** May have shifted darker than v5's warm stone terminal
- **Sidebar density:** Slightly looser than v5's very tight spacing

### Panel 2 Content Check
- Screen 12 (Dual Sessions): flagged as potentially not fully distinct from other screens — may need verification on sidebar expanded state + session tab strip visibility

### What Works Well
- Complete 15-screen journey tells a coherent story from first launch to power user
- Typography system is consistent and correct
- Screen frames, arrows, labels perfectly match v5's treatment
- Cross-panel continuity is flawless
- All screen-specific content (inline form, file browser, source code, web preview, stats, toast, merge, full workspace) is present

### Areas for Your Review
- Compare the palette warmth directly against v5 — is the tone close enough, or has it cooled?
- Check the terminal zones — do they match v5's warm stone treatment?
- Verify Screen 3's collapsed sidebar is a thin strip (28px) not hidden (0px)
