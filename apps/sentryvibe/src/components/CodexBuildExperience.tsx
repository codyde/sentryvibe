import type { ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  GitBranch,
  Download,
  FolderCheck,
  ClipboardList,
  PlayCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import type { CodexSessionState, CodexPhase } from '@/types/generation';

const phaseIcons: Record<string, ComponentType<{ className?: string }>> = {
  'prompt-analysis': Sparkles,
  'template-selection': GitBranch,
  'template-clone': Download,
  'workspace-verification': FolderCheck,
  'task-synthesis': ClipboardList,
  execution: PlayCircle,
};

function statusColors(status: CodexPhase['status']) {
  switch (status) {
    case 'completed':
      return {
        border: 'border-emerald-400/40',
        bg: 'bg-emerald-400/10',
        text: 'text-emerald-300',
      };
    case 'active':
      return {
        border: 'border-purple-400/40',
        bg: 'bg-purple-500/10',
        text: 'text-purple-200',
      };
    case 'blocked':
      return {
        border: 'border-rose-400/40',
        bg: 'bg-rose-500/10',
        text: 'text-rose-300',
      };
    default:
      return {
        border: 'border-white/10',
        bg: 'bg-white/5',
        text: 'text-slate-300',
      };
  }
}

interface CodexBuildExperienceProps {
  codex?: CodexSessionState;
  projectName: string;
  isActive: boolean;
  onViewFiles?: () => void;
  onStartServer?: () => void;
}

export function CodexBuildExperience({
  codex,
  projectName,
  isActive,
  onViewFiles,
  onStartServer,
}: CodexBuildExperienceProps) {
  if (!codex) {
    return (
      <div className="border border-dashed border-white/20 rounded-2xl p-8 text-center space-y-3 bg-black/20">
        <Sparkles className="w-8 h-8 mx-auto text-purple-300 animate-pulse" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-white">Waiting for Codex to initialize…</p>
          <p className="text-xs text-gray-400">
            Once the runner begins processing, you’ll see the template selection and task breakdown appear here.
          </p>
        </div>
      </div>
    );
  }

  const completedPhases = codex.phases.filter(phase => phase.status === 'completed').length;
  const totalPhases = codex.phases.length;
  const activePhase = codex.phases.find(phase => phase.status === 'active');
  const progress = totalPhases > 0 ? Math.round((completedPhases / totalPhases) * 100) : 0;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-[#141122] via-[#0c0a16] to-[#090812] p-6"
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-purple-500/30 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-emerald-500/20 blur-2xl" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(117,83,255,0.12),_transparent_55%)]" />
        </div>
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-purple-300/80">Codex Build Flow</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
              {projectName}
              {isActive ? (
                <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 px-3 py-1 text-xs font-semibold text-purple-200">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-300" />
                  </span>
                  Running
                </span>
              ) : (
                <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Complete
                </span>
              )}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {activePhase
                ? `Currently ${activePhase.title.toLowerCase()}`
                : isActive
                  ? 'Codex is orchestrating build tasks'
                  : 'All Codex phases finished'}
            </p>
          </div>
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-purple-500/30 bg-black/40">
            <div
              className="absolute inset-0 rounded-full border-4 border-transparent"
              style={{
                background: `conic-gradient(#7b5cff ${progress * 3.6}deg, rgba(255,255,255,0.08) ${progress * 3.6}deg)`,
              }}
            />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[#0d0a18] text-white">
              <span className="text-xl font-semibold">{progress}%</span>
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-3 text-xs text-slate-400">
          <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
            <Sparkles className="h-3 w-3 text-purple-300" />
            {completedPhases} of {totalPhases} phases complete
          </div>
          {codex.templateDecision && (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <GitBranch className="h-3 w-3 text-emerald-300" />
              Template ready: {codex.templateDecision.templateName}
            </div>
          )}
          {codex.workspaceVerification?.directory && (
            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1">
              <FolderCheck className="h-3 w-3 text-emerald-300" />
              {codex.workspaceVerification.directory}
            </div>
          )}
        </div>
      </motion.div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 shadow-inner shadow-purple-950/30">
        <header className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-white">Phase Timeline</h4>
          <p className="text-xs text-slate-400">
            Updated {codex.lastUpdatedAt ? codex.lastUpdatedAt.toLocaleTimeString() : 'just now'}
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {codex.phases.map(phase => {
            const Icon = phaseIcons[phase.id] ?? Info;
            const colors = statusColors(phase.status);
            return (
              <motion.div
                key={phase.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={`relative overflow-hidden rounded-xl border px-4 py-4 ${colors.border} ${colors.bg}`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full border border-white/10 bg-black/40 p-2">
                    <Icon className={`h-4 w-4 ${colors.text}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">{phase.title}</p>
                      {phase.status === 'active' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-200">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-purple-300" />
                          Active
                        </span>
                      )}
                      {phase.status === 'blocked' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Needs attention
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300 line-clamp-3">{phase.description}</p>
                    {phase.spotlight && (
                      <div className="mt-2 rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] text-slate-200">
                        {phase.spotlight}
                      </div>
                    )}
                    <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-wide text-slate-500">
                      {phase.startedAt && <span>Started {phase.startedAt.toLocaleTimeString()}</span>}
                      {phase.completedAt && <span>Finished {phase.completedAt.toLocaleTimeString()}</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {codex.templateDecision && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-emerald-300/80">Template locked</p>
              <h4 className="mt-1 text-lg font-semibold text-white">
                {codex.templateDecision.templateName}
              </h4>
              <p className="mt-1 text-xs text-emerald-100/80">
                {codex.templateDecision.repository}
                {codex.templateDecision.branch ? ` • ${codex.templateDecision.branch}` : ''}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-400/40 bg-black/30 px-4 py-3 text-xs text-emerald-100/80">
              <p className="font-medium text-emerald-200">Rationale</p>
              <p className="mt-2 whitespace-pre-line leading-relaxed">
                {codex.templateDecision.rationale ?? 'Codex selected this template as the best match.'}
              </p>
              {typeof codex.templateDecision.confidence === 'number' && (
                <p className="mt-3 text-[10px] uppercase tracking-wide text-emerald-300/70">
                  Confidence {(codex.templateDecision.confidence * 100).toFixed(0)}%
                </p>
              )}
            </div>
          </div>
        </motion.section>
      )}

      {codex.workspaceVerification && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 p-5"
        >
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-cyan-200/80">Workspace verification</p>
              <h4 className="mt-1 text-lg font-semibold text-white">
                {codex.workspaceVerification.directory || 'Workspace path confirmed'}
              </h4>
              <p className="mt-1 text-xs text-cyan-100/80">
                {codex.workspaceVerification.exists ? 'Directory located and ready.' : 'Directory missing or inaccessible.'}
              </p>
            </div>
            {onViewFiles && (
              <button
                type="button"
                onClick={onViewFiles}
                className="rounded-full border border-white/20 bg-black/30 px-3 py-1 text-xs font-medium text-white transition hover:border-white/40 hover:bg-black/50"
              >
                Inspect Files
              </button>
            )}
          </header>
          {codex.workspaceVerification.discoveredEntries && codex.workspaceVerification.discoveredEntries.length > 0 && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-cyan-100/80">
              <p className="mb-2 font-medium text-cyan-200">Highlights</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {codex.workspaceVerification.discoveredEntries.slice(0, 6).map(item => (
                  <div key={item} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2 py-1">
                    <FolderCheck className="h-3.5 w-3.5 text-cyan-200" />
                    <span className="truncate">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {codex.workspaceVerification.notes && (
            <p className="mt-3 text-xs text-cyan-100/70">{codex.workspaceVerification.notes}</p>
          )}
        </motion.section>
      )}

      {codex.taskSummary && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-5"
        >
          <div className="flex items-start gap-3">
            <ClipboardList className="mt-1 h-5 w-5 text-yellow-300" />
            <div>
              <h4 className="text-lg font-semibold text-white">{codex.taskSummary.headline}</h4>
              <p className="mt-1 text-xs text-yellow-100/80">
                Captured {codex.taskSummary.capturedAt.toLocaleTimeString()}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-yellow-100/90">
                {codex.taskSummary.bullets.slice(0, 6).map((bullet, index) => (
                  <li key={`${bullet}-${index}`} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-yellow-200" />
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.section>
      )}

      {codex.executionInsights && codex.executionInsights.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-white/10 bg-black/40 p-5"
        >
          <header className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-white">Execution Feed</h4>
            {onStartServer && (
              <button
                type="button"
                onClick={onStartServer}
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white transition hover:border-white/40 hover:bg-white/10"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Start Dev Server
              </button>
            )}
          </header>
          <div className="mt-3 space-y-3">
            {codex.executionInsights.slice(-6).map(insight => (
              <div
                key={insight.id}
                className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white"
              >
                <span
                  className={`mt-1 inline-flex h-2 w-2 rounded-full ${
                    insight.tone === 'success'
                      ? 'bg-emerald-300'
                      : insight.tone === 'warning'
                        ? 'bg-amber-300'
                        : insight.tone === 'error'
                          ? 'bg-rose-300'
                          : 'bg-sky-300'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-100 leading-relaxed">{insight.text}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wide text-slate-500">
                    {insight.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.section>
      )}
    </div>
  );
}

export default CodexBuildExperience;

export function CodexPhaseStrip({ codex }: { codex: CodexSessionState }) {
  return (
    <div className="flex flex-wrap gap-2">
      {codex.phases.map(phase => {
        const colors = statusColors(phase.status);
        return (
          <span
            key={phase.id}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${colors.border} ${colors.bg} ${colors.text}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {phase.title}
          </span>
        );
      })}
    </div>
  );
}
