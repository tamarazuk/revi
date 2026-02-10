import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { DiffPane } from './components/layout/DiffPane';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { KeyboardHelp } from './components/overlays/KeyboardHelp';
import { useSessionStore } from './stores/session';
import { useReviewStateStore } from './stores/reviewState';
import { KEYBINDINGS, matchesKeybinding } from './keyboard/keymap';
import { useKeyboardManager } from './hooks/useKeyboardManager';
import { useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

interface ChangeEvent {
  type: 'file_changed' | 'ref_changed' | 'commit_added';
  repoRoot: string; // Which repo this change is for
  paths?: string[];
  newHeadSha?: string;
}

export function App() {
  const {
    session,
    isLoading,
    error,
    loadSession,
    loadSessionFromRepo,
    loadLastSession,
    refreshSession,
    clearError,
  } = useSessionStore();
  const { loadState: loadReviewState, reset: resetReviewState } = useReviewStateStore();
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [initComplete, setInitComplete] = useState(false);

  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    const label = currentWindow.label;

    async function initSession() {
      try {
        // On main window, check CLI args first
        if (label === 'main') {
          const sessionPath = await invoke<string | null>('get_session_arg');
          if (sessionPath) {
            await loadSession(sessionPath);
            setInitComplete(true);
            return;
          }
        }

        // Check if this window has a restored session from window-states.json
        const windowInfo = await invoke<{ repoPath?: string; baseRef?: string } | null>(
          'get_window_session',
          { windowLabel: label }
        );

        if (windowInfo?.repoPath) {
          await loadSessionFromRepo(windowInfo.repoPath, windowInfo.baseRef ?? undefined);
          setInitComplete(true);
          return;
        }

        // Fall back to legacy last-session on main window only
        if (label === 'main') {
          const loaded = await loadLastSession();
          if (loaded) {
            setInitComplete(true);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to init session:', err);
      }

      setInitComplete(true);
    }

    initSession();
  }, [loadSession, loadSessionFromRepo, loadLastSession]);

  // Central keyboard handler — must be called unconditionally (rules of hooks)
  useKeyboardManager();

  // Load review state when session changes
  useEffect(() => {
    if (session) {
      const fileInfo = session.files.map((f) => ({
        path: f.path,
        contentHash: '',
        additions: f.additions,
        deletions: f.deletions,
      }));
      loadReviewState(
        session.repoRoot,
        session.sessionId,
        session.base.sha,
        session.head.sha,
        fileInfo
      );
    } else {
      resetReviewState();
    }
  }, [session, loadReviewState, resetReviewState]);

  // Update window title and register session with backend
  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    if (session) {
      const parts = session.repoRoot.split('/');
      const repoName = parts[parts.length - 1] || 'Revi';
      currentWindow.setTitle(`${repoName} - Revi`);
      invoke('register_window_session', {
        windowLabel: currentWindow.label,
        repoPath: session.repoRoot,
        baseRef: session.base.ref ?? null,
      });
    } else {
      currentWindow.setTitle('Revi');
    }
  }, [session]);

  // File watcher: start watching when session loads, stop when it unloads
  useEffect(() => {
    if (!session) {
      return;
    }

    const repoRoot = session.repoRoot;
    const autoRefreshDebounceMs = 800;
    let debounceTimer: number | null = null;
    let refreshInFlight = false;
    let refreshQueued = false;

    const runRefresh = async () => {
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }

      refreshInFlight = true;
      try {
        await refreshSession();
      } catch (err) {
        console.warn('Auto-refresh failed:', err);
      } finally {
        refreshInFlight = false;

        if (refreshQueued) {
          refreshQueued = false;
          debounceTimer = window.setTimeout(() => {
            debounceTimer = null;
            void runRefresh();
          }, autoRefreshDebounceMs);
        }
      }
    };

    const scheduleAutoRefresh = () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void runRefresh();
      }, autoRefreshDebounceMs);
    };

    // Start watching the repository
    invoke('start_watching', { repoRoot }).catch((err) => {
      console.warn('Failed to start file watcher:', err);
    });

    // Listen for change events
    let unlisten: UnlistenFn | null = null;

    listen<ChangeEvent>('repo-changed', (event) => {
      // Only respond to changes for THIS window's repo
      if (event.payload.repoRoot !== repoRoot) {
        return;
      }

      const modeType = session.comparisonMode?.type;
      const isUncommittedMode = modeType === 'uncommitted';
      const isRefChange = event.payload.type === 'ref_changed';

      // In branch/custom mode, ignore working-tree file changes.
      // Only ref changes can affect the compared commits.
      if (!isUncommittedMode && !isRefChange) {
        return;
      }

      scheduleAutoRefresh();
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      // Stop watching when session changes or component unmounts
      invoke('stop_watching', { repoRoot }).catch(() => {});
      if (unlisten) {
        unlisten();
      }
    };
  }, [session?.repoRoot, session?.sessionId, refreshSession]);

  // Manual refresh handler
  const handleManualRefresh = useCallback(() => {
    refreshSession();
  }, [refreshSession]);

  // Keyboard shortcut for refresh (R key)
  useEffect(() => {
    const refreshBinding = KEYBINDINGS.find((binding) => binding.id === 'refresh_detected');
    if (!refreshBinding) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (matchesKeybinding(e, refreshBinding)) {
        e.preventDefault();
        handleManualRefresh();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualRefresh]);

  const handleOpenRepository = async () => {
    setIsPickingFolder(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select a Git Repository',
      });

      if (selected) {
        const repoPath = selected as string;
        const currentWindow = getCurrentWebviewWindow();

        // Check if this repo is already open in another window
        const existingWindow = await invoke<string | null>('find_window_by_repo', {
          repoPath,
          excludeLabel: currentWindow.label,
        });

        if (existingWindow) {
          // Focus the existing window and close this one (if it has no session)
          const closeLabel = session ? null : currentWindow.label;
          await invoke('focus_window_and_close', {
            focusLabel: existingWindow,
            closeLabel,
          });
          return;
        }

        await loadSessionFromRepo(repoPath);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    } finally {
      setIsPickingFolder(false);
    }
  };

  if (!initComplete || isPickingFolder || (isLoading && !session)) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h1>Revi</h1>
          <p>{isPickingFolder ? 'Opening repository...' : 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h1>Revi</h1>
          <p className="error">Error: {error}</p>
          <div className="empty-state__actions">
            <button className="btn btn--primary" onClick={handleOpenRepository}>
              Try Another Repository
            </button>
            <button className="btn btn--secondary" onClick={clearError}>
              Dismiss
            </button>
          </div>
          <p className="dim">Or run `revi .` in your terminal</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h1>Revi</h1>
          <p>Local code review made simple</p>
          <div className="empty-state__actions">
            <button className="btn btn--primary" onClick={handleOpenRepository}>
              Open Repository...
            </button>
          </div>
          <p className="dim">Or run `revi .` in your terminal</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar />
      <div className="app__body">
        <Sidebar />
        <ErrorBoundary>
          <DiffPane />
        </ErrorBoundary>
      </div>
      <KeyboardHelp />
    </div>
  );
}
