import TerminalPane from './TerminalPane';
import EmptyPane from './EmptyPane';

interface Props {
  panes: (string | null)[];
  layout: 1 | 2 | 4;
  onPaneSessionChange: (index: number, session: string | null) => void;
  focusedPane: number;
  onFocusPane: (index: number) => void;
}

const gridTemplates: Record<1 | 2 | 4, string> = {
  1: '1fr / 1fr',
  2: '1fr / 1fr 1fr',
  4: '1fr 1fr / 1fr 1fr',
};

export default function PaneLayout({
  panes,
  layout,
  onPaneSessionChange,
  focusedPane,
  onFocusPane,
}: Props) {
  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        gridTemplate: gridTemplates[layout],
        gap: 1,
        height: '100%',
        minWidth: 0,
        backgroundColor: '#222',
      }}
    >
      {panes.slice(0, layout).map((sessionName, index) => {
        const isFocused = index === focusedPane;
        return (
          <div
            key={index}
            style={{
              position: 'relative',
              minWidth: 0,
              minHeight: 0,
              overflow: 'hidden',
              border: isFocused ? '2px solid #5a8aba' : '2px solid transparent',
            }}
            onMouseDown={() => onFocusPane(index)}
          >
            {sessionName ? (
              <TerminalPane
                key={sessionName}
                sessionName={sessionName}
                onDisconnect={() => onPaneSessionChange(index, null)}
              />
            ) : (
              <EmptyPane
                onSelectSession={(name) => onPaneSessionChange(index, name)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
