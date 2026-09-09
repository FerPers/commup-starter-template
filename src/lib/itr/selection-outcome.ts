export type SelectionOutcome = 'pass' | 'fail' | 'not_applicable';
export type OptionOutcomes = Record<string, SelectionOutcome>;

/** An omitted mapping is neutral; classification never depends on translated labels. */
export function validateOptionOutcomes(options: unknown, outcomes: unknown): outcomes is OptionOutcomes {
  if (!outcomes || typeof outcomes !== 'object' || Array.isArray(outcomes)) return false;
  // A list must always be a string array; an empty map is otherwise neutral for
  // every item type (tables keep a config object in options).
  if (Array.isArray(options) && !options.every(value => typeof value === 'string')) return false;
  if (Object.keys(outcomes).length === 0) return true;
  if (options !== null && !Array.isArray(options)) return false;
  const allowedOptions = (options ?? []) as string[];
  return Object.entries(outcomes).every(([option, outcome]) =>
    allowedOptions.includes(option) && ['pass', 'fail', 'not_applicable'].includes(outcome as string));
}

export function evaluateSelectionOutcome(options: unknown, outcomes: unknown, selected: unknown, remarks?: string | null): {
  outcome: SelectionOutcome | 'neutral';
  isPassed: boolean | null;
  requiresJustification: boolean;
  valid: boolean;
} {
  if (!validateOptionOutcomes(options, outcomes) || !Array.isArray(options) || typeof selected !== 'string' || !options.includes(selected)) {
    return { outcome: 'neutral', isPassed: null, requiresJustification: false, valid: false };
  }
  const outcome = Object.prototype.hasOwnProperty.call(outcomes, selected) ? outcomes[selected] : 'neutral';
  const requiresJustification = outcome === 'not_applicable';
  return {
    outcome,
    isPassed: outcome === 'pass' ? true : outcome === 'fail' ? false : null,
    requiresJustification,
    valid: !requiresJustification || !!remarks?.trim(),
  };
}
