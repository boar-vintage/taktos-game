const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

export function sanitizeChatInput(value: string): { raw: string; normalized: string } {
  const raw = value.slice(0, 500);
  const normalized = raw.replace(CONTROL_CHARS, '').trim();
  return { raw, normalized };
}
