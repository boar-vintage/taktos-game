import { describe, expect, it } from 'vitest';
import { detectComplianceCommand, parseSmsCommand } from '../src/services/sms/commands.js';
import { exceedsInboundLimit, exceedsOutboundLimit, shouldWarnBurst } from '../src/services/sms/policy.js';

describe('sms command parsing', () => {
  it('parses MAP and ENTER commands', () => {
    expect(parseSmsCommand('MAP')).toEqual({ name: 'MAP', args: [], raw: 'MAP' });
    expect(parseSmsCommand('ENTER 2')).toEqual({ name: 'ENTER', args: ['2'], raw: 'ENTER 2' });
  });

  it('parses numeric replies for menu selection', () => {
    expect(parseSmsCommand('1')).toEqual({ name: 'NUMERIC', args: ['1'], raw: '1' });
  });

  it('parses SAY preserving message body', () => {
    expect(parseSmsCommand('SAY hi there')).toEqual({ name: 'SAY', args: ['hi there'], raw: 'SAY hi there' });
  });
});

describe('sms quota policies', () => {
  const limits = { maxInboundPerDay: 30, maxOutboundPerDay: 30 };

  it('enforces inbound limit', () => {
    expect(exceedsInboundLimit({ inboundCount: 30, outboundCount: 0 }, limits)).toBe(false);
    expect(exceedsInboundLimit({ inboundCount: 31, outboundCount: 0 }, limits)).toBe(true);
  });

  it('enforces outbound limit', () => {
    expect(exceedsOutboundLimit({ inboundCount: 1, outboundCount: 29 }, limits)).toBe(false);
    expect(exceedsOutboundLimit({ inboundCount: 1, outboundCount: 30 }, limits)).toBe(true);
  });

  it('warns on burst only when not warned recently', () => {
    expect(shouldWarnBurst({ elapsedMs: 200, burstLimitPerSec: 1, warnedRecently: false })).toBe(true);
    expect(shouldWarnBurst({ elapsedMs: 200, burstLimitPerSec: 1, warnedRecently: true })).toBe(false);
    expect(shouldWarnBurst({ elapsedMs: 1200, burstLimitPerSec: 1, warnedRecently: false })).toBe(false);
  });
});

describe('sms compliance command recognition', () => {
  it('supports STOP variants', () => {
    expect(detectComplianceCommand('STOP')).toBe('STOP');
    expect(detectComplianceCommand('unsubscribe')).toBe('STOP');
    expect(detectComplianceCommand('quit')).toBe('STOP');
  });

  it('supports START/HELP', () => {
    expect(detectComplianceCommand('START')).toBe('START');
    expect(detectComplianceCommand('help')).toBe('HELP');
    expect(detectComplianceCommand('info')).toBe('HELP');
  });
});
