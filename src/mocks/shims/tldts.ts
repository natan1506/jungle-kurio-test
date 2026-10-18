/**
 * Shim mínimo de `tldts` para o bundle do navegador.
 *
 * O MSW usa `tough-cookie`, que importa `tldts` (lista completa de sufixos
 * públicos, ~185 kB) só para `getDomain`. O app não usa cookies; os mocks
 * operam em localhost/domínio do deploy. Este shim devolve o "domínio
 * registrável" pelos dois últimos rótulos — suficiente para esse uso e
 * documentado em ARCHITECTURE.md.
 */
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

export function getDomain(hostname: string): string | null {
  const host = hostname.replace(/^\.+|\.+$/g, '').toLowerCase()
  if (!host || IPV4.test(host) || host.includes(':')) return null
  const labels = host.split('.')
  if (labels.length < 2) return null
  return labels.slice(-2).join('.')
}

export default { getDomain }
