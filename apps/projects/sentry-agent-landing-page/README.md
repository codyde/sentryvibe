# React + Vite + Tailwind CSS Template

A modern starter template for [sentry.new](https://sentry.new) featuring React 19, Vite 7, TypeScript, and Tailwind CSS v4.

## Features

- ⚡️ **Vite 7** - Lightning-fast build tool and dev server
- ⚛️ **React 19** - Latest React with improved performance
- 🎨 **Tailwind CSS v4** - Latest version with simplified configuration
- 📘 **TypeScript** - Type safety and better DX
- 🔍 **ESLint** - Code quality and consistency
- 🎯 **Modern tooling** - Hot module replacement, fast refresh, and more

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Tech Stack

- **React 19** - UI library
- **Vite 7** - Build tool and dev server
- **Tailwind CSS v4** - Utility-first CSS framework
- **TypeScript** - Type safety
- **ESLint** - Linting and code quality

## Tailwind CSS v4 Setup

This template uses Tailwind CSS v4 with the Vite plugin for optimal performance:

- **No configuration required** - Tailwind automatically detects your template files
- **Simplified CSS** - Just `@import "tailwindcss"` in your CSS file
- **Lightning fast** - 5x faster full builds, 100x faster incremental builds

## Project Structure

```
├── src/
│   ├── assets/         # Static assets
│   ├── App.tsx         # Main app component
│   ├── main.tsx        # App entry point
│   └── index.css       # Global styles with Tailwind
├── public/             # Public assets
├── index.html          # HTML entry point
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

## Customization

### Styling

The template uses Tailwind CSS v4 with Sentry branding colors. To customize:

- Edit `src/index.css` for global styles
- Modify component classes in `src/App.tsx`
- Tailwind utilities are automatically available

### TypeScript

TypeScript configuration can be modified in:
- `tsconfig.json` - App TypeScript config
- `tsconfig.node.json` - Node/Vite config

### ESLint

If you are developing a production application, you may want to enable type-aware lint rules. See the [TypeScript ESLint documentation](https://typescript-eslint.io/) for more information.

## License

MIT

## Resources

- [React Documentation](https://react.dev)
- [Vite Documentation](https://vite.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com)
- [TypeScript Documentation](https://www.typescriptlang.org)
