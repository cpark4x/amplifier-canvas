# Amplifier-Canvas

The workspace companion for [Amplifier](https://github.com/microsoft/amplifier). Amplifier is the engine. Canvas is where you drive.

## What is this?

Amplifier-Canvas makes the invisible visible. Sessions running, files created, projects organized -- all in one workspace instead of juggling terminals, VS Code, GitHub, and browsers.

See [VISION.md](VISION.md) for the full product vision and [OUTCOMES.md](OUTCOMES.md) for success criteria.

## Project structure

```
canvas.html           The product -- self-contained HTML/CSS prototype, all acts, all screens
components.html       Component library reference (9.0 quality -- Linear/Raycast tier)
VISION.md             Why this exists, principles, non-goals
OUTCOMES.md           Measurable success criteria
STORYBOARD.md         Narrative source of truth -- all acts, scenes, JTBD per beat
ARCHITECTURE.md       Technical architecture -- Electron + React + TS, IPC, decisions
SCORECARD.md          Readiness scorecard per component

design/
  aesthetic-brief.md  Design system: palette, typography, composition rules
  screen_inventory.md Screen catalog and user journey spec
  nav-shell.md        Navigation shell spec (pixel widths, hex codes, typography)
  manifest.md         22 design references that shaped the aesthetic
  GENERATING.md       Workflow for adding new screens to canvas.html
  reference/          Screenshots of canonical screens for visual reference
```

## File governance

**Canonical files only.** Everything in the project structure table above is canonical. Everything else is scratch and should be deleted before committing.

Rules for AI sessions:
- **No version suffixes.** `components.html` not `components-v2.html`. Iterate in place.
- **No orphan PNGs.** Generated images that get stitched into a composite must be deleted after stitching.
- **No cloned repos.** External projects (grove, etc.) belong in their own workspace, not here.
- **No stale references.** If you delete a file, grep for its name and fix all references.
- **canvas.html is the product.** All screen designs live in this single file. No separate screen files.
- **components.html is the library.** All component definitions live here. No separate component files.
- **design/ is the spec.** Aesthetic rules, screen inventory, nav shell, reference screenshots.

## Viewing the prototype

Open `canvas.html` in any browser. It's fully self-contained -- no build step, no dependencies, no external images. Pure HTML/CSS with inline SVG.

## v1 capabilities

1. **Project Home** -- all projects at a glance with session status
2. **Session Awareness** -- running, done, waiting, stuck -- no CLI needed
3. **File Browser & Preview** -- rendered markdown, syntax-highlighted code, images
4. **Multi-Project, Multi-Session** -- switch without losing context
5. **Terminal Integration** -- CLI embedded alongside files, status, and preview
