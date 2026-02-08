import { TopBar } from './components/layout/TopBar';
import { Sidebar } from './components/layout/Sidebar';
import { DiffPane } from './components/layout/DiffPane';
import { useSessionStore } from './stores/session';
import { useEffect } from 'react';

export function App() {
  const { session, loadSession } = useSessionStore();

  useEffect(() => {
    // Load session from command line args or default
    // For now, we'll show a placeholder until session is loaded
    const sessionPath = new URLSearchParams(window.location.search).get('session');
    if (sessionPath) {
      loadSession(sessionPath);
    }
  }, [loadSession]);

  if (!session) {
    return (
      <div className="app app--empty">
        <div className="empty-state">
          <h1>Revi</h1>
          <p>No review session loaded.</p>
          <p className="dim">Run `revi .` in your repository to start a review.</p>
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
