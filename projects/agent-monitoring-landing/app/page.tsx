export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Header */}
      <header className="border-b border-white/10 backdrop-blur-sm">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg"></div>
            <span className="text-white font-bold text-xl">Agent Monitor</span>
          </div>
          <div className="flex gap-6 items-center">
            <a href="#features" className="text-gray-300 hover:text-white transition-colors">Features</a>
            <a href="#integration" className="text-gray-300 hover:text-white transition-colors">Integration</a>
            <a href="https://docs.sentry.io" target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors">
              Get Started
            </a>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center mb-20">
          <div className="inline-block mb-4 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-full">
            <span className="text-purple-300 text-sm font-medium">Now Supporting Claude Code Agent SDK</span>
          </div>
          <h1 className="text-6xl font-bold text-white mb-6 leading-tight">
            Complete Visibility Into
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI Agent Performance
            </span>
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Monitor, debug, and optimize your Claude Code agents in production with real-time insights, error tracking, and performance analytics.
          </p>
          <div className="flex gap-4 justify-center">
            <button className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-semibold text-lg transition-all transform hover:scale-105">
              Start Monitoring Free
            </button>
            <button className="px-8 py-4 bg-white/10 hover:bg-white/20 text-white rounded-lg font-semibold text-lg border border-white/20 transition-all">
              View Demo
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-8 text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">99.9%</div>
            <div className="text-gray-300">Uptime Monitoring</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-8 text-center">
            <div className="text-4xl font-bold text-pink-400 mb-2">&lt;100ms</div>
            <div className="text-gray-300">Latency Overhead</div>
          </div>
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-8 text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">10M+</div>
            <div className="text-gray-300">Agent Actions Tracked</div>
          </div>
        </div>

        {/* Features Section */}
        <div id="features" className="mb-20">
          <h2 className="text-4xl font-bold text-white text-center mb-12">
            Everything You Need to Monitor AI Agents
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🔍</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Real-Time Tracing</h3>
              <p className="text-gray-400">Track every tool call, prompt, and response in your Claude agents with detailed execution traces.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Error Tracking</h3>
              <p className="text-gray-400">Catch and diagnose agent failures before they impact users with intelligent error grouping.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Performance Metrics</h3>
              <p className="text-gray-400">Monitor token usage, latency, and cost per agent execution with actionable insights.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🔗</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Tool Call Visibility</h3>
              <p className="text-gray-400">See exactly which tools your agents are invoking and how they're being used.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🎯</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Context Tracking</h3>
              <p className="text-gray-400">Monitor conversation context, token windows, and memory usage across agent sessions.</p>
            </div>

            <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all">
              <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-4">
                <span className="text-2xl">🚀</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Zero Config Setup</h3>
              <p className="text-gray-400">Install with one command and start monitoring your Claude agents in under 2 minutes.</p>
            </div>
          </div>
        </div>

        {/* Integration Section */}
        <div id="integration" className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 backdrop-blur-sm border border-white/10 rounded-2xl p-12 mb-20">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-4xl font-bold text-white text-center mb-6">
              Seamless Claude Code Agent SDK Integration
            </h2>
            <p className="text-xl text-gray-300 text-center mb-8">
              Add monitoring to your agents in seconds with native support for the Claude Code Agent SDK
            </p>
            <div className="bg-slate-950 rounded-xl p-6 border border-white/10">
              <pre className="text-green-400 font-mono text-sm overflow-x-auto">
                <code>{`# Install Sentry SDK
npm install @sentry/node --save

# Initialize in your agent
import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "your-dsn-here",
  integrations: [
    Sentry.agentMonitoringIntegration(),
  ],
  tracesSampleRate: 1.0,
});

// Your agent code automatically monitored!`}</code>
              </pre>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Start Monitoring Your Agents Today
          </h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of developers building reliable AI agents with confidence
          </p>
          <button className="px-10 py-5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-lg font-bold text-xl transition-all transform hover:scale-105 shadow-2xl">
            Get Started Free →
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-20">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-gray-400 mb-4 md:mb-0">
            © 2024 Agent Monitor. Powered by Sentry.
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Documentation</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">GitHub</a>
            <a href="#" className="text-gray-400 hover:text-white transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
