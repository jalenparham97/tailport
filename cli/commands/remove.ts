import { deleteRoute } from '../../lib/routes';

export async function runRemoveCommand(
  name: string | undefined,
): Promise<void> {
  if (!name) {
    throw new Error('Usage: tailport remove <name>');
  }

  const removed = await deleteRoute(name);

  if (!removed) {
    console.log(`[tailport] no route named ${name} was found`);
    return;
  }

  console.log(`[tailport] removed ${name}`);
}
