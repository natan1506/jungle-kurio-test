// Uso: npm run build && npm run lighthouse
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { chromium } from '@playwright/test'
import * as chromeLauncher from 'chrome-launcher'
import lighthouse from 'lighthouse'
import { CATEGORIES, PAGES, PROFILES, RUNS, TARGETS } from './config.mjs'

const PORT = 4300
const ORIGIN = `http://127.0.0.1:${PORT}`
const OUT = new URL('./reports/', import.meta.url).pathname

async function waitFor(url, timeout = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* aguardando */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Servidor não respondeu em ${url}`)
}

const median = (values) => {
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

await mkdir(OUT, { recursive: true })
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const chromePath = process.env.CHROME_PATH ?? chromium.executablePath()

try {
  await waitFor(ORIGIN)
  const summary = []
  let lhVersion = ''
  {
    for (const page of PAGES) {
      for (const [profile, config] of Object.entries(PROFILES)) {
        const runs = []
        for (let i = 0; i < RUNS; i++) {
          // Chrome novo a cada medição (sem cache/SW da anterior)
          const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] })
          let result
          try {
            result = await lighthouse(`${ORIGIN}${page.path}`, { port: chrome.port, output: ['html', 'json'], logLevel: 'error' }, config)
          } finally {
            await chrome.kill()
          }
          const lhr = result.lhr
          lhVersion = lhr.lighthouseVersion
          runs.push({
            scores: Object.fromEntries(CATEGORIES.map((c) => [c, Math.round((lhr.categories[c]?.score ?? 0) * 100)])),
            lcp: lhr.audits['largest-contentful-paint'].numericValue,
            cls: lhr.audits['cumulative-layout-shift'].numericValue,
            tbt: lhr.audits['total-blocking-time'].numericValue,
            report: result.report,
          })
          console.log(`${page.name}/${profile} #${i + 1}:`, runs.at(-1).scores)
        }
        // salva o relatório da medição mediana
        const perfMedian = median(runs.map((r) => r.scores.performance))
        const chosen = runs.find((r) => r.scores.performance === perfMedian)
        const base = `${OUT}${page.name}-${profile}`
        await writeFile(`${base}.html`, chosen.report[0])
        await writeFile(`${base}.json`, chosen.report[1])
        summary.push({
          page: page.name,
          path: page.path,
          profile,
          median: Object.fromEntries(CATEGORIES.map((c) => [c, median(runs.map((r) => r.scores[c]))])),
          lcpMs: Math.round(median(runs.map((r) => r.lcp))),
          cls: Number(median(runs.map((r) => r.cls)).toFixed(3)),
          tbtMs: Math.round(median(runs.map((r) => r.tbt))),
          runs: runs.map((r) => r.scores),
        })
      }
    }
  }

  const env = {
    date: new Date().toISOString(),
    lighthouse: lhVersion,
    node: process.version,
    chrome: chromePath,
    os: `${os.type()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model,
    runsPerProfile: RUNS,
    server: 'vite preview (build de produção, mocks MSW ativos, cenário default)',
  }
  await writeFile(`${OUT}summary.json`, JSON.stringify({ env, targets: TARGETS, summary }, null, 2))

  const rows = summary.map(
    (s) =>
      `| ${s.page} | ${s.profile} | ${CATEGORIES.map((c) => `${s.median[c]}${s.median[c] < TARGETS[c] ? '*' : ''}`).join(' | ')} | ${s.lcpMs} ms | ${s.cls} | ${s.tbtMs} ms |`,
  )
  const md = [
    '# Auditoria Lighthouse',
    '',
    `Gerado em ${env.date} · Lighthouse ${env.lighthouse} · Node ${env.node} · ${env.os} · ${env.cpu}`,
    '',
    `Mediana de ${RUNS} execuções por página e perfil. Valores com asterisco estão abaixo da meta.`,
    '',
    '| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
  ].join('\n')
  await writeFile(`${OUT}summary.md`, md)
  console.log('\n' + md)
} finally {
  server.kill()
}
