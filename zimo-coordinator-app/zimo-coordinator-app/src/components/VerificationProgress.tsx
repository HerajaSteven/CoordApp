import React from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/typography';
import { ProgressBar } from '@/components/ui';
import { STEPS, STEP_LABELS } from '@/features/verification/steps';

/**
 * How far along a verification is: the count, the bar and the eight steps.
 *
 * Shared because a cluster is verified by the same eight steps as a farm,
 * so its screen shows the same thing — and because the farm screen was
 * carrying its own copy of the step labels, which had already drifted
 * ("GPS Verification" against the wizard's "GPS & Boundary").
 */
export function VerificationProgress({ completedSteps }: { completedSteps: readonly string[] }) {
  return (
    <View>
      <Text className="text-xs text-text-3 mb-3">
        {completedSteps.length} of {STEPS.length} steps completed
      </Text>
      <ProgressBar value={completedSteps.length} max={STEPS.length} />
      <View className="mt-4">
        {STEPS.map((step) => (
          <StepRow key={step} step={step} completed={completedSteps.includes(step)} />
        ))}
      </View>
    </View>
  );
}

function StepRow({ step, completed }: { step: keyof typeof STEP_LABELS; completed: boolean }) {
  return (
    <View className="flex-row items-center py-2.5 border-b border-border">
      <View className={`w-6 h-6 rounded-full items-center justify-center mr-3 ${completed ? 'bg-green-500' : 'bg-gray-100'}`}>
        <Text className={`text-xs font-bold ${completed ? 'text-white' : 'text-text-3'}`}>
          {completed ? '✓' : '○'}
        </Text>
      </View>
      <Text className={`text-sm ${completed ? 'text-text font-medium' : 'text-text-3'}`}>
        {STEP_LABELS[step]}
      </Text>
    </View>
  );
}
