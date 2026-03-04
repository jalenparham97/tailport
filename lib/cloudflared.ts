export type TunnelRuntime = {
  stop: () => void;
};

/**
 * Starts a Cloudflare Tunnel pointing at the given port.
 *
 * - If `tunnelName` is provided, runs `cloudflared tunnel run <tunnelName>`.
 *   The tunnel must already be created and have DNS routes configured.
 *   This gives you stable, custom-domain URLs.
 *
 * - If `tunnelName` is omitted, runs `cloudflared tunnel --url http://localhost:<port>`.
 *   Cloudflare assigns a temporary random URL (printed to stdout by cloudflared).
 */
export async function enableTunnel(
  port: number,
  tunnelName?: string,
): Promise<TunnelRuntime> {
  const { getCloudflaredConfigPath } = await import('./config');
  const command = tunnelName
    ? [
        'cloudflared',
        'tunnel',
        '--config',
        getCloudflaredConfigPath(),
        'run',
        tunnelName,
      ]
    : ['cloudflared', 'tunnel', '--url', `http://localhost:${port}`];

  let proc: ReturnType<typeof Bun.spawn>;

  try {
    proc = Bun.spawn(command, {
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: 'inherit',
    });
  } catch (error) {
    throw new Error(
      `Failed to execute cloudflared. Make sure cloudflared is installed and available in PATH. ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Race: if cloudflared exits within 500 ms it failed to start.
  const earlyExit = await Promise.race([
    proc.exited.then((code) => code),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
  ]);

  if (earlyExit !== null && earlyExit !== 0) {
    throw new Error(
      `cloudflared exited immediately with code ${earlyExit}. Check your tunnel configuration.`,
    );
  }

  return {
    stop: () => proc.kill(),
  };
}
