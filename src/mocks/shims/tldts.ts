// tough-cookie (via MSW) só usa getDomain; evita embutir a lista de sufixos (~185 kB).
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

export function getDomain(hostname: string): string | null {
  const host = hostname.replace(/^\.+|\.+$/g, '').toLowerCase()
  if (!host || IPV4.test(host) || host.includes(':')) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  return labels.slice(-2).join('.')
}

export default { getDomain }
