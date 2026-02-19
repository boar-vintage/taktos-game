import { describe, expect, it } from 'vitest';
import { parseCommand } from '../src/commands/parser.js';

describe('parseCommand', () => {
  it('parses SAY with full tail message', () => {
    const parsed = parseCommand('SAY hello world');
    expect(parsed.name).toBe('SAY');
    expect(parsed.args[0]).toBe('hello world');
  });

  it('parses numeric shortcut', () => {
    const parsed = parseCommand('12');
    expect(parsed.name).toBe('NUMERIC');
    expect(parsed.args[0]).toBe('12');
  });

  it('handles unknown command', () => {
    const parsed = parseCommand('foobar x y');
    expect(parsed.name).toBe('UNKNOWN');
  });
});
