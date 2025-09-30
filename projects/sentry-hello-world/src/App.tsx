import { useState } from 'react'
import { AlertCircle, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import './App.css'

type LogLevel = 'error' | 'warning' | 'info' | 'success' | 'debug'

interface LogEntry {
  id: string
  level: LogLevel
  message: string
  timestamp: string
}

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: '1',
      level: 'success',
      message: 'Hello World! Application initialized successfully',
      timestamp: new Date().toISOString()
    }
  ])

  const addLog = (level: LogLevel, message: string) => {
    const newLog: LogEntry = {
      id: Date.now().toString(),
      level,
      message,
      timestamp: new Date().toISOString()
    }
    setLogs([newLog, ...logs])
  }

  const getLogIcon = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return <XCircle className="w-5 h-5" />
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />
      case 'info':
        return <Info className="w-5 h-5" />
      case 'success':
        return <CheckCircle className="w-5 h-5" />
      case 'debug':
        return <AlertCircle className="w-5 h-5" />
    }
  }

  const getLogColor = (level: LogLevel) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'success':
        return 'text-green-600 bg-green-50 border-green-200'
      case 'debug':
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-500 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-5xl font-bold text-white">Sentry Logger</h1>
          </div>
          <p className="text-purple-200 text-lg">
            Hello World - Production-Ready Error Tracking
          </p>
        </div>

        {/* Action Buttons */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 mb-6 border border-white/20">
          <h2 className="text-white font-semibold mb-4">Generate Log Events</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => addLog('success', 'Operation completed successfully')}
              className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-colors"
            >
              Success Log
            </button>
            <button
              onClick={() => addLog('info', 'User action logged')}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
            >
              Info Log
            </button>
            <button
              onClick={() => addLog('warning', 'Potential issue detected')}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium transition-colors"
            >
              Warning Log
            </button>
            <button
              onClick={() => addLog('error', 'Something went wrong!')}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            >
              Error Log
            </button>
            <button
              onClick={() => addLog('debug', 'Debug information logged')}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              Debug Log
            </button>
          </div>
        </div>

        {/* Logs Display */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold">Event Log Stream</h2>
            <span className="text-purple-200 text-sm">{logs.length} events</span>
          </div>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-4 rounded-lg border ${getLogColor(log.level)} transition-all hover:shadow-md`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {getLogIcon(log.level)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold uppercase text-xs tracking-wide">
                        {log.level}
                      </span>
                      <span className="text-xs opacity-75">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-sm">{log.message}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-8 text-purple-300 text-sm">
          <p>Powered by Sentry-style logging • Built with React + Vite</p>
        </div>
      </div>
    </div>
  )
}

export default App