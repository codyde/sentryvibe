import { Fragment } from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../theme.js';

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
}

interface ProgressStepperProps {
  steps: Step[];
}

/**
 * Horizontal progress stepper with connected dots
 * ● ─────── ● ─────── ○ ─────── ○
 * Repo     Build    Database   Ready
 */
export function ProgressStepper({ steps }: ProgressStepperProps) {
  const getStepColor = (status: StepStatus): string => {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'active':
        return colors.cyan;
      case 'error':
        return colors.error;
      default:
        return colors.dimGray;
    }
  };

  const getStepSymbol = (status: StepStatus): string => {
    switch (status) {
      case 'error':
        return symbols.errorDot;
      case 'completed':
      case 'active':
        return symbols.filledDot;
      default:
        return symbols.hollowDot;
    }
  };

  const connector = ` ${symbols.horizontalLine.repeat(7)} `;

  return (
    <Box flexDirection="column" alignItems="center">
      {/* Dots row */}
      <Box>
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            <Text color={getStepColor(step.status)}>
              {getStepSymbol(step.status)}
            </Text>
            {index < steps.length - 1 && (
              <Text color={colors.dimGray}>{connector}</Text>
            )}
          </Fragment>
        ))}
      </Box>
      
      {/* Labels row */}
      <Box marginTop={0}>
        {steps.map((step, index) => {
          // Calculate padding to center labels under dots
          const labelWidth = 9; // Fixed width for consistent spacing
          const paddedLabel = step.label.padStart(
            Math.floor((labelWidth + step.label.length) / 2)
          ).padEnd(labelWidth);
          
          return (
            <Fragment key={step.id}>
              <Text 
                color={step.status === 'pending' ? colors.dimGray : colors.gray}
                dimColor={step.status === 'pending'}
              >
                {paddedLabel}
              </Text>
              {index < steps.length - 1 && (
                <Text>{''.padEnd(connector.length - labelWidth + 1)}</Text>
              )}
            </Fragment>
          );
        })}
      </Box>
    </Box>
  );
}
