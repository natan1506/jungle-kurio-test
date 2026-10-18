/** Aceita apenas destinos internos (evita open redirect via ?redirect=). */
export function safeRedirect(redirect: string | undefined) {
  return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/'
}
