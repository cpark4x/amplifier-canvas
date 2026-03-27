# Amplifier-Canvas Vision

## The Problem

Today, using Amplifier means juggling. You open a terminal to run a session. You open VS Code to see what it produced. You open another terminal for a second project. You check GitHub to see what merged. You scroll endlessly to figure out what happened. You run CLI commands just to check status. Sessions run for minutes or hours, and you have no idea if they're done, stuck, or waiting for you.

Developers have normalized this friction — they don't even notice it anymore. But it's real. And for anyone who isn't already fluent in terminals and git, the barrier isn't Amplifier's capability — it's the experience around it.

Amplifier is a powerful engine with no cockpit.

## The Vision

Amplifier-Canvas is the workspace for Amplifier.

It's where you go to work. Not a dashboard you check, not a monitoring tool you glance at — the place you sit down in and stay. It replaces the fragmented experience of terminal windows, VS Code tabs, GitHub browser tabs, and CLI commands with a single, unified workspace.

You open Amplifier-Canvas. You see your projects. You pick one. You see everything: what's running, what finished, what was produced, what merged. You start a new task, switch between projects, preview files, check status — all without leaving.

Amplifier is the engine. Amplifier-Canvas is where you drive.

### Core Principles

- **Additive, not replacement.** Amplifier-Canvas doesn't change what Amplifier does. It works alongside the CLI. Nothing is taken away from CLI users — only added.
- **Project-centric.** Every project is a self-contained world. Sessions, files, git status, stats — all in one place.
- **Situational awareness.** At a glance: what's active, what's done, what's waiting, what was produced. No commands needed to check status.
- **Fast and reliable.** If it's slower than the CLI or it breaks, nobody switches. Speed and stability are features.

## Who This Is For

Amplifier-Canvas is for builders who use Amplifier to get things done. PMs, engineers, designers — anyone who has something they want to build. You don't need to be a terminal expert. You don't need to know git internals. You need to know what you want.

The user is a builder. Someone who sets direction, reviews output, and decides what's next. Amplifier handles the technical execution. Amplifier-Canvas makes the directing, reviewing, and deciding effortless.

We believe anyone can use Amplifier. What's missing isn't the user's skill — it's an experience that makes Amplifier's power visible and accessible.

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
- **Build a custom LLM/chat experience.** We use the Amplifier CLI for chat. We don't build our own prompt interface, our own model integration, or our own agent loop.

### Not v1, not v2 — future, maybe

- **Multi-user collaboration.** This is a single-user workspace. Shared projects, real-time collaboration, team dashboards — all out of scope for the foreseeable future.
- **Custom chat experience.** We may eventually offer an improved chat interface alongside the CLI. But not until the workspace experience outside of chat is solid and adopted.

The line is clear: Amplifier-Canvas makes Amplifier visible and accessible. It does not replace, extend, or compete with Amplifier itself.

## What Amplifier-Canvas Provides

1. **Project Home** — Your landing screen. All your projects, organized. Each one shows its current state at a glance — active sessions, last activity, what's happening. Pick a project and you're in its world.

2. **Session Awareness** — For each project: which sessions are running, done, waiting, or stuck. How long they've been running. What they were about. No commands needed — you see it.

3. **File Browser & Preview** — See what was created and changed. Browse files, preview them — rendered markdown, syntax-highlighted code, images — without opening VS Code or another app.

4. **Multi-Project, Multi-Session** — Work across projects without losing context. Switch between them. Keep sessions alive in the background. No juggling terminal windows.

5. **Terminal Integration** — The Amplifier CLI runs inside Amplifier-Canvas. You're not leaving the terminal behind — you're putting it in context alongside files, status, and preview.
