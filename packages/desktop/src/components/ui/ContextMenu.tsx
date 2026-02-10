import { useState, useRef, useEffect } from 'react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  items: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    closeOnClick?: boolean;
  }[];
}

export function ContextMenu({ x, y, onClose, items }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position to keep menu within viewport
  const adjustedStyle = {
    position: 'fixed' as const,
    left: x,
    top: y,
    zIndex: 1000,
  };

  return (
    <div ref={menuRef} className="context-menu" style={adjustedStyle}>
      {items.map((item, index) => (
        <button
          key={index}
          className="context-menu__item"
          onClick={() => {
            item.onClick();
            if (item.closeOnClick ?? true) {
              onClose();
            }
          }}
        >
          <span className="context-menu__label">{item.label}</span>
          {item.shortcut && (
            <span className="context-menu__shortcut">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export interface ContextMenuState {
  isOpen: boolean;
  x: number;
  y: number;
}

export function useContextMenu() {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const openMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
    });
  };

  const closeMenu = () => {
    setMenuState((prev) => ({ ...prev, isOpen: false }));
  };

  return { menuState, openMenu, closeMenu };
}
