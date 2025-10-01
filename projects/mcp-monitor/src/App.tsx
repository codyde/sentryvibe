import './App.css'

function App() {
  return (
    <div className="landing-page">
      {/* Header */}
      <header className="header">
        <nav className="nav">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">MCP Monitor</span>
          </div>
          <div className="nav-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#docs">Docs</a>
            <button className="btn-primary">Get Started</button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          <h1 className="hero-title">
            Monitor Your MCP Servers
            <span className="gradient-text"> In Real-Time</span>
          </h1>
          <p className="hero-subtitle">
            Comprehensive monitoring, alerting, and analytics for Model Context Protocol servers.
            Keep your AI infrastructure running smoothly.
          </p>
          <div className="hero-cta">
            <button className="btn-large btn-primary">Start Free Trial</button>
            <button className="btn-large btn-secondary">View Demo</button>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <div className="stat-value">99.9%</div>
              <div className="stat-label">Uptime</div>
            </div>
            <div className="stat">
              <div className="stat-value">&lt;100ms</div>
              <div className="stat-label">Latency</div>
            </div>
            <div className="stat">
              <div className="stat-value">10K+</div>
              <div className="stat-label">Servers Monitored</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <h2 className="section-title">Everything You Need</h2>
        <p className="section-subtitle">Powerful monitoring tools built for MCP servers</p>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Real-Time Metrics</h3>
            <p>Track response times, throughput, error rates, and resource usage in real-time.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔔</div>
            <h3>Smart Alerts</h3>
            <p>Get notified instantly when issues arise. Configure custom thresholds and notification channels.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">📈</div>
            <h3>Performance Analytics</h3>
            <p>Deep insights into server performance with historical data and trend analysis.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>Request Tracing</h3>
            <p>Trace every request through your MCP infrastructure with detailed logs.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">🛡️</div>
            <h3>Security Monitoring</h3>
            <p>Monitor authentication failures, rate limits, and suspicious activity.</p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">⚙️</div>
            <h3>Easy Integration</h3>
            <p>Simple SDK integration with support for all major MCP implementations.</p>
          </div>
        </div>
      </section>

      {/* Status Dashboard Preview */}
      <section className="dashboard-preview">
        <h2 className="section-title">Beautiful Dashboards</h2>
        <p className="section-subtitle">Monitor everything at a glance</p>

        <div className="dashboard-mockup">
          <div className="mockup-header">
            <div className="mockup-dot"></div>
            <div className="mockup-dot"></div>
            <div className="mockup-dot"></div>
          </div>
          <div className="mockup-content">
            <div className="metric-cards">
              <div className="metric-card">
                <div className="metric-label">Active Servers</div>
                <div className="metric-value">127</div>
                <div className="metric-change positive">↑ 12%</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Avg Response Time</div>
                <div className="metric-value">45ms</div>
                <div className="metric-change positive">↓ 8%</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Error Rate</div>
                <div className="metric-value">0.02%</div>
                <div className="metric-change positive">↓ 15%</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Requests/sec</div>
                <div className="metric-value">1.2K</div>
                <div className="metric-change positive">↑ 23%</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <h2 className="cta-title">Ready to start monitoring?</h2>
        <p className="cta-subtitle">Join thousands of developers monitoring their MCP servers</p>
        <button className="btn-large btn-primary">Get Started Free</button>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#updates">Updates</a>
          </div>
          <div className="footer-section">
            <h4>Resources</h4>
            <a href="#docs">Documentation</a>
            <a href="#api">API Reference</a>
            <a href="#guides">Guides</a>
          </div>
          <div className="footer-section">
            <h4>Company</h4>
            <a href="#about">About</a>
            <a href="#blog">Blog</a>
            <a href="#contact">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2024 MCP Monitor. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}

export default App
