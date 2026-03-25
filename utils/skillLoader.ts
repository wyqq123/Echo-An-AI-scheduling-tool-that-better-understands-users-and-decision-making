/**
 * skillLoader.ts
 *
 * Utility for filling skill template placeholders and exposing a typed registry
 * of all skill markdown files imported at build time via Vite's ?raw loader.
 *
 * Usage:
 *   import { fillTemplate, SKILL } from '../utils/skillLoader';
 *   const prompt = fillTemplate(SKILL.chains.linearDecomposer, { TASK_TEXT: '...', ... });
 */

// ─── Domain Skills ────────────────────────────────────────────────────────────
import careerBreakRaw      from '../skills/domains/career-break.md?raw';
import bodyMindRaw         from '../skills/domains/body-mind.md?raw';
import academicSprintRaw   from '../skills/domains/academic-sprint.md?raw';
import deepConnectRaw      from '../skills/domains/deep-connect.md?raw';
import wealthControlRaw    from '../skills/domains/wealth-control.md?raw';
import innerWildRaw        from '../skills/domains/inner-wild.md?raw';

// ─── Chain Skills ─────────────────────────────────────────────────────────────
import linearDecomposerRaw      from '../skills/chains/linear-decomposer.md?raw';
import dimensionalDecomposerRaw from '../skills/chains/dimensional-decomposer.md?raw';

// ─── Funnel Skills ────────────────────────────────────────────────────────────
import funnelFirstTimeRaw       from '../skills/funnel/first-time.md?raw';
import funnelFirstTimeIceboxRaw from '../skills/funnel/first-time-icebox.md?raw';
import funnelSubsequentRaw      from '../skills/funnel/subsequent.md?raw';

// ─── Misc Skills ──────────────────────────────────────────────────────────────
import featureExtractionRaw from '../skills/feature-extraction.md?raw';
import leafMergeRaw         from '../skills/leaf-merge.md?raw';
import quarterlyReviewRaw   from '../skills/quarterly-review.md?raw';

// ─── Public registry ─────────────────────────────────────────────────────────

export const SKILL = {
  domains: {
    careerBreak:    careerBreakRaw,
    bodyMind:       bodyMindRaw,
    academicSprint: academicSprintRaw,
    deepConnect:    deepConnectRaw,
    wealthControl:  wealthControlRaw,
    innerWild:      innerWildRaw,
  },
  chains: {
    linearDecomposer:      linearDecomposerRaw,
    dimensionalDecomposer: dimensionalDecomposerRaw,
  },
  funnel: {
    firstTime:      funnelFirstTimeRaw,
    firstTimeIcebox: funnelFirstTimeIceboxRaw,
    subsequent:     funnelSubsequentRaw,
  },
  misc: {
    featureExtraction: featureExtractionRaw,
    leafMerge:         leafMergeRaw,
    quarterlyReview:   quarterlyReviewRaw,
  },
} as const;

// ─── Template engine ──────────────────────────────────────────────────────────

/**
 * Replace all {{VARIABLE}} placeholders in a skill template.
 *
 * @param template  Raw markdown string from SKILL registry
 * @param vars      Key/value map of placeholder → replacement
 * @returns         Filled prompt string ready for the LLM
 *
 * @example
 *   fillTemplate(SKILL.chains.linearDecomposer, {
 *     DOMAIN_SKILL:       SKILL.domains.careerBreak,
 *     URGENCY_NOTE:       'Urgent – start within 2 minutes.',
 *     SCOPE_INSTRUCTION:  'Small task scope...',
 *     TASK_TEXT:          'Write weekly report',
 *     TASK_TITLE:         'Weekly Report',
 *   });
 */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(vars, key)) {
      return vars[key];
    }
    // Leave unfilled placeholders intact so the caller can catch them
    console.warn(`[skillLoader] Unfilled placeholder: {{${key}}}`);
    return match;
  });
}