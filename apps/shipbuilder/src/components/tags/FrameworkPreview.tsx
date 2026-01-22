'use client';

import { getFrameworkLogo } from '@/lib/framework-logos';
import Image from 'next/image';

interface FrameworkPreviewProps {
  framework: {
    value: string;
    label: string;
    description?: string;
    repository?: string;
    branch?: string;
  };
}

export function FrameworkPreview({ framework }: FrameworkPreviewProps) {
  const logoPath = getFrameworkLogo(framework.value);

  return (
    <div className="w-96 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        {logoPath && (
          <div className="w-8 h-8 flex items-center justify-center">
            <Image
              src={logoPath}
              alt={`${framework.label} logo`}
              width={32}
              height={32}
              className="object-contain"
            />
          </div>
        )}
        <div className="text-sm font-semibold text-gray-200">
          {framework.label}
        </div>
      </div>

      {/* Description */}
      {framework.description && (
        <div className="text-sm text-gray-400">
          {framework.description}
        </div>
      )}

      {/* Repository Info */}
      {framework.repository && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">Template Repository</div>
          <div className="bg-gray-800 rounded p-3 space-y-2">
            <div className="font-mono text-xs text-gray-300">
              {framework.repository}
            </div>
            {framework.branch && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Branch:</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-700 text-gray-300">
                  {framework.branch}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Installation Command */}
      {framework.repository && framework.branch && (
        <div className="space-y-2">
          <div className="text-xs text-gray-400">Quick Start</div>
          <div className="bg-gray-900 rounded p-3 border border-gray-700">
            <code className="text-xs text-green-400 font-mono">
              npx degit {framework.repository}#{framework.branch} my-project
            </code>
          </div>
        </div>
      )}
    </div>
  );
}
