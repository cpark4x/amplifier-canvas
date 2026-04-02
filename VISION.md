# Amplifier-Canvas Vision

## The Problem

Amplifier is a modular AI agent framework — provider-agnostic, extensible, and observable. It runs sessions that build, modify, and manage projects. Sessions can run for minutes to hours, producing files, changes, and commits. Today, the primary interface is the CLI.

Today, using Amplifier means juggling. You open a terminal to run a session. You open VS Code to see what it produced. You open another terminal for a second project. You check GitHub to see what merged. You scroll endlessly to figure out what happened. You run CLI commands just to check status. Sessions run for minutes or hours, and you have no idea if they're done, stuck, or waiting for you.

Developers have normalized this friction — they don't even notice it anymore. But it's real. And for anyone who isn't already fluent in terminals and git, the barrier isn't Amplifier's capability — it's the experience around it.

Amplifier is a powerful engine with no cockpit.

## The Vision

Amplifier-Canvas is the workspace companion for Amplifier.

Today, most people use Amplifier through its CLI. The CLI is powerful — but the experience around it is invisible. Sessions run in the background with no indication of progress. Files are created with no notification. Projects span multiple terminals with no unifying view. The power is there — the visibility isn't.

Amplifier-Canvas makes the invisible visible. You are still using the Amplifier CLI — Canvas is a visibility layer, not a replacement. It shows you what's happening across your projects and sessions, helps you spot what needs attention, and lets you navigate between files, previews, and terminal output in a single view. The CLI does the work. Canvas shows the state of the work.

Amplifier is the engine. Amplifier-Canvas is the cockpit.

### Core Principles

- **Visibility, not action.** Canvas shows you the state of your work — it does not do the work. The CLI does the work. You commit in the terminal; Canvas shows you the PR status. You run sessions from the CLI; Canvas shows you which ones need attention.
- **Additive, not replacement.** Nothing is taken away from CLI users — only added. If you close Canvas, Amplifier still works exactly the same.
- **Respect attention.** The sidebar is a triage surface. Three colors, three meanings: amber = working, blue = your turn, green = done. Scan, spot what needs you, act. No badge counts, no notification center.
- **The sidebar is the command center.** It starts as a project list (Act 1), becomes a session dashboard (Act 3), and grows into a multi-project triage surface (Act 4). Done projects collapse behind a chevron. The sidebar reflects your current reality, not your history.
- **Fast and reliable.** If it's slower than the CLI or it breaks, nobody switches. Speed and stability are non-negotiable.

### The Flywheel

Visibility creates confidence. Confidence drives usage. Usage creates complexity. Complexity demands visibility.

Without Amplifier-Canvas, complexity creates confusion — builders limit their Amplifier usage to what they can mentally track. With Amplifier-Canvas, complexity is managed — builders push Amplifier harder, take on more projects, run more sessions. That makes Amplifier-Canvas more essential.

The flywheel is between Canvas and Amplifier: Canvas makes Amplifier more usable. More Amplifier usage makes Canvas more valuable.

## Who This Is For

Amplifier-Canvas is for builders who use Amplifier to get things done. PMs, engineers, designers — anyone who has something they want to build. You don't need to be a terminal expert. You don't need to know git internals. You need to know what you want.

The user is a builder. Someone who sets direction, reviews output, and decides what's next. Amplifier handles the technical execution. Amplifier-Canvas makes the directing, reviewing, and deciding effortless.

**v1 target:** The Amplifier team — current CLI users who work across multiple projects and run long sessions daily. If they switch to Amplifier-Canvas as their daily driver, the product works. If they don't, nothing else matters.

**The belief:** We believe anyone can use Amplifier. What's missing isn't the user's skill — it's an experience that makes Amplifier's power visible and accessible. Amplifier-Canvas is how we prove it.

## What Success Looks Like

Amplifier-Canvas succeeds when builders stop juggling and start working.

Specifically:

- **You open one app, not five.** No more terminal + VS Code + browser + GitHub + another terminal. One workspace.
- **You see status at a glance.** Which sessions are running, done, waiting, or stuck — without running a command or scrolling through output.
- **You know what was produced.** Files created, files changed, what merged — visible, not buried in terminal history.
- **You switch between projects without losing context.** Multiple projects, multiple sessions — organized, not cluttered.
- **You preview without leaving.** See the files, rendered output, diffs — without opening another application.
- **It's fast and it doesn't break.** Speed and reliability are non-negotiable. If it's slower or less stable than the CLI, it fails.

The bar for v1: Current CLI users on the team adopt Amplifier-Canvas as their daily driver — not because they're told to, but because it's genuinely better than what they have.

## Non-Goals

These are hard boundaries — things Amplifier-Canvas explicitly does not do.

### Never

- **Modify or replace Amplifier core.** Amplifier-Canvas is a UX layer. The engine belongs to Brian Krabach and the Amplifier project. We consume it, we don't change it.
- **Build our own LLM integration, agent loop, or prompt engine.** We don't replace Amplifier's brain. The model integration, agent execution, and tool dispatch all belong to Amplifier.

### Not v1, not v2 — future, maybe

- **Multi-user collaboration.** This is a single-user workspace. Shared projects, real-time collaboration, team dashboards — all out of scope for the foreseeable future.
- **Better UI shell over existing CLI chat.** We may eventually provide a better chat interface layered over the Amplifier CLI. But not until the workspace experience outside of chat is solid and adopted.

The line is clear: Amplifier-Canvas makes Amplifier visible and accessible. It does not replace, extend, or compete with Amplifier itself.

## What Amplifier-Canvas Provides

All five capabilities are v1 must-haves. If any one is missing, CLI users won't switch.

1. **Sidebar as Triage Surface** — The sidebar shows every project and session with a status you can read at a glance. Amber pulsing = running. Blue pulsing = needs your input. Green with checkmark = done. Red = failed. Active projects are expanded; done projects collapse behind a chevron. One scan tells you what needs you.

2. **Terminal Integration** — The Amplifier CLI runs inside Canvas. You type in the terminal, Amplifier works, Canvas shows the state. The terminal is the primary workspace — everything else supports it.

3. **File Browser & Preview** — See what was created and changed. Browse files, preview them — rendered markdown, syntax-highlighted code, images — without opening VS Code or another app. The viewer appears only when content earns its place (progressive disclosure).

4. **Multi-Project, Multi-Session** — Work across projects without losing context. Switch between them with a click. Sessions continue running in the background. The sidebar multiplexes — you just point.

5. **Project Memory** — Projects accumulate understanding across sessions. Session history, AI-generated summaries, outcomes tracking, stats. Nothing is ever lost. The project is richer for having used Canvas.
