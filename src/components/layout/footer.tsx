import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ComingSoon } from './coming-soon'

const FEATURES = [
  { letter: 'W', title: 'Segurança da carteira', text: 'Proteja sua carteira e colecione arte digital verificada com confiança.' },
  { letter: 'C', title: 'Criadores em destaque', text: 'Conheça artistas, estúdios e comunidades que moldam a cultura digital na rede.' },
  { letter: 'D', title: 'Alertas de lançamentos', text: 'Receba calendários de cunhagem, novidades de lista e análises do mercado.' },
]

const COLUMNS: { title: string; links: { label: string; to?: '/conta/perfil' | '/conta/carteiras' }[] }[] = [
  {
    title: 'Meu perfil',
    links: [{ label: 'Meu perfil', to: '/conta/perfil' }, { label: 'Minhas carteiras', to: '/conta/carteiras' }, { label: 'Atividade' }, { label: 'Lista de interesse' }],
  },
  {
    title: 'Central de ajuda',
    links: [{ label: 'Central de ajuda' }, { label: 'Como comprar NFTs' }, { label: 'Carteira e segurança' }, { label: 'Política do mercado' }],
  },
  { title: 'Coleções', links: [{ label: 'Arte digital' }, { label: 'Fotografia' }, { label: 'Música' }, { label: 'Arte 3D' }] },
]

export function Footer() {
  return (
    <footer className="mt-4 pb-28 md:mt-16 md:pb-8">
      <div className="container-page">
        <div className="overflow-hidden rounded-xl bg-card">
          <div className="grid gap-6 p-6 md:grid-cols-4 md:p-8">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col gap-2 md:border-r md:border-border md:pr-6">
                <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full btn-gradient font-bold text-primary-foreground">
                  {f.letter}
                </span>
                <h2 className="text-sm font-semibold">{f.title}</h2>
                <p className="text-xs leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                toast.info('Newsletter em breve', { description: 'A inscrição em alertas ainda não está disponível nesta versão.' })
              }}
            >
              <h2 className="text-sm font-semibold">Antecipe-se ao próximo lançamento</h2>
              <div className="flex">
                <label htmlFor="newsletter" className="sr-only">
                  Seu e-mail
                </label>
                <input
                  id="newsletter"
                  type="email"
                  placeholder="Digite seu e-mail"
                  className="h-9 min-w-0 flex-1 rounded-l-md border border-input bg-background/60 px-3 text-xs"
                />
                <Button type="submit" size="sm" className="h-9 rounded-l-none">
                  Enviar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Receba lançamentos selecionados e histórias de criadores.</p>
            </form>
          </div>
          <div className="grid gap-2 bg-surface-2 px-6 py-4 text-xs text-muted-foreground md:grid-cols-4 md:px-8">
            <span className="font-bold tracking-[0.3em] text-foreground">KURIO</span>
            <span>Feito para colecionadores, criadores e cultura</span>
            <span>contato@kurio.dev</span>
            <span>+55 11 4002-8922</span>
          </div>
          <div className="grid gap-8 p-6 sm:grid-cols-2 md:grid-cols-4 md:p-8">
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="mb-3 text-sm font-semibold">{col.title}</h2>
                <ul className="flex flex-col gap-2 text-xs">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.to ? (
                        <Link to={l.to} className="text-muted-foreground hover:text-highlight">
                          {l.label}
                        </Link>
                      ) : (
                        <ComingSoon label={l.label} className="text-xs" />
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
            <div>
              <h2 className="mb-3 text-sm font-semibold">Carteiras compatíveis</h2>
              <ul className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                {['MetaMask', 'WalletConnect', 'Coinbase'].map((w) => (
                  <li key={w} className="rounded border border-border px-2 py-1">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">© 2026 Kurio. Propriedade digital para todos.</p>
      </div>
    </footer>
  )
}
