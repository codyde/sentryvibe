import { useState } from 'react'
import * as Sentry from '@sentry/react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)
  
  // Test Sentry error tracking
  const throwTestError = () => {
    throw new Error("Sentry Test Error - This is intentional!");
  }
  
  // Test Sentry with tracing
  const throwTestErrorWithTrace = () => {
    Sentry.startSpan({ op: "test", name: "Example Frontend Span" }, () => {
      // Log a message to test Sentry Logs
      console.log("Testing Sentry Logs integration");
      
      setTimeout(() => {
        throw new Error("Sentry Traced Error - This is intentional!");
      }, 99);
    });
  }
  
  // Test Sentry logs manually
  const testSentryLogs = () => {
    console.log("Info: Testing Sentry Logs feature");
    console.warn("Warning: This is a test warning");
    console.error("Error: This is a test error log");
    Sentry.captureMessage("Custom message sent to Sentry", "info");
  }

  return (
    <div className="app">
      <div className="sentry-logo">
        <svg width="80" height="80" viewBox="0 0 72 66" fill="none">
          <path d="M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43c-.07-.15-19.86-34.11-20.36-34.85Z" fill="#362D59"/>
        </svg>
      </div>
      <h1>Hello Sentry! 👋</h1>
      <p className="subtitle">Welcome to your Sentry-branded app</p>
      
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          Clicks: {count}
        </button>
        <p className="description">
          Built with <span className="highlight">Sentry</span> brand colors
        </p>
      </div>
      
      <div className="features">
        <div className="feature">
          <h3>🎨 Sentry Purple</h3>
          <p>#362D59</p>
        </div>
        <div className="feature">
          <h3>🔥 Sentry Coral</h3>
          <p>#EB5B3B</p>
        </div>
        <div className="feature">
          <h3>✨ Dark Theme</h3>
          <p>#1D1127</p>
        </div>
      </div>
      
      <div className="sentry-test-section">
        <h2>🧪 Test Sentry Features</h2>
        <p className="test-description">Click the buttons below to test Sentry monitoring</p>
        
        <div className="test-buttons">
          <button onClick={throwTestError} className="test-button error">
            🚨 Throw Error
          </button>
          
          <button onClick={throwTestErrorWithTrace} className="test-button trace">
            📊 Error + Trace
          </button>
          
          <button onClick={testSentryLogs} className="test-button logs">
            📝 Send Logs
          </button>
        </div>
        
        <div className="feature-badges">
          <span className="badge">✅ Error Monitoring</span>
          <span className="badge">✅ Session Replay</span>
          <span className="badge">✅ Performance Traces</span>
          <span className="badge">✅ Logs Integration</span>
        </div>
      </div>
    </div>
  )
}

// Wrap the default export with Sentry ErrorBoundary
export default Sentry.withErrorBoundary(App, {
  fallback: ({ error, resetError }) => (
    <div style={{ 
      padding: '40px', 
      textAlign: 'center', 
      background: '#1D1127',
      minHeight: '100vh',
      color: 'white',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <h1 style={{ color: '#EB5B3B', marginBottom: '20px' }}>⚠️ Oops! Something went wrong</h1>
      <p style={{ marginBottom: '10px', color: '#E0E0E0' }}>Error: {error.message}</p>
      <p style={{ marginBottom: '30px', fontSize: '14px', color: '#999' }}>This error has been reported to Sentry</p>
      <button 
        onClick={resetError}
        style={{
          background: 'linear-gradient(135deg, #362D59 0%, #EB5B3B 100%)',
          color: 'white',
          padding: '12px 32px',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: '600'
        }}
      >
        Try Again
      </button>
    </div>
  ),
  showDialog: true,
})
