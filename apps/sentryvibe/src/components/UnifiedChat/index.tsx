/**
 * UnifiedChat Component
 * 
 * This is a placeholder component created to satisfy build requirements.
 * The custom Sentry integrations (claudeCodeIntegration/openaiCodexIntegration)
 * were attempting to reference this component during the webpack build process,
 * causing a ModuleBuildError when the file didn't exist.
 */

import React from 'react';

export interface UnifiedChatProps {
  className?: string;
}

const UnifiedChat: React.FC<UnifiedChatProps> = ({ className }) => {
  return (
    <div className={className}>
      <p>UnifiedChat component placeholder</p>
    </div>
  );
};

export default UnifiedChat;