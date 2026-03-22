// Shared types for Chief of Agent Control Tower

export type Decision = 'allow' | 'deny' | 'ask';

export interface PendingRequest {
  requestId: string;
  sessionId: string;
  project: string;
  tool: string;
  detail: string;
  timestamp: string;
}

export interface RespondPayload {
  requestId: string;
  decision: Decision;
}

// Matches ~/.chief-of-agent/state.json
export interface SessionState {
  project: string;
  cwd: string;
  status: 'working' | 'waiting' | 'error' | 'idle' | 'done';
  started_at: string;
  last_event: string;
  last_event_at: string;
  waiting_context?: string;
}

export interface StateFile {
  sessions: Record<string, SessionState>;
  costs?: Record<string, SessionCost>;
}

export interface SessionCost {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  apiCalls?: number;
  estimatedCostUSD?: number;
}

// SSE event types
export type SSEEventType = 'pending:new' | 'pending:resolved';

export interface SSEEvent {
  type: SSEEventType;
  data: PendingRequest | { requestId: string; decision: Decision };
}
