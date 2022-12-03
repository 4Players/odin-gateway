export async function resolve(address: string): Promise<string | undefined> {
  const resolved = await resolveAll(address);
  return resolved.length > 0
    ? resolved[Math.floor(Math.random() * resolved.length)]
    : undefined;
}

export async function resolveAll(address: string): Promise<string[]> {
  try {
    const ipv4s = await Deno.resolveDns(address, "A");
    if (ipv4s.length != 0) return ipv4s;
  } catch { /* intentionally left empty */ }
  try {
    const ipv6s = await Deno.resolveDns(address, "AAAA");
    if (ipv6s.length != 0) return ipv6s;
  } catch { /* intentionally left empty */ }
  const isIP = /^(?:\d+(?:\.\d+){3}|[0-9a-f]{1,4}(?::[0-9a-f]{0,4})+)$/i;
  return address.match(isIP) ? [address] : [];
}
