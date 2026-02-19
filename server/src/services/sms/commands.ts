export type SmsComplianceCommand = 'STOP' | 'START' | 'HELP' | null;

export type SmsCommandName =
  | 'JOIN'
  | 'MAP'
  | 'ENTER'
  | 'LEAVE'
  | 'WHO'
  | 'JOBS'
  | 'SAY'
  | 'UNLOCK'
  | 'HELP'
  | 'NUMERIC'
  | 'UNKNOWN';

export interface ParsedSmsCommand {
  name: SmsCommandName;
  args: string[];
  raw: string;
}

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'UNSTOP']);
const HELP_WORDS = new Set(['HELP', 'INFO']);

export function detectComplianceCommand(input: string): SmsComplianceCommand {
  const normalized = input.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  if (STOP_WORDS.has(normalized)) {
    return 'STOP';
  }
  if (START_WORDS.has(normalized)) {
    return 'START';
  }
  if (HELP_WORDS.has(normalized)) {
    return 'HELP';
  }
  return null;
}

export function parseSmsCommand(input: string): ParsedSmsCommand {
  const trimmed = input.trim();
  if (!trimmed) {
    return { name: 'UNKNOWN', args: [], raw: input };
  }

  if (/^\d+$/.test(trimmed)) {
    return { name: 'NUMERIC', args: [trimmed], raw: input };
  }

  const [head = '', ...rest] = trimmed.split(/\s+/);
  const upper = head.toUpperCase();

  if (upper === 'SAY') {
    return { name: 'SAY', args: [trimmed.slice(head.length).trim()], raw: input };
  }

  if (upper === 'JOIN') {
    return { name: 'JOIN', args: rest, raw: input };
  }

  const known: SmsCommandName[] = ['MAP', 'ENTER', 'LEAVE', 'WHO', 'JOBS', 'UNLOCK', 'HELP'];
  if (known.includes(upper as SmsCommandName)) {
    return { name: upper as SmsCommandName, args: rest, raw: input };
  }

  return { name: 'UNKNOWN', args: rest, raw: input };
}
