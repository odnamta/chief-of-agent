import fs from 'node:fs';
import path from 'node:path';
import * as lockfile from 'proper-lockfile';

export interface SessionState {
  project: string;
  cwd: string;
  status: 'working' | 'waiting' | 'error' | 'idle' | 'done';
  started_at: string;
  last_event: string;
  last_event_at: string;
  waiting_context?: string;
}

interface StateFile {
  sessions: Record<string, SessionState>;
}

export class StateManager {
  private stateDir: string;
  private statePath: string;

  constructor(stateDir: string) {
    this.stateDir = stateDir;
    this.statePath = path.join(stateDir, 'state.json');
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  private readState(): StateFile {
    if (!fs.existsSync(this.statePath)) {
      return { sessions: {} };
    }
    const content = fs.readFileSync(this.statePath, 'utf-8');
    return JSON.parse(content) as StateFile;
  }

  private writeState(state: StateFile): void {
    this.ensureDir();
    const tmpPath = this.statePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
    fs.renameSync(tmpPath, this.statePath);
  }

  private async withLock<T>(fn: () => T): Promise<T> {
    this.ensureDir();
    if (!fs.existsSync(this.statePath)) {
      fs.writeFileSync(this.statePath, JSON.stringify({ sessions: {} }));
    }
    const release = await lockfile.lock(this.statePath, {
      retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
    });
    try {
      return fn();
    } finally {
      await release();
    }
  }

  async register(sessionId: string, cwd: string, project: string): Promise<void> {
    await this.withLock(() => {
      const state = this.readState();
      const now = new Date().toISOString();
      state.sessions[sessionId] = {
        project, cwd, status: 'working',
        started_at: now, last_event: 'SessionStart', last_event_at: now,
      };
      this.writeState(state);
    });
  }

  async unregister(sessionId: string): Promise<void> {
    await this.withLock(() => {
      const state = this.readState();
      delete state.sessions[sessionId];
      this.writeState(state);
    });
  }

  async updateStatus(sessionId: string, status: SessionState['status'], event: string, context?: string): Promise<void> {
    await this.withLock(() => {
      const state = this.readState();
      const session = state.sessions[sessionId];
      if (!session) return;
      session.status = status;
      session.last_event = event;
      session.last_event_at = new Date().toISOString();
      session.waiting_context = context;
      this.writeState(state);
    });
  }

  async getAll(): Promise<Record<string, SessionState>> {
    const state = this.readState();
    return JSON.parse(JSON.stringify(state.sessions));
  }
}
