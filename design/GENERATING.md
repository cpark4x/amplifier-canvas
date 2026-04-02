# Generating New Screens

How to create accurate new screens for Amplifier Canvas without drift from the design system.

## The Problem

Text descriptions of the design system lose fidelity through the AI generation pipeline. "#F59E0B amber" becomes "amber-ish" becomes sage green. The fix is a closed loop: the canonical HTML renders the design → screenshots anchor generation → new output stays consistent.

## The Reference Kit

`design/reference/` contains screenshots taken directly from screens.html -- the single source of visual truth.

| File | What it shows | Use as reference when... |
|------|---------------|--------------------------|
| `component-sheet.png` | Color palette, typography, sidebar components, header, tabs, 5 session states | **Every generation.** Always include this. |
| `welcome.png` | Empty sidebar, header, warm background, amber CTA | Generating onboarding or empty-state screens |
| `session-started.png` | Active session, full-width terminal, amber status dot | Generating terminal-focused screens |
| `two-panel.png` | Sidebar + terminal + viewer with file content | Generating any two-panel layout |
| `app-preview.png` | Terminal + APP tab with live preview | Generating preview or embedded content screens |
| `dual-sessions.png` | Multiple sessions in different states | Generating multi-session or sidebar-heavy screens |
| `session-analysis.png` | ANALYSIS tab with structured data | Generating data-rich or stats screens |
| `project-overview.png` | Project-level AI assessment and outcomes | Generating project-level or dashboard screens |

## The Workflow

### Step 1: Write the scene in STORYBOARD.md

Before generating anything visual, write the narrative beat:
- What happens in this scene?
- Why does this moment matter?
- What components appear?

The scene description is the generation prompt's foundation.

### Step 2: Choose reference images

Always include `component-sheet.png`. Then pick 1-2 screen references that are closest to what you're building:

```
Building a new settings screen?
→ component-sheet.png (always)
→ project-overview.png (similar layout: full-width content area with structured sections)

Building a multi-project sidebar view?
→ component-sheet.png (always)
→ dual-sessions.png (sidebar with multiple items)
→ welcome.png (the empty/minimal sidebar state)
```

### Step 3: Generate with references

```python
nano-banana(
    operation="generate",
    prompt="[Scene description from STORYBOARD.md + specific component instructions]",
    reference_image_paths=[
        "design/reference/component-sheet.png",   # always
        "design/reference/[closest-screen].png",   # pick 1-2
    ],
    output_path="design/reference/[new-screen].png"
)
```

### Step 4: Compare against reference

After generating, compare the output to the reference screenshots:

```python
nano-banana(
    operation="compare",
    image1_path="design/reference/[closest-existing-screen].png",
    image2_path="design/reference/[new-screen].png",
    prompt="Compare these two screens from the same app. Check:
    1. Does the sidebar match (background color, typography, session item style)?
    2. Does the header match (height, logo, icon style)?
    3. Is the accent color the same amber (#F59E0B)?
    4. Is the terminal background the same dark (#0F0E0C)?
    5. Is the overall background the same warm paper white?
    Flag any visual inconsistencies."
)
```

### Step 5: Build in screens.html

Once the generated image is approved, implement it as HTML/CSS in screens.html. The HTML version becomes the new canonical reference. Screenshot it to update the reference kit if it introduces new components.

## Rules

1. **component-sheet.png is mandatory.** Every nano-banana generate call includes it as a reference image. No exceptions.

2. **At least one screen reference.** Always include the closest existing screen screenshot alongside the component sheet. Two reference images minimum per generation.

3. **Compare after every generation.** Use nano-banana compare to check the output against an existing screen before accepting it.

4. **screens.html is always right.** If a generated PNG disagrees with what screens.html renders, the PNG is wrong. Regenerate or adjust.

5. **Update the kit when screens.html grows.** After adding new acts/screens to screens.html, screenshot them and add to `design/reference/`. The reference kit must stay in sync with the canonical source.

## Refreshing the Reference Kit

When screens.html changes (new screens added, design tweaks):

1. Open screens.html in a browser at 1440px viewport width
2. Screenshot each new/changed screen at 1440x900
3. Save to `design/reference/[descriptive-name].png`
4. Regenerate `component-sheet.png` if any components changed (new states, new elements, palette adjustments)

## What NOT to Do

- **Don't generate from text alone.** Always pass reference images. Text-only prompts drift immediately.
- **Don't use old PNGs as references.** Only use screenshots from the current screens.html. Old PNGs may have wrong colors.
- **Don't skip the compare step.** A screen that "looks right" at a glance may have subtle palette drift that compounds across multiple screens.
- **Don't keep generated PNGs as the source of truth.** They're exploration artifacts. screens.html is the source of truth. Build the final version there.
