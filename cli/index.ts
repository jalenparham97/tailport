import { runExposeCommand } from './commands/expose';
import { runListCommand } from './commands/list';
import { runRemoveCommand } from './commands/remove';
import { runSetupCommand } from './commands/setup';
import { runStartCommand } from './commands/start';

function printHelp(): void {
  console.log(`tailport

Usage:
  tailport setup
  tailport start
  tailport expose <name> <target>
  tailport remove <name>
  tailport list`);
}

async function main(): Promise<void> {
  const [, , command, ...args] = Bun.argv;

  switch (command) {
    case 'setup':
      await runSetupCommand();
      return;
    case 'start':
      await runStartCommand();
      return;
    case 'expose':
      await runExposeCommand(args[0], args[1]);
      return;
    case 'remove':
      await runRemoveCommand(args[0]);
      return;
    case 'list':
      await runListCommand();
      return;
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[tailport] ${message}`);
  process.exit(1);
});
