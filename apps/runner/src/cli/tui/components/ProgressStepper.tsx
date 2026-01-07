import { Fragment } from 'react';
import { Box, Text } from 'ink';
import { colors, symbols } from '../theme.js';

export type StepStatus = 'pending' | 'active' | 'completed' | 'error';

export interface Step {
  id: string;
  label: string;
  status: StepStatus;
}

// Keep for backwards compatibility
export interface StepTask {
  id: string;
  label: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  detail?: string;
  error?: string;
}

interface ProgressStepperProps {
  steps: Step[];
}

/**
 * Horizontal progress stepper - just the dots and labels
 * 
 *     ●───────────●───────────○───────────○
 *   Setup      Install    Database    Finalize
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

  // Cell and connector sizing
  const cellWidth = 10;
  const connectorWidth = 7;

  return (
    <Box flexDirection="column" alignItems="center">
      {/* Dots row */}
      <Box>
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            <Box width={cellWidth} justifyContent="center">
              <Text color={getStepColor(step.status)}>
                {getStepSymbol(step.status)}
              </Text>
            </Box>
            {index < steps.length - 1 && (
              <Text color={colors.dimGray}>
                {symbols.horizontalLine.repeat(connectorWidth)}
              </Text>
            )}
          </Fragment>
        ))}
      </Box>
      
      {/* Labels row */}
      <Box>
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            <Box width={cellWidth} justifyContent="center">
              <Text 
                color={step.status === 'pending' ? colors.dimGray : colors.gray}
                dimColor={step.status === 'pending'}
              >
                {step.label}
              </Text>
            </Box>
            {index < steps.length - 1 && (
              <Box width={connectorWidth} />
            )}
          </Fragment>
        ))}
      </Box>
    </Box>
  );
}
