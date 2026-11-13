export const profiles = ['auto', 'low', 'balanced', 'resilient', 'custom'] as const;
export type Profile = typeof profiles[number];
export function profileDelay(profile: Profile): number {
  return { auto: 500, low: 250, balanced: 750, resilient: 1500, custom: 500 }[profile];
}

/** Health clocks are local monotonic milliseconds, not media timestamps. */
export class Adaptation {
  delay: number;
  profile: Profile;
  private activeSince: number | undefined;
  private stableSince: number | undefined;
  private lastRise = -Infinity;
  private lastFall = -Infinity;

  constructor(profile: Profile = 'auto', customDelay = 500) {
    this.profile = profile;
    this.delay = profile === 'custom' ? Math.max(100, Math.min(2000, customDelay)) : profileDelay(profile);
  }

  resetHealth(): void {
    this.activeSince = undefined;
    this.stableSince = undefined;
    this.lastRise = -Infinity;
    this.lastFall = -Infinity;
  }

  sample(now: number, active: boolean, stalled: boolean): number {
    if (!active) {
      this.resetHealth();
      return this.delay;
    }
    this.activeSince ??= now;
    if (now - this.activeSince < 3000 || this.profile !== 'auto') return this.delay;
    if (stalled) {
      this.stableSince = undefined;
      if (now - this.lastRise >= 2000) {
        this.delay = Math.min(2000, this.delay + 250);
        this.lastRise = now;
      }
    } else {
      this.stableSince ??= now;
      if (now - this.stableSince >= 30000 && now - this.lastFall >= 10000) {
        this.delay = Math.max(300, this.delay - 100);
        this.lastFall = now;
      }
    }
    return this.delay;
  }
}
