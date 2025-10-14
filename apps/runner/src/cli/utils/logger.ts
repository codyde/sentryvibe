import chalk from 'chalk';

/**
 * CLI logger with colored output
 */
export class Logger {
  constructor(private verbose: boolean = false) {}

  info(message: string) {
    console.log(chalk.blue('ℹ'), message);
  }

  success(message: string) {
    console.log(chalk.green('✔'), message);
  }

  warn(message: string) {
    console.log(chalk.yellow('⚠'), message);
  }

  error(message: string) {
    console.error(chalk.red('✖'), message);
  }

  debug(message: string) {
    if (this.verbose) {
      console.log(chalk.gray('[debug]'), message);
    }
  }

  log(message: string) {
    console.log(message);
  }

  section(title: string) {
    console.log('\n' + chalk.bold(title));
  }
}

export const logger = new Logger();
