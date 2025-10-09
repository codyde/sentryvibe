import { motion } from 'framer-motion';
import { Shield, Zap, TrendingUp, Code2, AlertCircle, Activity } from 'lucide-react';
import AgentChatbot from './components/AgentChatbot';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0F0820] via-[#181225] to-[#0F0820] text-white overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#7553FF]/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#A737B4]/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-[#4E2A9A]/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-8 h-8 text-[#7553FF]" />
              <span className="text-2xl font-bold bg-gradient-to-r from-[#7553FF] to-[#A737B4] bg-clip-text text-transparent">
                Sentry Agent
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-[#9E86FF] hover:text-white transition-colors">Features</a>
              <a href="https://docs.sentry.io" target="_blank" rel="noopener noreferrer" className="text-[#9E86FF] hover:text-white transition-colors">Docs</a>
              <a
                href="https://sentry.io"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 rounded-full bg-gradient-to-r from-[#7553FF] to-[#A737B4] hover:opacity-90 transition-opacity font-medium"
              >
                Get Started
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 container mx-auto px-4 py-12 md:py-20">
        <div className="grid lg:grid-cols-2 gap-8 md:gap-12 items-center max-w-7xl mx-auto">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-6 md:space-y-8"
          >
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#4E2A9A]/30 border border-[#7553FF]/40 text-sm font-medium backdrop-blur-sm"
            >
              <Zap className="w-4 h-4 text-[#7553FF]" />
              <span className="text-[#E0D7FF]">AI-Powered Production Monitoring</span>
            </motion.div>

            {/* Heading */}
            <div className="space-y-4">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-tight"
              >
                Your AI Copilot for
                <span className="block mt-2 bg-gradient-to-r from-[#7553FF] via-[#A737B4] to-[#7553FF] animate-gradient bg-clip-text text-transparent">
                  Error-Free Code
                </span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-lg md:text-xl text-[#B8A5FF] max-w-xl leading-relaxed"
              >
                Stop babysitting dashboards. Sentry Agent monitors your production apps, catches errors before users do, and auto-fixes issues while you sleep.
                <span className="text-[#7553FF] font-semibold"> Deploy on Fridays? Yeah, we do that now.</span>
              </motion.p>
            </div>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <a
                href="https://sentry.io"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-[#7553FF] to-[#A737B4] text-white font-bold text-lg hover:scale-105 transition-transform shadow-lg shadow-[#7553FF]/50"
              >
                <Shield className="w-5 h-5" />
                Start Monitoring Free
                <motion.span
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="inline-block"
                >
                  →
                </motion.span>
              </a>
              <a
                href="https://docs.sentry.io"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border-2 border-[#7553FF] text-white font-bold text-lg hover:bg-[#7553FF]/10 transition-colors"
              >
                <Code2 className="w-5 h-5" />
                View Docs
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex flex-wrap gap-6 pt-4"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[#9E86FF] text-sm">
                  <span className="text-white font-bold">99.9%</span> uptime
                </span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#7553FF]" />
                <span className="text-[#9E86FF] text-sm">
                  <span className="text-white font-bold">3.5M+</span> developers trust Sentry
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                <span className="text-[#9E86FF] text-sm">
                  <span className="text-white font-bold">&lt;5ms</span> overhead
                </span>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Column - Animated Chatbot */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="relative h-[500px] md:h-[600px]"
          >
            <AgentChatbot />
          </motion.div>
        </div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
          id="features"
          className="mt-24 md:mt-32"
        >
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Why Developers{" "}
              <span className="bg-gradient-to-r from-[#7553FF] to-[#A737B4] bg-clip-text text-transparent">
                Actually Use This
              </span>
            </h2>
            <p className="text-[#9E86FF] text-lg">No BS. Just tools that work.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto">
            {[
              {
                icon: <Shield className="w-8 h-8" />,
                title: "Proactive Error Detection",
                description: "Agent catches issues before they become incidents. Get alerted about anomalies in real-time with context, not just stack traces.",
                color: "from-[#7553FF] to-[#A737B4]"
              },
              {
                icon: <Activity className="w-8 h-8" />,
                title: "Smart Auto-Rollbacks",
                description: "Deployed broken code? Agent detects spikes in errors and can trigger rollbacks automatically. Sleep better on deploy days.",
                color: "from-[#A737B4] to-[#D946EF]"
              },
              {
                icon: <AlertCircle className="w-8 h-8" />,
                title: "Context-Aware Alerts",
                description: "No more alert fatigue. Agent understands your app's baseline and only pings you when something's actually wrong.",
                color: "from-[#7553FF] to-[#06B6D4]"
              },
              {
                icon: <Code2 className="w-8 h-8" />,
                title: "Code-Level Insights",
                description: "See exactly which line caused the error, who wrote it (sorry), and suggested fixes. All in your Slack or terminal.",
                color: "from-[#D946EF] to-[#F43F5E]"
              },
              {
                icon: <TrendingUp className="w-8 h-8" />,
                title: "Performance Tracking",
                description: "Track response times, DB queries, and API calls. Agent spots performance regressions before your users rage-tweet.",
                color: "from-[#06B6D4] to-[#10B981]"
              },
              {
                icon: <Zap className="w-8 h-8" />,
                title: "Deploy with Confidence",
                description: "CI/CD integration that actually makes sense. Run checks, validate deploys, and get instant feedback. Friday deploys? Let's go.",
                color: "from-[#F59E0B] to-[#EF4444]"
              }
            ].map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 + index * 0.1 }}
                className="group relative bg-[#1A0F2E]/50 backdrop-blur-sm border border-[#4E2A9A]/30 rounded-2xl p-6 hover:border-[#7553FF] transition-all hover:-translate-y-2"
              >
                <div className={`inline-flex p-3 rounded-xl bg-gradient-to-br ${feature.color} mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 text-white">{feature.title}</h3>
                <p className="text-[#B8A5FF] leading-relaxed">{feature.description}</p>

                {/* Hover effect gradient */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#7553FF]/0 to-[#A737B4]/0 group-hover:from-[#7553FF]/5 group-hover:to-[#A737B4]/5 transition-all duration-300 pointer-events-none" />
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA Section */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5 }}
          className="mt-24 md:mt-32 text-center"
        >
          <div className="relative bg-gradient-to-r from-[#7553FF]/20 to-[#A737B4]/20 border border-[#7553FF]/30 rounded-3xl p-8 md:p-12 max-w-4xl mx-auto backdrop-blur-sm">
            <h2 className="text-3xl md:text-5xl font-black mb-4">
              Ready to Ship Fearlessly?
            </h2>
            <p className="text-[#B8A5FF] text-lg mb-8 max-w-2xl mx-auto">
              Join thousands of developers who stopped losing sleep over production bugs.
              Get started in under 5 minutes.
            </p>
            <a
              href="https://sentry.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-10 py-5 rounded-full bg-gradient-to-r from-[#7553FF] to-[#A737B4] text-white font-bold text-xl hover:scale-105 transition-transform shadow-2xl shadow-[#7553FF]/50"
            >
              Start Free Trial
              <motion.span
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                →
              </motion.span>
            </a>
            <p className="text-[#9E86FF] text-sm mt-4">No credit card required • Free forever for small teams</p>
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#4E2A9A]/30 mt-24">
        <div className="container mx-auto px-4 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Shield className="w-6 h-6 text-[#7553FF]" />
              <span className="text-xl font-bold bg-gradient-to-r from-[#7553FF] to-[#A737B4] bg-clip-text text-transparent">
                Sentry Agent
              </span>
            </div>
            <div className="flex gap-6 text-sm text-[#9E86FF]">
              <a href="https://sentry.io" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Sentry.io
              </a>
              <a href="https://docs.sentry.io" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                Documentation
              </a>
              <a href="https://github.com/getsentry" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
                GitHub
              </a>
            </div>
          </div>
          <div className="text-center mt-8 text-sm text-[#9E86FF]">
            <p>
              Built with 💜 for developers who ship fast |{" "}
              <a
                href="https://sentry.new"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#7553FF] hover:underline font-medium"
              >
                Powered by Sentry.New
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
