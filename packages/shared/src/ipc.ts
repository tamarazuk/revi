/**
 * IPC messages between CLI and Desktop app
 */
export interface IPCMessage {
  type: IPCMessageType;
  payload: unknown;
}

export type IPCMessageType = 'load_session' | 'ping' | 'pong';

export interface LoadSessionPayload {
  sessionPath: string;
}

/**
 * Events emitted from Rust backend to React frontend
 */
export interface RepoChangedEvent {
  type: 'file_changed' | 'ref_changed' | 'commit_added';
  paths?: string[];
  newHeadSha?: string;
}
