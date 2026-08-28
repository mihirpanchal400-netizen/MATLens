import { useApp } from '../state/AppState';
import { DEMO_DESCRIPTION } from '../data/demoDataset';
import { Icon } from '../components/Icon';
import { Badge, Callout, Card } from '../components/ui';

const LOOP = ['Raw data', 'Understand', 'Analyse', 'Identify signal', 'Explain', 'Investigate', 'Brand decision'];

const QUESTIONS = [
  'Is my brand growing faster or slower than the market?',
  'Is market share increasing or decreasing, and by how much?',
  'Which competitors are gaining, and which are losing?',
  'Which molecules and segments are growing ahead of my brand?',
  'Where is the brand under-represented relative to where growth is happening?',
  'What should I investigate before the next brand review?',
];

export function Landing() {
  const { loadDemo, goTo, loading, error, dismissError } = useApp();

  return (
    <>
      <section className="card" style={{ padding: '38px 34px', marginBottom: 22 }}>
        <div style={{ maxWidth: 760 }}>
          <Badge tone="accent">Pharmaceutical market-data intelligence · prototype</Badge>
          <h2 className="t-hero" style={{ marginTop: 14, fontSize: 34 }}>
            From market data to brand decisions.
          </h2>
          <p className="t-sub" style={{ fontSize: 15, marginTop: 10, maxWidth: 640 }}>
            A MAT extract tells you what the numbers are. It does not tell you whether your brand is winning.
            MATLens reads a market file, works out what it can support, calculates the comparisons that matter,
            and states what each one may mean — with the arithmetic attached and the causes left as questions.
          </p>

          <div className="row row--wrap" style={{ marginTop: 22, gap: 10 }}>
            <button className="btn btn--primary" onClick={loadDemo} disabled={loading}>
              {loading ? <span className="spinner" /> : <Icon name="opportunities" size={15} />}
              {loading ? 'Building demo dataset…' : 'Explore demo dataset'}
            </button>
            <button className="btn" onClick={() => goTo('upload')}>
              <Icon name="upload" size={15} />
              Upload your own Excel or CSV
            </button>
          </div>

          <div className="row row--wrap" style={{ marginTop: 26, gap: 6 }}>
            {LOOP.map((step, index) => (
              <span key={step} className="row" style={{ gap: 6 }}>
                <span className="badge badge--neutral" style={{ fontSize: 10.5 }}>{step}</span>
                {index < LOOP.length - 1 && <Icon name="arrowRight" size={12} className="map-arrow" />}
              </span>
            ))}
          </div>
        </div>
      </section>

      {error && (
        <div style={{ marginBottom: 20 }}>
          <Callout tone="critical" title={error.message}>
            {error.hint}
            <div style={{ marginTop: 8 }}>
              <button className="btn btn--sm" onClick={dismissError}>
                Dismiss
              </button>
            </div>
          </Callout>
        </div>
      )}

      <div className="grid grid--3">
        <Card title="Questions it answers">
          <ul className="list-check">
            {QUESTIONS.map((question) => (
              <li key={question}>
                <span style={{ color: 'var(--accent)', marginTop: 2 }}>
                  <Icon name="check" size={13} strokeWidth={2.2} />
                </span>
                {question}
              </li>
            ))}
          </ul>
        </Card>

        <Card title="How it reads a file">
          <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: 'var(--ink-700)' }}>
            <li>Detects the columns — <code>MAT_VAL</code>, <code>BRAND_NAME</code>, <code>COMP</code> and their many variants — and shows you what it decided, with a confidence level you can override.</li>
            <li>Validates the rows: missing values, duplicates, non-numeric cells, impossible percentages.</li>
            <li>Computes growth, share, share change, rank and contribution deterministically — no model, no estimate.</li>
            <li>Runs a rule engine over the result and returns structured signals with evidence and formulas.</li>
          </ol>
        </Card>

        <Card title="Demo dataset">
          <p className="t-sub" style={{ marginBottom: 12 }}>{DEMO_DESCRIPTION}</p>
          <Callout tone="warning">
            <strong>Synthetic data.</strong> Every brand, company and number in the demo is invented for this prototype.
            It is not derived from IQVIA, AWACS, SMSRC or any other audit, and it does not represent any real market.
          </Callout>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn--primary btn--sm" onClick={loadDemo} disabled={loading}>
              Load demo dataset
              <Icon name="arrowRight" size={13} />
            </button>
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 18 }}>
        <Callout>
          <strong>Privacy.</strong> Files are parsed in your browser. Nothing is uploaded to a server, no account is
          needed, and MATLens requires no AI API key to run. It needs no patient-level data and no personally
          identifiable information — a brand-level MAT extract is enough. This is an analytical prototype: it supports
          commercial judgement, it does not replace it, and it provides no clinical or medical advice.
        </Callout>
      </div>
    </>
  );
}
