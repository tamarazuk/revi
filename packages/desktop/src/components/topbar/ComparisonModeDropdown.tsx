import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ComparisonMode } from '@revi/shared';

interface Props {
  currentMode: ComparisonMode | undefined;
  hasUncommittedChanges: boolean;
  repoRoot: string;
  onModeChange: (mode: ComparisonMode) => void;
}

export function ComparisonModeDropdown({
  currentMode,
  hasUncommittedChanges,
  repoRoot,
  onModeChange,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get the display label for the current mode
  const getModeLabel = (mode: ComparisonMode | undefined): string => {
    if (!mode) return 'Auto';
    switch (mode.type) {
      case 'uncommitted':
        return 'Uncommitted Changes';
      case 'branch':
        return `Branch (vs ${mode.baseBranch})`;
      case 'custom':
        return `${mode.baseRef}..${mode.headRef}`;
      default:
        return 'Auto';
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch branches when dropdown opens
  useEffect(() => {
    if (isOpen && branches.length === 0) {
      invoke<string[]>('list_branches', { repoRoot })
        .then(setBranches)
        .catch(console.error);
    }
  }, [isOpen, repoRoot, branches.length]);

  const handleModeSelect = (mode: ComparisonMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  const handleBranchSelect = (branch: string) => {
    handleModeSelect({ type: 'branch', baseBranch: branch });
  };

  return (
    <div className="comparison-mode-dropdown" ref={dropdownRef}>
      <button
        className="comparison-mode-dropdown__trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Change comparison mode"
      >
        <span className="comparison-mode-dropdown__label">
          {getModeLabel(currentMode)}
        </span>
        <span className="comparison-mode-dropdown__caret">▾</span>
      </button>

      {isOpen && (
        <div className="comparison-mode-dropdown__menu">
          <div className="comparison-mode-dropdown__section">
            <button
              className={`comparison-mode-dropdown__item ${
                currentMode?.type === 'uncommitted' ? 'is-active' : ''
              } ${!hasUncommittedChanges ? 'is-disabled' : ''}`}
              onClick={() => handleModeSelect({ type: 'uncommitted' })}
              disabled={!hasUncommittedChanges}
            >
              <span className="comparison-mode-dropdown__item-label">
                Uncommitted Changes
              </span>
              <span className="comparison-mode-dropdown__item-desc">
                HEAD vs Working Tree
              </span>
              {!hasUncommittedChanges && (
                <span className="comparison-mode-dropdown__item-badge">
                  No changes
                </span>
              )}
            </button>
          </div>

          <div className="comparison-mode-dropdown__section">
            <div className="comparison-mode-dropdown__section-header">
              Compare to branch
            </div>
            {branches.slice(0, 10).map((branch) => (
              <button
                key={branch}
                className={`comparison-mode-dropdown__item ${
                  currentMode?.type === 'branch' &&
                  currentMode.baseBranch === branch
                    ? 'is-active'
                    : ''
                }`}
                onClick={() => handleBranchSelect(branch)}
              >
                <span className="comparison-mode-dropdown__item-label">
                  {branch}
                </span>
              </button>
            ))}
            {branches.length > 10 && (
              <div className="comparison-mode-dropdown__more">
                +{branches.length - 10} more branches
              </div>
            )}
          </div>

          <div className="comparison-mode-dropdown__section">
            <button
              className="comparison-mode-dropdown__item"
              onClick={() => {
                setShowCustomModal(true);
                setIsOpen(false);
              }}
            >
              <span className="comparison-mode-dropdown__item-label">
                Custom Comparison...
              </span>
            </button>
          </div>
        </div>
      )}

      {showCustomModal && (
        <CustomComparisonModal
          repoRoot={repoRoot}
          branches={branches}
          onSelect={(mode) => {
            onModeChange(mode);
            setShowCustomModal(false);
          }}
          onClose={() => setShowCustomModal(false)}
        />
      )}
    </div>
  );
}

interface CustomModalProps {
  repoRoot: string;
  branches: string[];
  onSelect: (mode: ComparisonMode) => void;
  onClose: () => void;
}

function CustomComparisonModal({
  repoRoot: _repoRoot,
  branches,
  onSelect,
  onClose,
}: CustomModalProps) {
  const [baseRef, setBaseRef] = useState('');
  const [headRef, setHeadRef] = useState('HEAD');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (baseRef && headRef) {
      onSelect({ type: 'custom', baseRef, headRef });
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>Custom Comparison</h2>
          <button className="modal__close" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="modal__body" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="baseRef">Base (from)</label>
            <input
              id="baseRef"
              type="text"
              value={baseRef}
              onChange={(e) => setBaseRef(e.target.value)}
              placeholder="e.g., main, origin/main, abc1234"
              list="base-branches"
              autoFocus
            />
            <datalist id="base-branches">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="form-group">
            <label htmlFor="headRef">Head (to)</label>
            <input
              id="headRef"
              type="text"
              value={headRef}
              onChange={(e) => setHeadRef(e.target.value)}
              placeholder="e.g., HEAD, feature-branch"
              list="head-branches"
            />
            <datalist id="head-branches">
              {branches.map((b) => (
                <option key={b} value={b} />
              ))}
              <option value="HEAD" />
            </datalist>
          </div>
          <div className="modal__actions">
            <button type="button" className="btn btn--secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={!baseRef || !headRef}
            >
              Compare
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
