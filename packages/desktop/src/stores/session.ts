import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import type { ReviewManifest } from '@revi/shared';

interface SessionState {
  session: ReviewManifest | null;
  sessionPath: string | null;
  selectedFile: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadSession: (path: string) => Promise<void>;
  loadSessionFromRepo: (repoPath: string, baseRef?: string) => Promise<void>;
  selectFile: (path: string) => void;
  selectNextFile: () => void;
  selectPrevFile: () => void;
  clearError: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  sessionPath: null,
  selectedFile: null,
  isLoading: false,
  error: null,

  loadSession: async (path: string) => {
    set({ isLoading: true, error: null, sessionPath: path });

    try {
      // Use Tauri invoke to load session from file
      const manifest = await invoke<ReviewManifest>('load_session', { path });

      set({
        session: manifest,
        selectedFile: manifest.files[0]?.path || null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
        isLoading: false,
      });
    }
  },

  loadSessionFromRepo: async (repoPath: string, baseRef?: string) => {
    set({ isLoading: true, error: null });

    try {
      // Create a new session from the repository
      const manifest = await invoke<ReviewManifest>('create_session_from_repo', { 
        repoPath, 
        baseRef: baseRef || null 
      });

      set({
        session: manifest,
        sessionPath: null, // Created in-memory, path is in .revi/sessions/
        selectedFile: manifest.files[0]?.path || null,
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error),
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

  clearError: () => {
    set({ error: null });
  },
}));
