/**
 * Per-user feature flags with a global kill switch.
 *
 * Each flag has a default for users with no override, per-user overrides,
 * and a global enabled/disabled state. Disabling a flag globally is meant
 * to act as a kill switch during an incident, without having to unpick
 * every individual override.
 */
export class FeatureFlags {
  private readonly flagsByName = new Map<string, Flag>();

  /**
   * Defines a flag with its default state for users who have no override.
   *
   * Defining a flag that already exists replaces its default and leaves
   * existing user overrides and its global state untouched.
   */
  define(flag: string, defaultEnabled: boolean): void {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      this.flagsByName.set(flag, {
        defaultEnabled,
        globallyEnabled: true,
        overrides: new Map(),
      });
      return;
    }
    existing.defaultEnabled = defaultEnabled;
  }

  /**
   * Sets a per-user override. Returns `true` if the flag is defined and
   * `false` otherwise. Setting an override for an undefined flag must not
   * define it.
   */
  setOverride(flag: string, user: string, enabled: boolean): boolean {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      return false;
    }
    existing.overrides.set(user, enabled);
    return true;
  }

  /**
   * Clears a per-user override. Returns `true` if the flag is defined
   * (whether or not that user had an override), and `false` otherwise.
   */
  clearOverride(flag: string, user: string): boolean {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      return false;
    }
    existing.overrides.delete(user);
    return true;
  }

  /**
   * Disables a flag for every user, regardless of individual overrides.
   * Returns `true` if the flag is defined and `false` otherwise.
   */
  disableGlobally(flag: string): boolean {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      return false;
    }
    existing.globallyEnabled = false;
    return true;
  }

  /**
   * Re-enables a flag globally, restoring normal override/default
   * resolution. Returns `true` if the flag is defined and `false`
   * otherwise.
   */
  enableGlobally(flag: string): boolean {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      return false;
    }
    existing.globallyEnabled = true;
    return true;
  }

  /**
   * Resolves whether `flag` is enabled for `user`: the kill switch beats
   * everything else, then an override wins if the user has one, then the
   * flag's default applies. An undefined flag is always `false`.
   */
  isEnabled(flag: string, user: string): boolean {
    const existing = this.flagsByName.get(flag);
    if (existing === undefined) {
      return false;
    }

    if (!existing.globallyEnabled) {
      return false;
    }

    if (existing.overrides.has(user)) {
      return existing.overrides.get(user)!;
    }

    return existing.defaultEnabled;
  }

  /**
   * Whether `flag` has been defined.
   */
  isDefined(flag: string): boolean {
    return this.flagsByName.has(flag);
  }

  /**
   * Defined flag names, in the order they were first defined.
   */
  flags(): string[] {
    return [...this.flagsByName.keys()];
  }
}

interface Flag {
  defaultEnabled: boolean;
  globallyEnabled: boolean;
  overrides: Map<string, boolean>;
}
