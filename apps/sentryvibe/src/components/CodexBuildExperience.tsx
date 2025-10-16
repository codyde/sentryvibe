import type { ComponentType } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  Loader2,
  Circle,
} from 'lucide-react';
import type { CodexSessionState, CodexPhase, TodoItem } from '@/types/generation';

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
  todos?: TodoItem[];
}

export function CodexBuildExperience({
  codex,
  projectName,
  isActive,
  onViewFiles,
  onStartServer,
  todos = [],
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

  return (
    <div className="space-y-6">

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

      {todos.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="rounded-2xl border border-purple-500/30 bg-purple-500/10 p-5"
        >
          <header className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/20 text-purple-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-white">Live Task Progress</h4>
                <p className="text-xs text-purple-200/80">
                  {todos.filter(t => t.status === 'completed').length} of {todos.length} tasks complete
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-purple-400">
                {Math.round((todos.filter(t => t.status === 'completed').length / todos.length) * 100)}%
              </div>
            </div>
          </header>

          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {todos.map((todo, index) => (
                <motion.div
                  key={`${todo.content}-${index}`}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.03 }}
                  className={`flex items-start gap-3 rounded-lg border p-3 transition-all ${
                    todo.status === 'completed'
                      ? 'border-emerald-500/30 bg-emerald-950/20'
                      : todo.status === 'in_progress'
                        ? 'border-purple-500/40 bg-purple-950/30 shadow-lg shadow-purple-500/10'
                        : 'border-purple-700/30 bg-purple-900/20'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {todo.status === 'completed' ? (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      >
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                      </motion.div>
                    ) : todo.status === 'in_progress' ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      >
                        <Loader2 className="h-5 w-5 text-purple-400" />
                      </motion.div>
                    ) : (
                      <Circle className="h-5 w-5 text-purple-500" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        todo.status === 'completed'
                          ? 'text-emerald-300 line-through'
                          : todo.status === 'in_progress'
                            ? 'text-white'
                            : 'text-purple-200'
                      }`}
                    >
                      {todo.status === 'in_progress' ? todo.activeForm : todo.content}
                    </p>

                    {todo.status === 'in_progress' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 h-1 overflow-hidden rounded-full bg-purple-900/50"
                      >
                        <motion.div
                          animate={{
                            x: ['-100%', '100%'],
                          }}
                          transition={{
                            duration: 1.5,
                            repeat: Infinity,
                            ease: 'easeInOut',
                          }}
                          className="h-full w-1/3 bg-gradient-to-r from-transparent via-purple-400 to-transparent"
                        />
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
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
