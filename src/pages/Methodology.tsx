import { RULE_CATALOGUE, THRESHOLDS } from '../analytics/insightEngine';
import { FORMULAS } from '../analytics/metrics';
import { FIELD_DEFINITIONS } from '../data/fields';
import { ProvenanceTag, Callout, Card, Formula, Section } from '../components/ui';

const PROVENANCE = [
  { kind: 'observed' as const, title: 'Observed data', body: 'A value read directly from the uploaded file, unchanged. MATLens never edits, imputes or smooths a source value.' },
  { kind: 'derived' as const, title: 'Derived metric', body: 'Arithmetic MATLens performed on observed values, using the published formulas below. Deterministic and reproducible — the same file always produces the same numbers.' },
  { kind: 'interpretation' as const, title: 'Interpretation', body: 'What a derived metric could mean commercially. Always hedged: "may indicate", "could suggest", "worth investigating". Never stated as fact.' },
  { kind: 'hypothesis' as const, title: 'Hypothesis', body: 'A possible driver that this dataset cannot confirm. Presented as a question to investigate, never as a cause.' },
];

export function Methodology() {
  return (
    <>
      <Section title="How MATLens thinks" subtitle="The separation that keeps an analytics tool honest">
        <div className="grid grid--2">
          {PROVENANCE.map((item) => (
            <Card key={item.kind}>
              <ProvenanceTag kind={item.kind} label={item.title} />
              <p className="t-sub" style={{ marginTop: 6 }}>{item.body}</p>
            </Card>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Callout tone="accent" title="Deterministic calculations first, interpretation second">
            No calculation in MATLens is performed by a language model, and the product needs no AI API key to run.
            Metrics come from the formulas below; interpretations come from explicit rules with published thresholds.
            A future version could use a model to phrase findings more naturally — it would still not be allowed
            anywhere near the arithmetic.
          </Callout>
        </div>
      </Section>

      <Section title="Formulas" subtitle="Every derived number in the product, in full">
        <Card>
          <Formula>
            {[
              FORMULAS.growth,
              FORMULAS.share,
              FORMULAS.previousShare,
              FORMULAS.shareChange,
              FORMULAS.growthGap,
              FORMULAS.rank,
              FORMULAS.rankChange,
              FORMULAS.contribution,
              FORMULAS.unitGrowth,
              FORMULAS.priceMix,
              FORMULAS.hhi,
              FORMULAS.cr4,
              FORMULAS.concentration,
            ].join('\n')}
          </Formula>
          <p className="t-micro" style={{ marginTop: 10 }}>
            Growth is withheld against a zero or negative base rather than reported as infinite. Contribution to growth
            is withheld when the market shrank, because the ratio inverts its sign. Share, rank and market totals are
            always computed within the rows currently in scope, so an active filter changes the denominator — and the
            product says so on screen when it does.
          </p>
        </Card>
      </Section>

      <Section title="Thresholds" subtitle="A signal fires on a published number, not on judgement">
        <Card flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Threshold</th>
                  <th className="num">Value</th>
                  <th>What it controls</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Material growth gap', `${THRESHOLDS.growthGapMaterial} pp`, 'Below this, brand-versus-market divergence is reported as "in line" rather than flagged'],
                  ['Serious growth gap', `${THRESHOLDS.growthGapSerious} pp`, 'Escalates a growth gap from Watch to Attention; twice this escalates to Critical'],
                  ['Material share move', `${THRESHOLDS.shareMoveMaterial} pp`, 'Below this, a share change is treated as rounding rather than movement'],
                  ['Serious share move', `${THRESHOLDS.shareMoveSerious} pp`, 'A share loss at or above this is Critical'],
                  ['Minimum competitor share', `${THRESHOLDS.competitorMinSharePct}%`, 'A competitor smaller than this is not treated as materially threatening'],
                  ['Competitor growth lead', `${THRESHOLDS.competitorGrowthLead} pp`, 'How far above the focus brand a competitor must grow to be flagged'],
                  ['Emerging-brand growth', `${THRESHOLDS.emergingGrowthPct}%`, 'Growth rate above which a small brand is called an emerging entrant'],
                  ['Emerging-brand share band', `${THRESHOLDS.emergingMinSharePct}%–${THRESHOLDS.emergingMaxSharePct}%`, 'Share range in which the emerging-competitor rule applies'],
                  ['Category growth lead', `${THRESHOLDS.categoryGrowthLead} pp`, 'How far a molecule or segment must outgrow the brand before it is called an opportunity'],
                  ['Region growth lead', `${THRESHOLDS.regionGrowthLead} pp`, 'How far a region must outgrow the market to be flagged'],
                  ['Regional concentration', `${THRESHOLDS.concentrationMultiple}× even split`, 'When a brand is called concentrated in its largest region'],
                  ['Price / mix divergence', `${THRESHOLDS.priceMixGap} pp`, 'Value-versus-unit growth gap worth commenting on'],
                  ['Fragmented market', `HHI < ${THRESHOLDS.fragmentedHhi.toLocaleString('en-IN')}`, 'Where the market-structure rule calls a category fragmented'],
                ].map(([label, value, purpose]) => (
                  <tr key={label}>
                    <td className="strong">{label}</td>
                    <td className="num">{value}</td>
                    <td className="t-micro">{purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="Rule catalogue" subtitle="The complete set of rules the engine evaluates on every dataset">
        <Card flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Fires when</th>
                  <th>Produces</th>
                </tr>
              </thead>
              <tbody>
                {RULE_CATALOGUE.map((rule) => (
                  <tr key={rule.rule}>
                    <td className="strong">{rule.name}</td>
                    <td className="t-micro">{rule.condition}</td>
                    <td className="t-micro">{rule.produces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="Fields MATLens looks for" subtitle="Detected from any reasonable header convention, and always shown back to you for correction">
        <Card flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Required</th>
                  <th>What it unlocks</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_DEFINITIONS.map((field) => (
                  <tr key={field.key}>
                    <td className="strong">{field.label}</td>
                    <td className="t-micro">{field.kind}</td>
                    <td className="t-micro">{field.essential ? 'Required' : 'Optional'}</td>
                    <td className="t-micro">{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      <Section title="Limitations" subtitle="What this prototype does not claim to do">
        <div className="grid grid--2">
          <Card title="Analytical limits">
            <ul className="list-check">
              <li>MAT is a moving annual total: it smooths seasonality and therefore lags turning points by design.</li>
              <li>Two data points cannot establish a trend. Every finding describes one period against one prior period.</li>
              <li>Correlation in a market extract is not causation. MATLens names movements, never their causes.</li>
              <li>Share and rank are computed within the loaded rows. A partial extract yields a partial market.</li>
              <li>Value data cannot separate price, pack mix and volume without unit data, and only approximates it with.</li>
              <li>Nothing here reflects stock movements, returns, tender timing or channel shifts unless the file does.</li>
            </ul>
          </Card>
          <Card title="Privacy, ethics and scope">
            <ul className="list-check">
              <li>Files are parsed in the browser. Nothing is transmitted to a server and no account is required.</li>
              <li>No patient-level data and no personally identifiable information is needed — brand-level MAT is enough.</li>
              <li>The demo dataset is entirely synthetic and is labelled as such everywhere it appears.</li>
              <li>MATLens is an analytical prototype supporting commercial judgement. It is not a regulated system.</li>
              <li>It provides no medical, clinical or prescribing advice and makes no clinical decisions.</li>
              <li>It makes no claim of compliance with any regulatory or data-protection framework.</li>
            </ul>
          </Card>
        </div>
      </Section>
    </>
  );
}
