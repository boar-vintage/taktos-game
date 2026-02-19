export type CommandName =
  | 'HELP'
  | 'SIGNUP'
  | 'LOGIN'
  | 'LOGOUT'
  | 'MAP'
  | 'ENTER'
  | 'LEAVE'
  | 'LOOK'
  | 'JOBS'
  | 'WHO'
  | 'SAY'
  | 'WAVE'
  | 'UNLOCK'
  | 'PROFILE'
  | 'WORLD'
  | 'PORTAL'
  | 'UNKNOWN'
  | 'NUMERIC';

export interface ParsedCommand {
  name: CommandName;
  args: string[];
  raw: string;
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { name: 'UNKNOWN', args: [], raw: input };
  }

  if (/^\d+$/.test(trimmed)) {
    return { name: 'NUMERIC', args: [trimmed], raw: input };
  }

  const [head, ...rest] = trimmed.split(/\s+/);
  const upper = head.toUpperCase();

  if (upper === 'SAY') {
    return { name: 'SAY', args: [trimmed.slice(head.length).trim()], raw: input };
  }

  const known: CommandName[] = [
    'HELP',
    'SIGNUP',
    'LOGIN',
    'LOGOUT',
    'MAP',
    'ENTER',
    'LEAVE',
    'LOOK',
    'JOBS',
    'WHO',
    'WAVE',
    'UNLOCK',
    'PROFILE',
    'WORLD',
    'PORTAL'
  ];

  if (known.includes(upper as CommandName)) {
    return { name: upper as CommandName, args: rest, raw: input };
  }

  return { name: 'UNKNOWN', args: rest, raw: input };
}
