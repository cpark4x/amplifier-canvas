# Navigation Shell — Component Specification

Source of truth: `canvas.html`

---

## Design Tokens

```css
--bg-page:           #F0EBE3;
--bg-header:         #E8E2D8;
--bg-sidebar:        #F0EBE3;
--bg-sidebar-active: #E8E0D4;
--bg-pane-title:     #DDD5C8;
--bg-terminal:       #0F0E0C;
--bg-right:          #F7F4EF;
--bg-modal:          #FAF8F4;
--border:            #DDD5C8;
--text-primary:      #1C1A16;
--text-muted:        #8A8278;
--text-very-muted:   #A09888;
--text-terminal:     #C8C4BC;
--amber:             #F59E0B;
--green:             #4CAF74;
--font-ui:           -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
--font-mono:         'SFMono-Regular', Menlo, Consolas, monospace;
```

---

## Page Layout

```
.screen (1440×900, flex column)
├── .app-header          — 38px fixed
└── .body-row            — flex: 1, horizontal
    ├── .sidebar         — 200px fixed
    ├── .terminal-zone   — flex: 1 (session view)
    │   OR .project-zone — flex: 1 (project view)
    └── .right-panel     — 340px fixed (optional, appears contextually)
```

---

## App Header

Class: `.app-header`

| Property | Value |
|---|---|
| Height | 38px |
| Background | `var(--bg-header)` |
| Border | 1px solid `var(--border)` bottom |
| Layout | flex, space-between, vertically centered |
| Padding | 0 12px |

**Structure:**
```html
<div class="app-header">
  <div class="app-header-left">          <!-- flex, gap: 8px -->
    <svg class="logo-mark">…</svg>       <!-- 22×22, two offset rounded rects -->
    <span class="app-name">Amplifier Canvas</span>  <!-- 13px, weight 600 -->
  </div>
  <div class="app-header-right">         <!-- flex, gap: 2px -->
    <button class="header-icon-btn" title="Layout">…</button>
    <button class="header-icon-btn" title="Notifications">…</button>
    <button class="header-icon-btn" title="Settings">…</button>
  </div>
</div>
```

**`.header-icon-btn`**: 26×26px, centered flex, 15px font-size, `var(--text-very-muted)`, no background, no border, 3px border-radius. Contains 14×14 SVG icons.

---

## Sidebar

Class: `.sidebar` — 200px wide, `var(--bg-sidebar)`, 1px right border, column flex, `padding: 12px 0`.

### Empty State

```html
<div class="sidebar-empty">No projects yet</div>   <!-- 11px, centered, very-muted -->
<div class="sidebar-add-project">Add project</div>  <!-- pinned to bottom -->
```

### Project Group (Expanded)

Class: `.project-group-expanded` — subtle background `rgba(0,0,0,0.025)`, 4px radius, `margin: 0 6px 6px`, `padding: 4px 0`.

```html
<div class="project-group-expanded">
  <div class="project-row">
    <span class="project-chevron">▾</span>
    <div class="project-label">CANVAS-APP</div>
    <button class="project-add-session-btn" title="New session">+</button>
  </div>
  <!-- Session rows go here -->
  <div class="session-row-new active">…</div>
  <div class="session-sep"></div>
  <div class="session-row-new">…</div>
</div>
```

**`.project-row`**: flex, space-between, `padding: 8px 8px 4px` (inside expanded group).

**`.project-chevron`**: 10px, `var(--text-muted)`, margin-right 4px.

**`.project-label`**: 10px, weight 600, `letter-spacing: 0.1em`, uppercase, `var(--text-very-muted)`. When inside `.project-row`, padding is 0 (overridden from standalone 12px padding).

**`.project-add-session-btn`**: 14px, `var(--text-very-muted)`, no background/border. Hover: `var(--amber)`.

### Project Group (Collapsed)

```html
<div class="project-row-collapsed">
  <span class="project-chevron-muted">▸</span>
  <div class="project-label-muted">TEAM-PULSE</div>
  <span class="project-meta-muted">3d ago</span>
</div>
```

**`.project-row-collapsed`**: flex, `padding: 7px 14px`, gap 6px, cursor pointer, hover background `rgba(0,0,0,0.03)`.

**`.project-chevron-muted`**: 10px, `var(--text-very-muted)`.

**`.project-label-muted`**: 10px, weight 600, `0.1em` tracking, uppercase, `var(--text-muted)`, flex: 1.

**`.project-meta-muted`**: 10px, `var(--text-very-muted)`, flex-shrink 0.

### Session Row

Class: `.session-row-new` — 36px height, flex, gap 8px, cursor pointer, `padding: 0 12px 0 14px` (adjusted to `4px 8px 4px 28px` inside expanded groups, plus left border treatment).

Inside `.project-group-expanded`:
- Sessions get `border-left: 2px solid var(--border)`, `margin-left: 14px`, `padding-left: 14px`.

**States:**
- `.active` — `var(--bg-sidebar-active)` background + 2px amber left accent bar (via `::before` pseudo-element).
- Hover — `rgba(0,0,0,0.03)` background.

**Session row content:**
```html
<div class="session-row-new active">
  <div class="session-dot amber"></div>    <!-- or .session-done-badge for completed -->
  <div style="flex:1; min-width:0;">
    <div style="display:flex; justify-content:space-between;">
      <span class="session-name bold">Auth module</span>
      <span class="session-age amber">28m · running</span>
    </div>
    <div class="worktree-badge">main</div>
  </div>
</div>
```

### Session Status Indicators

| Indicator | Class/Element | Visual |
|---|---|---|
| Running | `.session-dot.amber` | 6px amber circle |
| Done | `.session-done-badge` | 14px green filled circle with white `✓` (8px, weight 700) |
| Failed | `.session-dot` + inline `background:#D94545` | 6px red circle |
| Paused/idle | `.session-dot amber` | 6px amber circle |
| New slot | `.session-dot` + inline `background:var(--border)` | 6px border-colored circle |

### Session Name & Age

**`.session-name`**: 12px, `var(--text-primary)`, flex 1, ellipsis overflow.
- `.bold` modifier — font-weight 600 (active/selected session).

**`.session-age`**: 11px, `var(--text-very-muted)`, flex-shrink 0.
- `.amber` modifier — `var(--amber)` color (running sessions).
- Green age — inline `color:var(--green)` for done sessions (e.g., "done · 1h 12m").
- Red age — inline `color:#D94545` for failed sessions.

### Worktree Badge

**`.worktree-badge`**: `9px/1.3` mono font, `var(--text-very-muted)`, `padding-left: 14px`, `margin-top: 1px`, `letter-spacing: 0.02em`.

Content: `main` for main branch, `↟ worktree/branch-name` for non-main worktrees (↟ = `&#x219F;`).

### Session Separator

**`.session-sep`**: 1px height, `var(--border)` background, `margin: 0 12px`.

### Add Project Pill

**`.sidebar-add-project`**: Pinned to bottom via `margin: auto 10px 10px`, 1px `var(--border)` border, 4px radius, 11px text, `var(--text-muted)`, centered text. Hover: `rgba(0,0,0,0.04)` background.

### What Does NOT Exist

- No `sidebar-section-header` with "PROJECTS" label
- No "+ New session" text link — the `+` on `.project-row` IS the new session action
- No "HISTORY" label above completed sessions

---

## Pane Title

### Session View

Class: `.pane-title` — 28px height, `var(--bg-pane-title)`, `padding: 0 12px`, 11px, `var(--text-muted)`, flex centered.

Format: `Session Name · Project-Name`

Worktree indicator (when applicable) uses `.ctrl-hint` repurposed as a right-aligned badge:
```html
<div class="pane-title">New session · Canvas-App <span class="ctrl-hint">↟ worktree/dark-mode</span></div>
```

**`.ctrl-hint`**: `10px` mono, `var(--text-very-muted)`, opacity 0.7, `margin-left: auto`, `padding-right: 4px`. Used for worktree indicator — NOT for "Ctrl+C" hints.

### Completed Session View

Class: `.pane-title-complete` — same height/background as `.pane-title`, but text color is `var(--green)`, gap 10px.

```html
<div class="pane-title-complete">✓ Improve error handling · amplifier-canvas
  <span>done · 2h 14m · Tuesday 11:42 PM</span>  <!-- span is var(--text-very-muted) -->
</div>
```

### Project View

Class: `.project-pane-title` — 28px, `var(--bg-pane-title)`, `padding: 0 16px`, 11px, `var(--text-muted)`, flex centered, gap 8px.

Format: `Project-Name · Project`

---

## Terminal Zone

Class: `.terminal-zone` — column flex, flex 1, min-width 0.

### Terminal Area

Class: `.terminal-area` — flex 1, `var(--bg-terminal)`, `padding: 20px 24px`, `11.5px` mono, `line-height: 1.65`, `var(--text-terminal)`.

### Terminal Line Classes

| Class | Purpose | Color |
|---|---|---|
| `.t` | Generic terminal line | `var(--text-terminal)` |
| `.t.success` | Success line | `var(--green)` |
| `.t.blank` | Empty spacer line | — (height: 1.65em) |
| `.t-prompt` | Shell prompt | `#6A8A6A` with `.t-path`, `.t-branch`, `.t-dollar` spans |
| `.t-user-prompt` | User input line | `var(--text-terminal)` |
| `.t-tool` | Amplifier tool call | `var(--text-very-muted)` with `◆` prefix via `::before` (#5A8A9A) |
| `.t-amplifier-label` | "Amplifier:" label | `var(--green)`, weight 600 |
| `.t-response` | Amplifier response text | `var(--text-terminal)`, 11px UI font |
| `.t-thinking` | Thinking block | `#6A5A7A`, 10px mono |
| `.t-token-stats` | Token stats line | `var(--text-very-muted)`, 10px mono |

**`.terminal-cursor`**: 8×13px inline-block, `var(--amber)` background.

### Behavior Rules

- Scene 1.2b (first session created) shows the Amplifier startup banner (block characters + "AMPLIFIER" + session ID). Later screens (Act 3+) do NOT show banners because Canvas handles launch plumbing for subsequent sessions.
- Ready prompt and cursor shown immediately for new sessions
- Resumed sessions show prior conversation then `—— session restored ———————————————————`
- Shell prompts (`.t-prompt`) only appear for actual shell commands (npm, git, etc.)
- Amplifier conversation lines use `.t-user-prompt` without shell prompt

---

## Right Panel

Class: `.right-panel` — 340px, `var(--bg-right)`, 1px left border, column flex.

Appears contextually — not shown by default. Opens when there's something to display.

### Primary Tabs

Class: `.tab-row-primary` — 36px height, 1px bottom border, flex, `align-items: flex-end`, `padding: 0 12px`, gap 20px.

**`.tab-primary`**: 12px, weight 500, padding-bottom 8px, `var(--text-very-muted)`, 2px transparent bottom border.
- `.active` — `var(--text-primary)`, border-bottom-color `var(--amber)`.

**Tab sets by session state:**

| State | Tabs |
|---|---|
| Running session | FILES, APP, ANALYSIS, CHANGES |
| Completed/failed/paused session | FILES, APP, SUMMARY, CHANGES |
| Early session (no analysis yet) | FILES, APP |

### Secondary Tabs (File Tabs)

Class: `.tab-row-secondary` — 30px height, 1px bottom border, flex centered, `padding: 0 8px`, gap 2px.

**`.browse-btn`**: 22×22px, 13px icon, `var(--text-very-muted)`. `.active` → `var(--amber)`. Toggles file browser in panel content.

**`.file-tab`**: 11px, `padding: 3px 8px`, `var(--text-very-muted)`, 2px transparent bottom border.
- `.active` — `var(--text-primary)`, weight 500, amber bottom border.
- Contains `.file-tab-close` (× button, 10px, `var(--text-very-muted)`).

### Panel Content

Class: `.panel-content` — flex 1, padding 16px, overflow hidden.

---

## Toast Notification

Class: `.toast` — absolute positioned, bottom 24px, centered horizontally, dark theme.

```css
.toast {
  background: #1C1A16;
  border: 1px solid #3A3530;
  border-radius: 6px;
  padding: 12px 16px;
  min-width: 380px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.3);
  z-index: 10;
}
```

**`.toast-title`**: 12px UI font, `#E8E4DC`, weight 600, margin-bottom 6px.

**`.toast-stats`**: 11px mono, `var(--text-muted)`.

---

## Modal

Structure: `.modal-host` > `.modal-overlay` + `.modal`.

**`.modal-overlay`**: absolute inset 0, `rgba(20,16,10,0.18)`.

**`.modal`**: 400px default (460px for Add Project), `var(--bg-modal)`, 1px border, 6px radius, `padding: 24px`, z-index 1, box-shadow `0 8px 24px rgba(0,0,0,0.12)`.

**`.modal-header`**: flex, space-between, centered.
- `.modal-title` — 16px, weight 600, `var(--text-primary)`.
- `.modal-close` — 16px ×, `var(--text-muted)`.

**`.modal-divider`**: 1px, `var(--border)`, margin 16px 0.

### Modal Tab Row

**`.modal-tab-row`**: flex, `margin: 14px 0 16px`, 1px bottom border.

**`.modal-tab`**: 13px, `padding: 6px 14px 8px`, `var(--text-muted)`, 2px transparent bottom border.
- `.active` — `var(--text-primary)`, amber bottom border, weight 600.

### Modal Form Elements

- `.form-label` — 10px uppercase, 0.08em tracking, weight 600, `var(--text-very-muted)`.
- `.form-input` — full width, `padding: 8px 10px`, 1px border, `#F5F2EC` background, 13px, 3px radius.
- `.form-group` — margin-top 14px.
- `.radio-group` / `.radio-option` — column layout, gap 7px.
- `.radio-filled` — 10px circle, `var(--amber)`.
- `.radio-empty` — 10px circle, 1.5px `var(--text-very-muted)` border.

### Modal Footer

**`.modal-footer`**: margin-top 20px, flex, space-between.
- `.modal-cancel` — 13px, `var(--text-muted)`, no background/border.
- `.modal-submit` — `padding: 7px 14px`, 1px `#3A3530` border, `var(--bg-modal)`, 13px, 4px radius.

---

## Project View

Replaces `.terminal-zone` when user clicks project name.

Class: `.project-zone` — column flex, flex 1, `var(--bg-right)`.

**`.project-tab-bar`**: 36px, 1px bottom border, flex aligned to bottom, `padding: 0 24px`, gap 28px.

**`.project-tab`**: 12px, weight 500, padding-bottom 8px, `var(--text-very-muted)`, 2px transparent bottom border.
- `.active` — `var(--text-primary)`, amber bottom border.

**Tabs**: OVERVIEW, STATS, HISTORY.

**`.project-content`**: flex 1, `padding: 32px 40px`, overflow-y auto.
