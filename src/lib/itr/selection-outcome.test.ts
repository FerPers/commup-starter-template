import { describe, expect, it } from 'vitest';
import { evaluateSelectionOutcome, validateOptionOutcomes } from './selection-outcome';

describe('structured selection outcomes', () => {
  it('does not infer rejection from option wording', () => {
    expect(evaluateSelectionOutcome(['No', 'Rechazado'], {}, 'Rechazado')).toEqual({ outcome: 'neutral', isPassed: null, requiresJustification: false, valid: true });
  });
  it('uses declared outcomes independently of language', () => {
    expect(evaluateSelectionOutcome(['No'], { No: 'pass' }, 'No').isPassed).toBe(true);
    expect(evaluateSelectionOutcome(['Sí'], { Sí: 'fail' }, 'Sí').isPassed).toBe(false);
  });
  it('requires a nonblank justification for not applicable', () => {
    const options = ['N/A']; const outcomes = { 'N/A': 'not_applicable' };
    expect(evaluateSelectionOutcome(options, outcomes, 'N/A', '   ').valid).toBe(false);
    expect(evaluateSelectionOutcome(options, outcomes, 'N/A', 'Not fitted')).toEqual({ outcome: 'not_applicable', isPassed: null, requiresJustification: true, valid: true });
  });
  it('rejects unlisted or missing responses', () => {
    expect(evaluateSelectionOutcome(['A'], {}, 'B').valid).toBe(false);
    expect(evaluateSelectionOutcome(['A'], {}, null).valid).toBe(false);
  });
  it('rejects invalid mappings, values and option shapes', () => {
    for (const mapping of [null, [], 'pass', { B: 'pass' }, { A: 'accepted' }, { A: null }]) {
      expect(validateOptionOutcomes(['A'], mapping)).toBe(false);
      expect(evaluateSelectionOutcome(['A'], mapping, 'A').valid).toBe(false);
    }
    expect(validateOptionOutcomes([1], {})).toBe(false);
    expect(validateOptionOutcomes(null, {})).toBe(true);
    expect(validateOptionOutcomes(null, { A: 'pass' })).toBe(false);
  });
  it('treats prototype-like option names as ordinary exact strings', () => {
    expect(evaluateSelectionOutcome(['toString'], {}, 'toString').outcome).toBe('neutral');
    expect(validateOptionOutcomes(['__proto__'], JSON.parse('{"__proto__":"pass"}'))).toBe(true);
  });
});
