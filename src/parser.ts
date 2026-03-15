export type EventType = 'permission' | 'idle' | 'error' | 'stop' | 'session_start' | 'session_end';

export interface HookEvent {
  sessionId: string;
  eventType: EventType;
  project: string;
  cwd: string;
  context?: string;
  raw: Record<string, unknown>;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function deriveProject(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() || 'unknown';
}

function resolveEventType(hookEventName: string, notificationType?: string): EventType {
  switch (hookEventName) {
    case 'Notification':
      if (notificationType === 'permission_prompt') return 'permission';
      if (notificationType === 'idle_prompt') return 'idle';
      return 'permission';
    case 'PostToolUseFailure':
      return 'error';
    case 'Stop':
      return 'stop';
    case 'SessionStart':
      return 'session_start';
    case 'SessionEnd':
      return 'session_end';
    default:
      return 'stop';
  }
}

function resolveContext(raw: Record<string, unknown>): string | undefined {
  const hookEvent = raw.hook_event_name as string;

  if (hookEvent === 'Notification') {
    const msg = raw.message as string | undefined;
    return msg ? truncate(msg, 100) : undefined;
  }

  if (hookEvent === 'PostToolUseFailure') {
    const tool = raw.tool_name as string | undefined;
    const input = raw.tool_input as Record<string, unknown> | undefined;
    const error = raw.error as string | undefined;
    const command = input?.command as string | undefined;
    const parts = [tool, command].filter(Boolean).join(': ');
    const full = [parts, error].filter(Boolean).join(' — ');
    return full ? truncate(full, 100) : undefined;
  }

  if (hookEvent === 'Stop') {
    const msg = raw.last_assistant_message as string | undefined;
    return msg ? truncate(msg, 100) : undefined;
  }

  return undefined;
}

export function parseHookInput(jsonString: string): HookEvent {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonString);
  } catch {
    throw new Error(`Invalid JSON input: ${jsonString.slice(0, 50)}`);
  }

  const sessionId = raw.session_id as string | undefined;
  if (!sessionId) {
    throw new Error('Missing required field: session_id');
  }

  const hookEventName = raw.hook_event_name as string | undefined;
  if (!hookEventName) {
    throw new Error('Missing required field: hook_event_name');
  }

  const notificationType = raw.notification_type as string | undefined;
  const cwd = (raw.cwd as string) || '/unknown';

  return {
    sessionId,
    eventType: resolveEventType(hookEventName, notificationType),
    project: deriveProject(cwd),
    cwd,
    context: resolveContext(raw),
    raw,
  };
}
