export async function runUpgradeCommand(): Promise<void> {
  const res = await fetch(
    'https://api.github.com/repos/jalenparham97/tailport/releases/latest',
  );
  if (!res.ok) throw new Error('Could not fetch latest release info.');

  const { tag_name: latest } = (await res.json()) as { tag_name: string };

  console.log(`[tailport] installing ${latest}...`);

  const proc = Bun.spawn(
    [
      'sh',
      '-c',
      'curl -fsSL https://raw.githubusercontent.com/jalenparham97/tailport/main/scripts/install.sh | sudo sh',
    ],
    { stdout: 'inherit', stderr: 'inherit', stdin: 'inherit' },
  );

  const code = await proc.exited;
  if (code !== 0) throw new Error(`Upgrade failed with exit code ${code}`);

  console.log(`[tailport] upgraded to ${latest}`);
}
