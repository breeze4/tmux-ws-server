/**
 * Tmux keybinding and CLI command hints for each UI action.
 * Prefix = Ctrl+b by default in tmux.
 */

export interface TmuxHint {
  /** Short keybinding string, e.g. "Prefix $" */
  key: string;
  /** CLI command equivalent */
  cli: string;
  /** Brief description */
  desc: string;
}

export const hints = {
  // Session operations
  newSession: {
    key: 'Prefix :new -s name',
    cli: 'tmux new-session -s <name>',
    desc: 'Create a new named session',
  },
  killSession: {
    key: 'Prefix :kill-session',
    cli: 'tmux kill-session -t <name>',
    desc: 'Destroy a session',
  },
  renameSession: {
    key: 'Prefix $',
    cli: 'tmux rename-session -t <old> <new>',
    desc: 'Rename the current session',
  },
  attachSession: {
    key: 'Prefix s  (pick from list)',
    cli: 'tmux attach -t <name>',
    desc: 'Attach to an existing session',
  },
  detachSession: {
    key: 'Prefix d',
    cli: 'tmux detach',
    desc: 'Detach from the current session',
  },
  listSessions: {
    key: 'Prefix s',
    cli: 'tmux ls',
    desc: 'List all sessions',
  },

  // Window operations
  newWindow: {
    key: 'Prefix c',
    cli: 'tmux new-window',
    desc: 'Create a new window',
  },
  nextWindow: {
    key: 'Prefix n',
    cli: 'tmux next-window',
    desc: 'Switch to the next window',
  },
  prevWindow: {
    key: 'Prefix p',
    cli: 'tmux previous-window',
    desc: 'Switch to the previous window',
  },
  renameWindow: {
    key: 'Prefix ,',
    cli: 'tmux rename-window <name>',
    desc: 'Rename the current window',
  },
  closeWindow: {
    key: 'Prefix &',
    cli: 'tmux kill-window',
    desc: 'Close the current window',
  },

  // Pane operations
  splitVertical: {
    key: 'Prefix %',
    cli: 'tmux split-window -h',
    desc: 'Split pane vertically (side by side)',
  },
  splitHorizontal: {
    key: 'Prefix "',
    cli: 'tmux split-window -v',
    desc: 'Split pane horizontally (top/bottom)',
  },
  navigatePane: {
    key: 'Prefix Arrow',
    cli: 'tmux select-pane -[UDLR]',
    desc: 'Move focus between panes',
  },
  closePane: {
    key: 'Prefix x',
    cli: 'tmux kill-pane',
    desc: 'Close the current pane',
  },
  zoomPane: {
    key: 'Prefix z',
    cli: 'tmux resize-pane -Z',
    desc: 'Toggle pane zoom (fullscreen)',
  },
  resizePane: {
    key: 'Prefix Ctrl+Arrow',
    cli: 'tmux resize-pane -[UDLR] N',
    desc: 'Resize pane in arrow direction',
  },

  // Copy & scroll
  scrollMode: {
    key: 'Prefix [',
    cli: 'tmux copy-mode',
    desc: 'Enter scroll / copy mode',
  },
  pasteBuffer: {
    key: 'Prefix ]',
    cli: 'tmux paste-buffer',
    desc: 'Paste from tmux buffer',
  },

  // Misc
  commandPrompt: {
    key: 'Prefix :',
    cli: 'tmux command-prompt',
    desc: 'Open tmux command prompt',
  },
  showTime: {
    key: 'Prefix t',
    cli: 'tmux clock-mode',
    desc: 'Show a clock in the pane',
  },
  listKeys: {
    key: 'Prefix ?',
    cli: 'tmux list-keys',
    desc: 'Show all keybindings',
  },
} as const satisfies Record<string, TmuxHint>;

/** Format a hint for a tooltip */
export function hintTooltip(hint: TmuxHint): string {
  return `${hint.desc}\n\nTmux shortcut: ${hint.key}\nCLI: ${hint.cli}`;
}

/** Cheatsheet categories for the sidebar panel */
export const cheatsheet = [
  {
    title: 'Sessions',
    items: [
      hints.newSession,
      hints.killSession,
      hints.renameSession,
      hints.listSessions,
      hints.attachSession,
      hints.detachSession,
    ],
  },
  {
    title: 'Windows',
    items: [
      hints.newWindow,
      hints.nextWindow,
      hints.prevWindow,
      hints.renameWindow,
      hints.closeWindow,
    ],
  },
  {
    title: 'Panes',
    items: [
      hints.splitVertical,
      hints.splitHorizontal,
      hints.navigatePane,
      hints.zoomPane,
      hints.resizePane,
      hints.closePane,
    ],
  },
  {
    title: 'Other',
    items: [
      hints.scrollMode,
      hints.pasteBuffer,
      hints.commandPrompt,
      hints.listKeys,
    ],
  },
];
