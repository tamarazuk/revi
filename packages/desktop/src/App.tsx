import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { DiffPane } from './components/layout/DiffPane';
import { useSessionStore } from './stores/session';
import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export function App() {
  const { session, isLoading, error, loadSession, loadSessionFromRepo, clearError } = useSessionStore();
  const [isPickingFolder, setIsPickingFolder] = useState(false);

  useEffect(() => {
    // Try to load session from CLI args
    async function initSession() {
      try {
        const sessionPath = await invoke<string | null>('get_session_arg');
        if (sessionPath) {
          await loadSession(sessionPath);
        }
      } catch (err) {
        console.error('Failed to get session arg:', err);
      }
    }
    
    initSession();
  }, [loadSession]);

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

  if (isLoading || isPickingFolder) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h1>Revi</h1>
          <p>{isPickingFolder ? 'Opening repository...' : 'Loading session...'}</p>
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
        <DiffPane />
      </div>
    </div>
  );
}
