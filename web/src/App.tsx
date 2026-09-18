import { useCallback, useEffect, useState } from 'react'
import { Hex } from './components/bits'
import { Catalogue } from './components/Catalogue'
import { RecordedCeremony, RehearsalCeremony } from './components/Ceremony'
import { FlagNav } from './components/FlagNav'
import { Lamp } from './components/Lamp'
import { LibraryMap } from './components/LibraryMap'
import { Lineage } from './components/Lineage'
import { SourceSwitch } from './components/SourceSwitch'
import { WhoHolds } from './components/WhoHolds'
import { config, ledger, loadFromNetwork, NotYetError, records, Rehearsal, type Snapshot, type Source } from './data'
import type { RehearsalStep } from '../../src/core/rehearsal'
import { TOPICS } from '../../src/core/swarm'

const CHAPTERS = [
  { id: 'lineage', label: 'Keepers' },
  { id: 'ceremony', label: 'Hand-off' },
  { id: 'catalogue', label: 'Catalogue' },
  { id: 'lamp', label: 'Storage' },
  { id: 'libraries', label: 'Libraries' },
  { id: 'holds', label: 'Who holds what' },
]

export function App() {
  const [source, setSource] = useState<Source>(config.status === 'live' ? 'node' : 'rehearsal')
  // results are tagged with the source they came from, so switching never shows stale data
  const [loaded, setLoaded] = useState<{ source: Source; snap: Snapshot | null; error: string | null } | null>(null)
  const [rehearsal, setRehearsal] = useState(() => new Rehearsal())
  const [steps, setSteps] = useState<RehearsalStep[]>([])
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const snap = loaded?.source === source ? loaded.snap : null
  const error = loaded?.source === source ? loaded.error : null

  const refreshRehearsal = useCallback(async (r: Rehearsal) => {
    const s = await r.snapshot()
    setSteps([...r.steps])
    setDone(r.done)
    setLoaded({ source: 'rehearsal', snap: s, error: null })
  }, [])

  useEffect(() => {
    let cancelled = false
    const load =
      source === 'rehearsal'
        ? rehearsal.snapshot()
        : loadFromNetwork(source)
    load
      .then((s) => !cancelled && setLoaded({ source, snap: s, error: null }))
      .catch((e: Error) => {
        if (cancelled) return
        const message =
          e instanceof NotYetError
            ? e.message
            : source === 'node'
              ? `Couldn’t read from a Bee node on this computer (${e.message}). Start Swarm Desktop, or run the viewer with npm run dev:web so it can reach localhost:1633.`
              : `The public gateway didn’t answer (${e.message}). Freshly published data can take a few minutes to spread through the network.`
        setLoaded({ source, snap: null, error: message })
      })
    return () => {
      cancelled = true
    }
  }, [source, rehearsal])

  // ?play=all plays the whole rehearsal on arrival: handy for sharing a link to the finished story
  useEffect(() => {
    if (source !== 'rehearsal' || new URLSearchParams(window.location.search).get('play') !== 'all') return
    let cancelled = false
    void (async () => {
      while (!rehearsal.done && !cancelled) await rehearsal.next()
      if (!cancelled) await refreshRehearsal(rehearsal)
    })()
    return () => {
      cancelled = true
    }
  }, [source, rehearsal, refreshRehearsal])

  const next = async () => {
    setBusy(true)
    try {
      await rehearsal.next()
      await refreshRehearsal(rehearsal)
    } finally {
      setBusy(false)
    }
  }
  const runAll = async () => {
    setBusy(true)
    try {
      while (!rehearsal.done) await rehearsal.next()
      await refreshRehearsal(rehearsal)
    } finally {
      setBusy(false)
    }
  }
  const restart = () => {
    setSteps([])
    setDone(false)
    setRehearsal(new Rehearsal())
  }

  const current = snap?.view.registry.current?.entry ?? null
  const scribe = snap?.view.anchor.registryOwner ?? config.council.scribe.address

  return (
    <>
      <a className="skip" href="#main">
        Skip to the catalogue story
      </a>
      <header className="masthead">
        <a className="wordmark" href="#lineage">
          <span className="mark" aria-hidden="true">
            ༄༅
          </span>
          Ladakh–Spiti shared catalogue
        </a>
        <SourceSwitch value={source} onChange={setSource} />
      </header>
      <FlagNav chapters={CHAPTERS} />

      <main id="main">
        <section id="lineage" className="hero" aria-labelledby="hero-title">
          <div>
            <h1 id="hero-title">
              The catalogue outlives its keeper.
              <span className="line2">Seven libraries make sure of it.</span>
            </h1>
            <p className="intro">
              Seven monastery libraries in Ladakh and Spiti share one record of their manuscripts: what each holds, what’s damaged, what’s missing,
              what’s been photographed. For nine years one man kept it. This is how the next keeper takes over, and the one after that, while
              readers keep using the same address.
            </p>
            <div className="plaque">
              <h2>The address that doesn’t change</h2>
              <p className="muted">Readers start here, whoever is steward. It points to the current steward’s catalogue.</p>
              <dl>
                <dt>Register kept by</dt>
                <dd>
                  <Hex value={scribe} head={10} tail={8} />
                </dd>
                <dt>Topic</dt>
                <dd className="hex">{TOPICS.registry}</dd>
                <dt>Stable link</dt>
                <dd>{config.registryManifest && source !== 'rehearsal' ? <Hex value={config.registryManifest} head={10} tail={8} /> : <span className="muted">created at the first live hand-off</span>}</dd>
              </dl>
              <p className="note hand">Bookmark this one. Stewards come and go; this stays.</p>
            </div>
            {error && (
              <p className="banner" role="status">
                {error}{' '}
                {source !== 'rehearsal' && (
                  <button type="button" className="btn quiet" onClick={() => setSource('rehearsal')}>
                    Watch the rehearsal instead
                  </button>
                )}
              </p>
            )}
            {source === 'rehearsal' && steps.length === 0 && (
              <p className="banner">
                You’re looking at a rehearsal that hasn’t started. <a href="#ceremony">Begin the story</a> to watch a register form, a steward go
                quiet, and the catalogue carry on without him.
              </p>
            )}
          </div>
          {snap ? <Lineage view={snap.view} /> : !error && <p className="loading">Reading the register…</p>}
        </section>

        <section id="ceremony" className="chapter" aria-labelledby="ceremony-title">
          <div className="chapter-head">
            <h2 id="ceremony-title">How a steward is replaced</h2>
            <p className="lede">
              Nobody can do it alone: not the steward, not the scribe, not any one library. It takes four library seals and the newcomer’s own
              signature, or nothing moves.
            </p>
          </div>
          {source === 'rehearsal' ? (
            <RehearsalCeremony steps={steps} done={done} busy={busy} onNext={next} onRunAll={runAll} onRestart={restart} />
          ) : (
            <RecordedCeremony records={records} />
          )}
        </section>

        <section id="catalogue" className="chapter" aria-labelledby="catalogue-title">
          <div className="chapter-head">
            <h2 id="catalogue-title">The catalogue</h2>
            <p className="lede">
              Read through the register from whoever is steward{current ? ` now, ${current.steward.name}` : ''}. When a library posts a signed
              correction it shows up here straight away. Nobody has to email anyone.
            </p>
          </div>
          {snap ? <Catalogue view={snap.view} /> : <p className="loading">{error ? 'Nothing to show yet.' : 'Unrolling the folios…'}</p>}
        </section>

        <section id="lamp" className="chapter" aria-labelledby="lamp-title">
          <div className="chapter-head">
            <h2 id="lamp-title">Keeping the lamp lit</h2>
            <p className="lede">The storage is paid by the node’s wallet, which is a different key from anyone who publishes or decides.</p>
          </div>
          <Lamp storage={snap?.storage ?? null} ledger={source === 'rehearsal' ? [] : ledger} />
        </section>

        <section id="libraries" className="chapter" aria-labelledby="libraries-title">
          <div className="chapter-head">
            <h2 id="libraries-title">Seven libraries, seven seals</h2>
            <p className="lede">Each committee holds one key. It seals hand-offs, and it corrects its own shelves without asking anyone.</p>
          </div>
          {snap && <LibraryMap view={snap.view} people={snap.people} />}
        </section>

        <section id="holds" className="chapter" aria-labelledby="holds-title">
          <div className="chapter-head">
            <h2 id="holds-title">Who holds what</h2>
            <p className="lede">
              Paying, publishing and deciding are three different keys. The tools refuse to start if any two of them are the same.
            </p>
          </div>
          <WhoHolds people={snap?.people ?? { scribe: null, payer: null, stewards: [], libraries: [] }} steward={current?.steward.address ?? null} />
        </section>
      </main>

      <footer>
        <p>
          Reading from {snap?.label ?? 'nowhere yet'}. This page holds no keys and can’t change anything. It only reads, and it checks every seal
          itself.
        </p>
        <p>
          Plainly: every postage batch belongs to one shared Bee node, so storage custody is not separated. The keys for this demonstration were
          all made on one machine. In real use each library and steward makes their own. The catalogue entries are illustrative sample data, not
          a real inventory.
        </p>
        <p>The full agreement is in STEWARDSHIP.md, and every hand-off is in HANDOFF_LOG.md, in the project’s repository.</p>
      </footer>
    </>
  )
}
