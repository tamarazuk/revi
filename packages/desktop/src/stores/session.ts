import { create } from 'zustand';
import type { ReviewManifest } from '@revi/shared';

interface SessionState {
  session: ReviewManifest | null;
  selectedFile: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSession: (path: string) => Promise<void>;
  selectFile: (path: string) => void;
  selectNextFile: () => void;
  selectPrevFile: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  selectedFile: null,
  isLoading: false,
  error: null,

  loadSession: async (path: string) => {
    set({ isLoading: true, error: null });

    try {
      // TODO: Use Tauri invoke to load session from file
      // For now, we'll simulate loading from the path
      const response = await fetch(path);
      const manifest = await response.json() as ReviewManifest;

      set({
        session: manifest,
        selectedFile: manifest.files[0]?.path || null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load session',
        isLoading: false,
      });
    }
  },

  selectFile: (path: string) => {
    set({ selectedFile: path });
  },

  selectNextFile: () => {
    const { session, selectedFile } = get();
    if (!session) return;

    const currentIndex = session.files.findIndex((f) => f.path === selectedFile);
    const nextIndex = Math.min(currentIndex + 1, session.files.length - 1);
    set({ selectedFile: session.files[nextIndex]?.path || null });
  },

  selectPrevFile: () => {
    const { session, selectedFile } = get();
    if (!session) return;

    const currentIndex = session.files.findIndex((f) => f.path === selectedFile);
    const prevIndex = Math.max(currentIndex - 1, 0);
    set({ selectedFile: session.files[prevIndex]?.path || null });
  },
}));
