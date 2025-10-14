/**
 * ASCII art banner for SentryVibe CLI
 */

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  purple: '\x1b[35m',
  brightPurple: '\x1b[95m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

/**
 * Displays the SentryVibe banner with "Vibe" in purple
 */
export function displayBanner(): void {
  const banner = `
${colors.cyan}███████╗███████╗███╗   ██╗████████╗██████╗ ██╗   ██╗${colors.brightPurple}██╗   ██╗██╗██████╗ ███████╗${colors.reset}
${colors.cyan}██╔════╝██╔════╝████╗  ██║╚══██╔══╝██╔══██╗╚██╗ ██╔╝${colors.brightPurple}██║   ██║██║██╔══██╗██╔════╝${colors.reset}
${colors.cyan}███████╗█████╗  ██╔██╗ ██║   ██║   ██████╔╝ ╚████╔╝ ${colors.brightPurple}██║   ██║██║██████╔╝█████╗${colors.reset}
${colors.cyan}╚════██║██╔══╝  ██║╚██╗██║   ██║   ██╔══██╗  ╚██╔╝  ${colors.brightPurple}╚██╗ ██╔╝██║██╔══██╗██╔══╝${colors.reset}
${colors.cyan}███████║███████╗██║ ╚████║   ██║   ██║  ██║   ██║   ${colors.brightPurple} ╚████╔╝ ██║██████╔╝███████╗${colors.reset}
${colors.cyan}╚══════╝╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝   ╚═╝   ${colors.brightPurple}  ╚═══╝  ╚═╝╚═════╝ ╚══════╝${colors.reset}
`;

  console.log(banner);
}
