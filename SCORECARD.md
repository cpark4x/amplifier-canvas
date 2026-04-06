# Amplifier-Canvas Scorecard

How ready is each component for the build phase?

| Component | Score | Status | What's there | What's missing |
|-----------|-------|--------|-------------|----------------|
| **Vision** | 9/10 | Ready | Problem, audience, principles, non-goals, flywheel. "Visibility not action" as #1 principle. Sidebar-as-command-center. | Could sharpen v1 scope boundary (Acts 1-3 vs Act 4). |
| **Outcomes** | 8/10 | Ready | 4 measurable outcomes, prioritized. Daily driver adoption as the gate. | No timeline. No measurement mechanics. |
| **Storyboard** | 9/10 | Ready | 22 screens across 4 acts. Full narrative with JTBD per scene. Emotional arc from skepticism to ownership. | Act 5 not started (team/settings -- acknowledged as future). |
| **Design** | 7/10 | Usable | canvas.html has all 22 screens as HTML/CSS. Consistent component patterns. Status system (amber/blue/green/red) designed. TOC added. | Not a component library. Inline styles. 4.3 rework pending. |
| **Architecture** | 9/10 | Ready | Two-process Electron. IPC contract. State flow. 7 product decisions confirmed through structured review. Compared against Grove + Distro/Chat. "Designed for" sections for reverse channel, local store, web companion. Vite + electron-builder. File structure planned. | Needs dependency list (package.json). |
| **Build Plan** | 0/10 | Not started | -- | Task breakdown, sequencing, milestones, what to build first. |

## Overall Readiness

**The "why", "what", and "how" are strong. The "when" doesn't exist yet.**

Vision, storyboard, and design tell us exactly what to build and why. Architecture tells us how, with all product decisions validated through structured review and technical decisions validated against two reference projects. The gap is the build plan.

## What Changed Since Last Review

- **Architecture: 8/10 -> 9/10.** Conducted structured product decision review (7 decisions, each asked as a product question, not an engineering question). Key outcomes:
  - Confirmed desktop over web (simplicity of first experience)
  - Confirmed reverse channel as "design for it, don't build it" (sidebar is glanceable, not real-time)
  - Confirmed "Canvas doesn't decide what happens next" principle (sessions finish, terminal stays, user decides)
  - Confirmed no database for v1 (but designed for local store later)
  - Added Vite + electron-builder as build tooling
  - Confirmed session lifecycle: user manages, Canvas doesn't auto-clean
  - Confirmed viewer is essential (ships with v1)
  - Added "Designed For" sections covering reverse channel, local store, and web companion -- futures that won't require architecture changes
  - Added "Confirmed Product Decisions" table to ARCHITECTURE.md

- **Design: 7/10 (unchanged).** Added TOC to canvas.html. Score unchanged because the real gaps (component library, inline styles) are still there.

## Next Step

Create a build plan. We have everything we need to start building.
