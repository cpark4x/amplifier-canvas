# Building New Screens

How to add new screens to Amplifier Canvas while staying consistent with the design system.

## The Approach: HTML-First

canvas.html is the product. New screens are built directly as HTML/CSS inside it. No PNG generation step, no fidelity gap, no rebuilding from images. The CSS variables and existing components ARE the design system -- reuse them.

## The Reference Kit

`design/reference/` contains screenshots taken from canvas.html. Their purpose is visual context for the person (or AI) writing the HTML -- not input to an image generator.

| File | What it shows | Look at this when building... |
|------|---------------|-------------------------------|
| `component-sheet.png` | Color palette, typography, sidebar states, header, tabs, session indicators | Any new screen -- the full component vocabulary |
| `welcome.png` | Empty sidebar, header, amber CTA | Onboarding or empty states |
| `session-started.png` | Active session, full-width terminal | Terminal-only layouts |
| `two-panel.png` | Sidebar + terminal + viewer with file content | Any two-panel layout |
| `app-preview.png` | Terminal + APP tab with live preview | Embedded content / preview screens |
| `dual-sessions.png` | Multiple sessions in different states | Multi-session sidebar |
| `session-analysis.png` | ANALYSIS tab with structured data | Data-rich or stats screens |
| `project-overview.png` | Project-level AI assessment | Dashboard or project-level screens |

## The Workflow

### Step 1: Write the scene in STORYBOARD.md

Before touching HTML, write the narrative beat:
- What happens in this scene?
- Why does this moment matter?
- What components appear? (sidebar state, terminal content, viewer tabs, etc.)

### Step 2: Identify existing components to reuse

Open canvas.html and find the closest existing screen. Most new screens are a recombination of existing parts:

| Component | Where it exists | CSS class / pattern |
|-----------|----------------|---------------------|
| Sidebar (empty) | Act 1 Step 1 | `.sidebar` |
| Sidebar (with sessions) | Act 1 Step 3+ | `.session-item`, `.status-dot` |
| Header bar | Every screen | `.header` |
| Full-width terminal | Act 1 Step 3 | `.terminal` (no viewer) |
| Two-panel (terminal + viewer) | Act 2 Step 2+ | `.main-content` with `.terminal` + `.viewer` |
| Viewer tab bar | Act 2+ | `.viewer-tabs` with `.tab.active` |
| File tab bar | Act 2 Step 2+ | `.file-tabs` |
| Toast notification | Act 3 Step 2 | `.toast` |
| Session analysis | Act 3 Step 3 | ANALYSIS tab content |
| Project overview | Act 3 Step 6 | Full-width structured content |

### Step 3: Build the screen in canvas.html

Copy the closest existing screen's HTML structure. Change the content, not the components. The CSS variables enforce the design system:

```css
/* These are already defined in canvas.html -- don't redefine them */
--bg-primary: #F0EBE3;      /* warm paper white */
--bg-sidebar: #F0EBE3;      /* same warm tone */
--bg-terminal: #0F0E0C;     /* deep carbon */
--text-primary: #2A2A2A;    /* warm charcoal */
--text-secondary: #A8A098;  /* warm gray */
--accent: #F59E0B;          /* amber */
--success: #3ECF8E;         /* emerald */
```

### Step 4: Screenshot and verify

After building, screenshot the new screen and compare it visually to an existing reference:

1. Open canvas.html in browser at 1440px viewport
2. Scroll to the new screen
3. Compare against `design/reference/[closest-screen].png` -- does it feel like the same app?

If it introduces new components, screenshot it and add to `design/reference/`.

## When to Use Image Generation (Exploration Only)

Use nano-banana for **exploration** when you need to try radically different layouts or compositions before committing to HTML. This is optional, not the default path.

When you do explore with image generation:
1. Always pass `component-sheet.png` + closest screen reference as `reference_image_paths`
2. Treat the output as a sketch, not a deliverable
3. Build the final version in HTML

## Adding a New Act

When adding an entire act (e.g., Act 4):

1. Write all scenes in STORYBOARD.md first
2. Add the act header in canvas.html following the existing pattern:
   ```html
   <div class="act-header">
     <div class="act-number">Act 4</div>
     <div class="act-title">[Title]</div>
     <div class="act-subtitle">[Subtitle]</div>
   </div>
   ```
3. Build each screen by copying and modifying the closest existing screen
4. Screenshot the completed act and add key screens to `design/reference/`
5. Update STORYBOARD.md with visual references

## Refreshing the Reference Kit

When canvas.html changes significantly:

1. Open in browser at 1440px viewport
2. Screenshot new or changed screens at 1440x900
3. Save to `design/reference/[descriptive-name].png`
4. Regenerate `component-sheet.png` only if new component types are added (new session states, new panel types, new UI patterns)

## Rules

1. **HTML is the deliverable.** New screens are built in canvas.html. PNGs are exploration artifacts only.

2. **Reuse, don't reinvent.** Every new screen should be assembled from existing components. If you need a new component, define it once and use it everywhere.

3. **CSS variables are the design system.** Never hardcode colors. Use the variables. This is how consistency stays automatic.

4. **canvas.html is always right.** The reference screenshots are snapshots. If canvas.html has been updated since the screenshots were taken, the HTML wins.

5. **STORYBOARD.md before canvas.html.** Write the story first. The scene description tells you which components to assemble. Don't design in HTML without knowing what moment you're capturing.
