export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="container mx-auto px-6 py-8">
        <nav className="flex items-center justify-between">
          <div className="text-2xl font-bold text-white">Agent Monitoring</div>
          <div className="flex gap-6">
            <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
            <a href="#docs" className="text-slate-300 hover:text-white transition-colors">Docs</a>
            <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">Pricing</a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-20">
        <div className="max-w-5xl mx-auto text-center">
          {/* Announcement Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-200 text-sm mb-8">
            <span className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></span>
            Now Available
          </div>

          {/* Main Heading */}
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Agent Monitoring<br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              now supports
            </span><br />
            Claude Code SDK
          </h1>

          {/* Subheading */}
          <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
            Track, debug, and optimize your Claude Code agents in real-time. Get complete visibility into agent performance, errors, and usage patterns.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-20">
            <button className="px-8 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-lg shadow-purple-500/30">
              Get Started Free
            </button>
            <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white font-semibold rounded-lg transition-colors border border-white/20">
              View Documentation
            </button>
          </div>

          {/* Code Preview */}
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 text-left shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="ml-4 text-sm text-slate-400">quick-start.ts</span>
            </div>
            <pre className="text-sm text-slate-300 overflow-x-auto">
              <code>{`import { AgentMonitoring } from '@sentry/claude-code';

// Initialize monitoring
AgentMonitoring.init({
  dsn: 'your-project-dsn',
  environment: 'production',
  tracesSampleRate: 1.0,
});

// Automatically track agent performance
const agent = new ClaudeAgent({
  onError: AgentMonitoring.captureException,
  onPerformance: AgentMonitoring.trackMetric,
});`}</code>
            </pre>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="mt-32 max-w-6xl mx-auto">
          <h2 className="text-4xl font-bold text-white text-center mb-16">
            Everything you need to monitor your agents
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Real-time Tracking</h3>
              <p className="text-slate-400">
                Monitor agent execution, token usage, and performance metrics as they happen.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Error Detection</h3>
              <p className="text-slate-400">
                Automatically capture and categorize errors, with full context and stack traces.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Performance Insights</h3>
              <p className="text-slate-400">
                Deep analytics on agent behavior, costs, and optimization opportunities.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Distributed Tracing</h3>
              <p className="text-slate-400">
                Follow agent interactions across services and API calls with complete visibility.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Smart Alerts</h3>
              <p className="text-slate-400">
                Get notified when agents fail, exceed thresholds, or exhibit unusual patterns.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-slate-800/30 backdrop-blur-sm border border-slate-700 rounded-xl p-8 hover:border-purple-500/50 transition-colors">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Session Replay</h3>
              <p className="text-slate-400">
                Review complete agent sessions with full context, inputs, and decision paths.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-32 max-w-4xl mx-auto text-center">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <div className="text-5xl font-bold text-white mb-2">99.9%</div>
              <div className="text-slate-400">Uptime SLA</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-white mb-2">&lt;10ms</div>
              <div className="text-slate-400">Overhead</div>
            </div>
            <div>
              <div className="text-5xl font-bold text-white mb-2">10M+</div>
              <div className="text-slate-400">Events/day</div>
            </div>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-32 max-w-4xl mx-auto text-center bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 rounded-2xl p-12">
          <h2 className="text-4xl font-bold text-white mb-4">
            Start monitoring your agents today
          </h2>
          <p className="text-xl text-slate-300 mb-8">
            Free tier includes 10,000 events per month. No credit card required.
          </p>
          <button className="px-8 py-4 bg-white text-purple-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors shadow-lg">
            Create Free Account
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-12 mt-32 border-t border-slate-800">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-slate-400 text-sm">
            © 2024 Agent Monitoring. All rights reserved.
          </div>
          <div className="flex gap-8 text-slate-400 text-sm">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
