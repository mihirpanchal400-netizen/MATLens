import { useState } from 'react';
import { verifyCredentials } from './credentials';

/**
 * The left panel carries the one comparison the whole product exists to make:
 * a brand's growth against the market it competes in, and the distance between
 * them. It is the real chart, drawn small — not decoration.
 */
function GrowthGapFigure() {
  const bars = [
    { label: 'Market', value: 14.3, width: 100, colour: 'var(--rail-line)' },
    { label: 'Your brand', value: 7.5, width: 52, colour: 'var(--accent-signal)' },
  ];

  return (
    <div className="auth__figure" aria-hidden="true">
      {bars.map((bar) => (
        <div className="auth__bar" key={bar.label}>
          <span className="auth__bar-label">{bar.label}</span>
          <div className="auth__bar-track">
            <div className="auth__bar-fill" style={{ width: `${bar.width}%`, background: bar.colour }}>
              +{bar.value.toFixed(1)}%
            </div>
          </div>
        </div>
      ))}
      <div className="auth__gap">
        <span className="auth__gap-value">−6.8 pp</span>
        <span className="auth__gap-label">growth gap — the number a brand review turns on</span>
      </div>
    </div>
  );
}

export function SignIn({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setChecking(true);
    setError(null);
    const ok = await verifyCredentials(username, password);
    setChecking(false);
    if (ok) onSuccess();
    else setError('That username and password do not match. Check both and try again.');
  };

  return (
    <div className="auth">
      <section className="auth__panel">
        <div className="logo">
          <span className="logo__mark">M</span>
          <div>
            <div className="logo__name">MATLens</div>
            <div className="logo__tag">Market &amp; Brand Intelligence</div>
          </div>
        </div>

        <div>
          <h1 className="auth__lede">A growth number decides nothing on its own.</h1>
          <p className="auth__sub">
            MATLens reads a MAT market file, works out what it can support, and calculates the comparison that turns a
            number into a verdict — with the arithmetic attached and the causes left as questions.
          </p>
          <GrowthGapFigure />
        </div>

        <p className="auth__foot">
          Demo environment. Market data is synthetic and represents no real company.
        </p>
      </section>

      <section className="auth__form-side">
        <form className="auth__form" onSubmit={submit}>
          <h2 className="auth__title">Sign in</h2>
          <p className="auth__hint">Enter your credentials to open the workspace.</p>

          <div className="auth__fields">
            <label className="field">
              <span className="field__label">Username</span>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </label>

            <label className="field">
              <span className="field__label">Password</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          </div>

          <button className="btn btn--primary auth__submit" type="submit" disabled={checking}>
            {checking ? <span className="spinner" /> : null}
            {checking ? 'Checking' : 'Sign in'}
          </button>

          {error && (
            <div className="auth__error" role="alert">
              {error}
            </div>
          )}

          <p className="auth__note">
            This gate keeps a public link from being casually browsable. It runs in your browser, so it is not
            security — nothing behind it should be treated as protected.
          </p>
        </form>
      </section>
    </div>
  );
}
