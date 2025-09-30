# Sentry Setup Instructions

This Hello Sentry app has been configured with **Sentry monitoring** including:
- ✅ **Error Monitoring** - Automatic error tracking
- ✅ **Session Replay** - Video-like reproductions of user sessions
- ✅ **Performance Traces** - Track application performance
- ✅ **Logs Integration** - Centralized log management

## 🚀 Quick Setup

### 1. Create a Sentry Account & Project

1. Go to [sentry.io](https://sentry.io/signup/) and create an account (if you don't have one)
2. Create a new project and select **React** as the platform
3. Copy your **DSN** (Data Source Name) - it looks like:
   ```
   https://examplePublicKey@o0.ingest.sentry.io/0
   ```

### 2. Configure Your DSN

Open `src/instrument.ts` and replace the placeholder DSN with your actual DSN:

```typescript
Sentry.init({
  dsn: "YOUR_ACTUAL_DSN_HERE", // Replace this!
  // ... rest of config
});
```

### 3. Run the Application

```bash
npm run dev
```

### 4. Test Sentry Features

The app includes three test buttons:

1. **🚨 Throw Error** - Tests basic error monitoring
2. **📊 Error + Trace** - Tests error tracking with performance tracing
3. **📝 Send Logs** - Tests the logs integration

Click these buttons and then check your Sentry dashboard to see the captured data!

## 📊 View Your Data in Sentry

After triggering test events, visit your Sentry project to see:

- **Issues** → View captured errors
- **Traces** → See performance traces
- **Replays** → Watch session replays
- **Logs** → Browse application logs

## ⚙️ Configuration Details

### Current Settings (in `src/instrument.ts`):

- **tracesSampleRate**: `1.0` (100% - captures all transactions)
  - *Lower this in production (e.g., 0.1 for 10%)*
  
- **replaysSessionSampleRate**: `0.1` (10% - captures 10% of sessions)
  
- **replaysOnErrorSampleRate**: `1.0` (100% - captures all sessions with errors)

- **enableLogs**: `true` - Console logs are sent to Sentry

### Features Enabled:

1. **Browser Tracing Integration** - Tracks page loads and navigation
2. **Replay Integration** - Records user sessions
3. **Error Boundary** - Catches React errors with custom fallback UI
4. **Logs Integration** - Captures console.log, console.warn, console.error

## 🎨 Brand Colors Used

This app showcases Sentry's official brand colors:
- **Primary Purple**: #362D59
- **Accent Coral**: #EB5B3B
- **Dark Background**: #1D1127

## 📚 Additional Resources

- [Sentry React Documentation](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Session Replay Guide](https://docs.sentry.io/product/explore/session-replay/web/)
- [Performance Monitoring](https://docs.sentry.io/product/tracing/)
- [Logs Documentation](https://docs.sentry.io/product/explore/logs/)

## 🔧 Troubleshooting

### Not seeing data in Sentry?

1. Make sure you've replaced the DSN with your actual project DSN
2. Check browser console for any Sentry initialization errors
3. Verify your project settings in Sentry dashboard
4. Make sure you're viewing the correct project in Sentry

### Ad blockers blocking Sentry?

Add the `tunnel` option to your Sentry.init() config to bypass ad blockers (see [documentation](https://docs.sentry.io/platforms/javascript/guides/react/troubleshooting/#using-the-tunnel-option))
