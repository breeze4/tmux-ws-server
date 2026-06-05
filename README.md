# tmux-ws-server

A browser-based tmux session manager. Create, attach, rename, and kill tmux sessions from a web UI with live terminal panes powered by xterm.js.

## Features

- 1/2/4 pane layouts with session-per-pane
- Sidebar with session list, create/rename/kill
- Reconnect on disconnect (layout persisted to localStorage)
- Tmux shortcut cheatsheet built into the UI
- Touch-friendly toolbar for mobile

## Stack

Node.js + Express + node-pty + WebSocket (server), React + xterm.js + Vite (client).

## Usage

```
npm install && npm run build && npm start  # serves on port 8001
npm run dev                                # dev mode with hot reload
```
