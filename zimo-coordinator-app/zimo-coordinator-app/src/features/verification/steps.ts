/**
 * The eight steps a field verification goes through, in order.
 *
 * One copy, because three screens count them: the wizard that walks them,
 * the farm screen that shows how far along a farm is, and the cluster screen
 * that now shows the same for a cluster. They were three separate arrays
 * holding the same eight strings — a ninth step would have had to be added
 * in three places, and a progress bar reading "7 of 8" on one screen and
 * "7 of 9" on another is the sort of thing nobody notices until it is wrong
 * in front of a farmer.
 *
 * The order is the platform's: it mirrors STEP_ORDER in the verification
 * service, which is what actually gates one step on the last.
 */
export const STEPS = [
  'identity',
  'farmType',
  'gps',
  'landOwnership',
  'infrastructure',
  'capacity',
  'evidence',
  'review',
] as const;

export type Step = (typeof STEPS)[number];

export const STEP_LABELS: Record<Step, string> = {
  identity: 'Identity Verification',
  farmType: 'Farm Type',
  gps: 'GPS & Boundary',
  landOwnership: 'Land Ownership',
  infrastructure: 'Infrastructure',
  capacity: 'Capacity',
  evidence: 'Evidence Photos',
  review: 'Review & Submit',
};

/**
 * Where to pick a half-finished verification up.
 *
 * The first step not yet done, or the review step once they all are. This is
 * what stops a visit that ran out of daylight starting again from identity.
 */
export function resumeStep(completedSteps: readonly string[]): Step {
  return STEPS.find((step) => !completedSteps.includes(step)) ?? 'review';
}
