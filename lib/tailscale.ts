export async function enableFunnel(port: number): Promise<void> {
  const command = ['tailscale', 'funnel', String(port)];

  let proc: ReturnType<typeof Bun.spawn>;

  try {
    proc = Bun.spawn(command, {
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'inherit',
    });
  } catch (error) {
    throw new Error(
      `Failed to execute tailscale. Make sure Tailscale is installed and available in PATH. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const stdoutPromise =
    proc.stdout && typeof proc.stdout !== 'number'
      ? new Response(proc.stdout).text()
      : Promise.resolve('');

  const stderrPromise =
    proc.stderr && typeof proc.stderr !== 'number'
      ? new Response(proc.stderr).text()
      : Promise.resolve('');

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    stdoutPromise,
    stderrPromise,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `tailscale funnel failed (exit ${exitCode}). ${stderr.trim() || stdout.trim()}`,
    );
  }
}
