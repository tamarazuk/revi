import { useMemo } from 'react';
import { useKeyboardStore } from '../../stores/keyboard';
import { KEYBINDINGS } from '../../keyboard/keymap';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[][]; label: string }[];
}

function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="keyboard-help__combo">
      {keys.map((key, i) => (
        <kbd key={i}>{key}</kbd>
      ))}
    </span>
  );
}

export function KeyboardHelp() {
  const { helpOverlayOpen, closeHelpOverlay } = useKeyboardStore();

  const shortcutGroups = useMemo<ShortcutGroup[]>(() => {
    const groups: ShortcutGroup[] = [];

    for (const binding of KEYBINDINGS) {
      let group = groups.find((g) => g.title === binding.group);
      if (!group) {
        group = { title: binding.group, shortcuts: [] };
        groups.push(group);
      }

      group.shortcuts.push({
        label: binding.label,
        keys: binding.combos.map((combo) => combo.displayKeys),
      });
    }

    return groups;
  }, []);

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
          {shortcutGroups.map((group) => (
            <div key={group.title} className="keyboard-help__group">
              <h3 className="keyboard-help__group-title">{group.title}</h3>
              <div className="keyboard-help__list">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.label} className="keyboard-help__row">
                    <span className="keyboard-help__keys">
                      {shortcut.keys.map((combo, i) => (
                        <span key={i}>
                          {i > 0 && <span className="keyboard-help__separator">/</span>}
                          <KeyCombo keys={combo} />
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
