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

export function App() {
  const { session, isLoading, error, loadSession, loadSessionFromRepo, loadLastSession, clearSession, clearError } = useSessionStore();
  const { loadState: loadReviewState, reset: resetReviewState } = useReviewStateStore();
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [initComplete, setInitComplete] = useState(false);

  useEffect(() => {
    // Try to load session from CLI args, then from persisted last session
    async function initSession() {
      try {
        // First check CLI args
        const sessionPath = await invoke<string | null>('get_session_arg');
        if (sessionPath) {
          await loadSession(sessionPath);
          setInitComplete(true);
          return;
        }

        // Then try to load last session
        const loaded = await loadLastSession();
        if (loaded) {
          setInitComplete(true);
          return;
        }
      } catch (err) {
        console.error('Failed to init session:', err);
      }
      
      setInitComplete(true);
    }
    
    initSession();
  }, [loadSession, loadLastSession]);

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

  const handleChangeProject = async () => {
    await clearSession();
    await handleOpenRepository();
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
      <TopBar onChangeProject={handleChangeProject} />
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
