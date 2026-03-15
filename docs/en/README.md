# Citto Code

English overview for the project lives here. The main [README](../../README.md) is written in Korean.

## What It Is

Citto Code is a desktop app that lets you use `Claude Code CLI` through a GUI instead of a terminal.

Instead of memorizing commands, you can open a project folder and work with Claude in a chat-style workflow for code explanation, editing, file browsing, and Git-related tasks.

## Why It Exists

TUI workflows can be fine for developers, but they are often a much higher barrier for non-developers. Citto Code was built to make `Claude Code CLI` easier to use through a desktop interface.

It is especially useful for people who can use `Claude Code` in environments such as Bedrock, but who either cannot use the official Claude desktop app or find CLI/TUI workflows cumbersome.

This app is not meant to replace the official product. If you can use the official Claude desktop app, that is the recommended option. Citto Code is better understood as a companion UI for `Claude Code CLI`.

## What You Can Do

- Open a project folder and start session-based work
- Organize conversations by session or by project
- Start new work quickly from the quick panel and recent projects
- Attach files or read file contents into the conversation
- Ask for code explanations, bug investigation, and feature work in natural language
- Review modified files and Git diffs, and switch branches, commit, pull, or push
- Manage MCP, Skills, Agents, environment variables, themes, notifications, and shortcuts
- Run scheduled Claude sessions automatically

## Requirements

- Node.js `22.x` recommended
- npm `10.x` recommended
- `Claude Code CLI` installed and signed in
- `claude --version` should work in your terminal

The app does not bundle Claude Code CLI itself. If the CLI is missing, the app will show installation guidance at launch.

## Quick Install

### macOS

```bash
npm install
npm run install:mac
```

### Windows

```powershell
npm install
npm run install:win
```

## Verified Environment

- Node.js `22.21.1`
- npm `10.9.4`
- Claude Code CLI `2.1.71`
