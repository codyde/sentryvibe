# Sentry.New - Astro Template

A modern Astro template with Sentry branding and Tailwind CSS v4, designed for use with [Sentry.New](https://sentry.new) application builder.

## Features

- **Astro v5** with modern web development
- **Tailwind CSS v4** for styling with Vite plugin
- **Sentry brand colors** with purple and pink accent theming
- **TypeScript** for type safety
- **Dark mode** support with CSS custom properties

## Quick Start

Use with degit to quickly scaffold a new project:

```bash
npx degit codyde/template-astro my-app
cd my-app
npm install
npm run dev
```

Or manually:

```bash
git clone https://github.com/codyde/template-astro.git
cd template-astro
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321) to see your application.

## Color Scheme

The template uses Sentry's brand colors:
- Primary: Purple (#6C5FC7 / oklch(0.52 0.15 285))
- Accent: Pink (#E1567C / oklch(0.65 0.18 340))
- Background: Light purple tints for light mode, dark purple for dark mode

## Project Structure

```
/
├── public/
│   └── favicon.svg
├── src/
│   ├── pages/
│   │   └── index.astro
│   └── styles/
│       └── global.css
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

## Learn More

- [Astro Documentation](https://docs.astro.build)
- [Tailwind CSS v4 Documentation](https://tailwindcss.com/docs)
