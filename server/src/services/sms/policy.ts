export interface DailyUsage {
  inboundCount: number;
  outboundCount: number;
}

export interface DailyLimits {
  maxInboundPerDay: number;
  maxOutboundPerDay: number;
}

export function exceedsInboundLimit(usage: DailyUsage, limits: DailyLimits): boolean {
  return usage.inboundCount > limits.maxInboundPerDay;
}

export function exceedsOutboundLimit(usage: DailyUsage, limits: DailyLimits): boolean {
  return usage.outboundCount >= limits.maxOutboundPerDay;
}

export function shouldWarnBurst(input: {
  elapsedMs: number;
  burstLimitPerSec: number;
  warnedRecently: boolean;
}): boolean {
  const minGap = Math.max(1, Math.floor(1000 / Math.max(input.burstLimitPerSec, 1)));
  if (input.elapsedMs >= minGap) {
    return false;
  }
  return !input.warnedRecently;
}
