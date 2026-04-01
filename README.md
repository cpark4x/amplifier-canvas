# Amplifier-Canvas

The workspace companion for [Amplifier](https://github.com/microsoft/amplifier). Amplifier is the engine. Canvas is where you drive.

## What is this?

Amplifier-Canvas makes the invisible visible. Sessions running, files created, projects organized -- all in one workspace instead of juggling terminals, VS Code, GitHub, and browsers.

See [VISION.md](VISION.md) for the full product vision and [OUTCOMES.md](OUTCOMES.md) for success criteria.

## Project structure

```
screens.html          The product -- self-contained HTML/CSS prototype, all acts, all screens
VISION.md             Why this exists, principles, non-goals
OUTCOMES.md           Measurable success criteria

design/
  aesthetic-brief.md  Design system: palette, typography, composition rules
  screen-inventory.md Screen catalog and user journey spec
  nav-shell.md        Navigation shell spec (pixel widths, hex codes, typography)
  manifest.md         22 design references that shaped the aesthetic
  screens/            Approved screen PNGs (12 screens)
  components/         Component reference anchors (header, sidebar)
  storyboards/        Act-level composite views and storyboard panels
```

## Viewing the prototype

Open `screens.html` in any browser. It's fully self-contained -- no build step, no dependencies, no external images. Pure HTML/CSS with inline SVG.

## v1 capabilities

1. **Project Home** -- all projects at a glance with session status
2. **Session Awareness** -- running, done, waiting, stuck -- no CLI needed
3. **File Browser & Preview** -- rendered markdown, syntax-highlighted code, images
4. **Multi-Project, Multi-Session** -- switch without losing context
5. **Terminal Integration** -- CLI embedded alongside files, status, and preview
