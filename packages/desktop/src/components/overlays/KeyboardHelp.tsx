import { useKeyboardStore } from '../../stores/keyboard';

const SHORTCUT_GROUPS = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['j', 'ArrowDown'], label: 'Next file' },
      { keys: ['k', 'ArrowUp'], label: 'Previous file' },
      { keys: ['g'], label: 'First file' },
      { keys: ['G'], label: 'Last file' },
      { keys: ['Enter', 'o'], label: 'Open file' },
      { keys: ['n'], label: 'Next hunk' },
      { keys: ['p'], label: 'Previous hunk' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['v'], label: 'Toggle viewed' },
      { keys: ['['], label: 'Collapse active hunk' },
      { keys: [']'], label: 'Expand active hunk' },
    ],
  },
  {
    title: 'View',
    shortcuts: [
      { keys: ['s'], label: 'Toggle split/unified' },
      { keys: ['b'], label: 'Toggle sidebar' },
      { keys: ['?'], label: 'Toggle this help' },
      { keys: ['Esc'], label: 'Close overlay' },
    ],
  },
  {
    title: 'Window',
    shortcuts: [
      { keys: ['Cmd+N'], label: 'New window' },
    ],
  },
];

export function KeyboardHelp() {
  const { helpOverlayOpen, closeHelpOverlay } = useKeyboardStore();

  if (!helpOverlayOpen) return null;

  return (
    <div className="modal-overlay" onClick={closeHelpOverlay}>
      <div className="modal keyboard-help" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal__close" onClick={closeHelpOverlay}>
            &times;
          </button>
        </div>
        <div className="modal__body keyboard-help__body">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title} className="keyboard-help__group">
              <h3 className="keyboard-help__group-title">{group.title}</h3>
              <div className="keyboard-help__list">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="keyboard-help__row">
                    <span className="keyboard-help__keys">
                      {shortcut.keys.map((key, i) => (
                        <span key={key}>
                          {i > 0 && <span className="keyboard-help__separator"> / </span>}
                          <kbd>{key}</kbd>
                        </span>
                      ))}
                    </span>
                    <span className="keyboard-help__label">{shortcut.label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
