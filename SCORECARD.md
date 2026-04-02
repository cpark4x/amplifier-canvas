# Amplifier-Canvas Scorecard

How ready is each component for the build phase?

| Component | Score | Status | What's there | What's missing |
|-----------|-------|--------|-------------|----------------|
| **Vision** | 9/10 | Ready | Problem, audience, principles, non-goals, flywheel. "Visibility not action" as #1 principle. Sidebar-as-command-center. | Could sharpen v1 scope boundary (Acts 1-3 vs Act 4). |
| **Outcomes** | 8/10 | Ready | 4 measurable outcomes, prioritized. Daily driver adoption as the gate. | No timeline. No measurement mechanics. |
| **Storyboard** | 9/10 | Ready | 22 screens across 4 acts. Full narrative with JTBD per scene. Emotional arc from skepticism to ownership. | Act 5 not started (team/settings -- acknowledged as future). |
| **Design** | 7/10 | Usable | canvas.html has all 22 screens as HTML/CSS. Consistent component patterns. Status system (amber/blue/green/red) designed. | Not a component library. Inline styles. 4.3 rework pending. |
| **Architecture** | 8/10 | Solid | Two-process Electron architecture. IPC contract defined. State flow documented. All decisions made (no open questions). Compared against Grove + Distro/Chat. File structure planned. Zustand + Shiki chosen. | Needs dependency list (package.json). Build tooling not configured. |
| **Build Plan** | 0/10 | Not started | -- | Task breakdown, sequencing, milestones, what to build first. |

## Overall Readiness

**The "why", "what", and "how" are strong. The "when" doesn't exist yet.**

Vision, storyboard, and design tell us exactly what to build and why. Architecture tells us how, with decisions validated against two reference projects (Grove, Distro/Chat). The gap is the build plan -- sequencing, milestones, and task breakdown.

## What Changed Since Last Review

- **Architecture: 6/10 -> 8/10.** Studied Grove (Manoj) and Distro/Chat (Sam) architectures. Resolved all 5 open questions. Added: Electron two-process model, IPC contract, Zustand choice, Shiki over Monaco, terminal management (visibility:hidden trick from Grove), tail-read for events.jsonl, session ID capture from banner. Documented decisions with reasoning and comparison table.

## Next Step

Create a build plan. We have everything we need to start building.
