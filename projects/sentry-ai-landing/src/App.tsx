import { Terminal, Zap, Shield, Code2, Sparkles, ArrowRight, Github } from 'lucide-react'

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950">
      {/* Nav */}
      <nav className="border-b border-purple-500/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-purple-400" />
            <span className="text-2xl font-bold text-white">Sentry AI</span>
          </div>
          <div className="flex gap-6">
            <a href="#features" className="text-gray-300 hover:text-purple-400 transition-colors">Features</a>
            <a href="#docs" className="text-gray-300 hover:text-purple-400 transition-colors">Docs</a>
            <button className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/30 rounded-full px-4 py-2 mb-8">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300 font-mono">AI-Powered Error Resolution</span>
          </div>
          
          <h1 className="text-6xl md:text-7xl font-bold text-white mb-6 text-balance">
            Debug at the{' '}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
              speed of thought
            </span>
          </h1>
          
          <p className="text-xl text-gray-400 mb-12 max-w-2xl mx-auto text-balance">
            Sentry AI analyzes your errors, suggests fixes, and ships patches before you've even finished your coffee.
            Because your time is too valuable for manual debugging.
          </p>

          <div className="flex gap-4 justify-center mb-12">
            <button className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-4 rounded-lg font-medium text-lg flex items-center gap-2 transition-all hover:scale-105">
              Start Building
              <ArrowRight className="w-5 h-5" />
            </button>
            <button className="border border-purple-500/30 hover:border-purple-500/50 text-white px-8 py-4 rounded-lg font-medium text-lg flex items-center gap-2 transition-all hover:scale-105">
              <Github className="w-5 h-5" />
              View on GitHub
            </button>
          </div>

          {/* Code Demo */}
          <div className="bg-slate-900/50 backdrop-blur border border-purple-500/20 rounded-xl p-6 text-left max-w-3xl mx-auto shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <Terminal className="w-5 h-5 text-purple-400" />
              <span className="text-sm text-gray-400 font-mono">sentry-ai.ts</span>
            </div>
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">
              <code>{`// AI automatically detects the issue
try {
  await processPayment(user);
} catch (error) {
  // Sentry AI suggests fix in real-time
  Sentry.captureException(error);
  // ⚡ AI: Null pointer at user.paymentMethod
  // 🔧 Suggested fix: Add null check
  // 🚀 Auto-apply patch? [Y/n]
}`}</code>
            </pre>
          </div>
        </div>

        {/* Features Grid */}
        <div id="features" className="grid md:grid-cols-3 gap-8 mt-24">
          <div className="bg-slate-900/30 backdrop-blur border border-purple-500/20 rounded-xl p-8 hover:border-purple-500/40 transition-all">
            <div className="bg-purple-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Instant Analysis</h3>
            <p className="text-gray-400">
              AI-powered stack trace analysis that understands your codebase context. Get actionable insights in milliseconds.
            </p>
          </div>

          <div className="bg-slate-900/30 backdrop-blur border border-purple-500/20 rounded-xl p-8 hover:border-purple-500/40 transition-all">
            <div className="bg-purple-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Code2 className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Smart Suggestions</h3>
            <p className="text-gray-400">
              Context-aware fix recommendations with code examples. Learn from millions of resolved errors across projects.
            </p>
          </div>

          <div className="bg-slate-900/30 backdrop-blur border border-purple-500/20 rounded-xl p-8 hover:border-purple-500/40 transition-all">
            <div className="bg-purple-500/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">Auto-Remediation</h3>
            <p className="text-gray-400">
              Let AI create PRs with fixes for common errors. Review, approve, and merge with confidence.
            </p>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-24 grid md:grid-cols-4 gap-8">
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">10M+</div>
            <div className="text-gray-400">Errors Analyzed Daily</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">80%</div>
            <div className="text-gray-400">Faster Resolution</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">95%</div>
            <div className="text-gray-400">Fix Accuracy</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold text-purple-400 mb-2">24/7</div>
            <div className="text-gray-400">AI Monitoring</div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="mt-24 bg-gradient-to-r from-purple-900/50 to-pink-900/50 backdrop-blur border border-purple-500/30 rounded-2xl p-12 text-center">
          <h2 className="text-4xl font-bold text-white mb-4">Ship code with confidence</h2>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of developers who've automated their debugging workflow with Sentry AI.
          </p>
          <div className="flex gap-4 justify-center">
            <button className="bg-white hover:bg-gray-100 text-purple-900 px-8 py-4 rounded-lg font-bold text-lg transition-all hover:scale-105">
              Start Free Trial
            </button>
            <button className="border-2 border-white/30 hover:border-white/50 text-white px-8 py-4 rounded-lg font-bold text-lg transition-all hover:scale-105">
              Talk to Sales
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-purple-500/20 mt-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-purple-400" />
              <span className="text-lg font-bold text-white">Sentry AI</span>
            </div>
            <div className="text-gray-400 text-sm font-mono">
              © 2024 Functional Software, Inc. Built for developers, by developers.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App