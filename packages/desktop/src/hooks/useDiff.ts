import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { FileDiff } from '@revi/shared';
import { useSessionStore } from '../stores/session';

interface UseDiffOptions {
  filePath: string | null;
  ignoreWhitespace?: boolean;
}

interface UseDiffResult {
  diff: FileDiff | null;
  isLoading: boolean;
  error: string | null;
}

export function useDiff({ filePath, ignoreWhitespace = false }: UseDiffOptions): UseDiffResult {
  const { session } = useSessionStore();
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !filePath) {
      setDiff(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function fetchDiff() {
      setIsLoading(true);
      setError(null);

      try {
        // Determine if we're comparing to working tree
        const headSha = session!.head.sha === 'WORKING' ? 'WORKING_TREE' : session!.head.sha;

        const result = await invoke<FileDiff>('get_file_diff', {
          repoRoot: session!.repoRoot,
          baseSha: session!.base.sha,
          headSha,
          filePath,
          ignoreWhitespace,
        });

        if (!cancelled) {
          setDiff(result);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setDiff(null);
          setIsLoading(false);
        }
      }
    }

    fetchDiff();

    return () => {
      cancelled = true;
    };
  }, [session, filePath, ignoreWhitespace]);

  return { diff, isLoading, error };
}
