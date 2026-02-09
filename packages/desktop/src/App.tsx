import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { DiffPane } from './components/layout/DiffPane';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { KeyboardHelp } from './components/overlays/KeyboardHelp';
import { useSessionStore } from './stores/session';
import { useReviewStateStore } from './stores/reviewState';
import { useKeyboardManager } from './hooks/useKeyboardManager';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function App() {
  const { session, isLoading, error, loadSession, loadSessionFromRepo, loadLastSession, clearError } = useSessionStore();
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
      loadReviewState(
        session.repoRoot,
        session.sessionId,
        session.base.sha,
        session.head.sha
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

  const handleOpenRepository = async () => {
    setIsPickingFolder(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select a Git Repository',
      });
      
      if (selected) {
        await loadSessionFromRepo(selected as string);
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    } finally {
      setIsPickingFolder(false);
    }
  };

  if (!initComplete || isLoading || isPickingFolder) {
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
