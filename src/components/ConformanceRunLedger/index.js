import React, {useEffect} from 'react';

import ledger from '@site/static/platform-conformance/run-ledger.json';

import styles from './styles.module.css';

const ARTIFACT_LABELS = {
  cli: 'CLI',
  'sdk-php': 'PHP SDK',
  'sdk-python': 'Python SDK',
  'sdk-rust': 'Rust SDK',
  server: 'Server',
  waterline: 'Waterline',
  workflow: 'Workflow',
};

function humanize(value) {
  return value
    .replace(/[.-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase());
}

function ArtifactTuple({tuple}) {
  if (!tuple) {
    return <span>—</span>;
  }

  return (
    <ul className={styles.artifactTuple} aria-label="Exact artifact tuple">
      {Object.entries(tuple).map(([artifact, version]) => (
        <li key={artifact} data-artifact={artifact}>
          <span>{ARTIFACT_LABELS[artifact] || artifact}</span>{' '}
          <code>{version}</code>
        </li>
      ))}
    </ul>
  );
}

function TierMetric({label, metric, value}) {
  return (
    <span className={styles.tierMetric} data-tier-metric={metric}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </span>
  );
}

function ExperimentDetail({experiment}) {
  const evidence = experiment.executed_evidence;
  const experimentId = `conformance-experiment-${experiment.id}`;

  return (
    <article
      className={styles.experimentDetail}
      data-conformance-experiment={experiment.id}
      id={experimentId}
      tabIndex="-1">
      <header className={styles.experimentHeader}>
        <h4><code>{experiment.id}</code></h4>
        <a className={styles.permalink} href={`#${experimentId}`}>Permalink</a>
      </header>
      <dl className={styles.evidenceList}>
        <div>
          <dt>Static contract coverage</dt>
          <dd>
            <a href={experiment.static_contract.url}>
              {experiment.static_contract.status}
            </a>
            <small><code>{experiment.static_contract.evidence_kind}</code></small>
          </dd>
        </div>
        <div>
          <dt>Executed run evidence</dt>
          <dd>
            {evidence.evidence_url ? (
              <a href={evidence.evidence_url}>{evidence.status}</a>
            ) : (
              evidence.status
            )}
            <small><code>{evidence.evidence_kind}</code></small>
            {evidence.evidence_gap && (
              <small>
                Evidence gap: <code>{evidence.gap_reason}</code>
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Exact artifact tuple</dt>
          <dd><ArtifactTuple tuple={evidence.artifact_tuple} /></dd>
        </div>
        <div>
          <dt>Outcome</dt>
          <dd>{evidence.outcome || '—'}</dd>
        </div>
        <div>
          <dt>Runner blocked</dt>
          <dd>{evidence.runner_blocked ? 'yes' : 'no'}</dd>
        </div>
        <div>
          <dt>Run finished at (UTC)</dt>
          <dd>{evidence.finished_at || '—'}</dd>
        </div>
      </dl>
    </article>
  );
}

function TierDisclosure({tier}) {
  const experiments = ledger.experiments.filter(
    experiment => experiment.tier === tier.id,
  );
  const tierId = `conformance-tier-${tier.id}`;

  return (
    <details
      className={styles.tierDisclosure}
      data-conformance-tier={tier.id}
      id={tierId}>
      <summary>
        <span className={styles.tierSummary}>
          <span className={styles.tierHeading}>
            <span className={styles.tierName}>{humanize(tier.id)}</span>
            <code data-tier-state>{tier.state}</code>
            <span>{tier.release_critical ? 'Release critical' : 'Not release critical'}</span>
          </span>
          <span className={styles.tierMetrics}>
            <TierMetric
              label="Experiments"
              metric="experiment_count"
              value={tier.experiment_count}
            />
            <TierMetric
              label="Current evidence"
              metric="current"
              value={tier.evidence_state.current}
            />
            <TierMetric
              label="Stale evidence"
              metric="stale"
              value={tier.evidence_state.stale}
            />
            <TierMetric
              label="Missing evidence"
              metric="missing"
              value={tier.evidence_state.missing}
            />
            <TierMetric
              label="Runner blocked"
              metric="runner_blocked"
              value={tier.runner_blocked}
            />
            <TierMetric
              label="Product failures"
              metric="current_product_failures"
              value={tier.current_product_failures}
            />
          </span>
          <span className={styles.disclosureAction}>
            <span className={styles.whenClosed}>View experiment details</span>
            <span className={styles.whenOpen}>Hide experiment details</span>
          </span>
        </span>
      </summary>
      <div className={styles.tierDetail}>
        <div className={styles.tierDetailHeader}>
          <h3>{humanize(tier.id)} experiments</h3>
          <a className={styles.permalink} href={`#${tierId}`}>Permalink to tier</a>
        </div>
        <div className={styles.experimentList}>
          {experiments.map(experiment => (
            <ExperimentDetail key={experiment.id} experiment={experiment} />
          ))}
        </div>
      </div>
    </details>
  );
}

function RegressionTrails() {
  return (
    <>
      <h3>Confirmed regression proof trails</h3>
      {ledger.regression_trails.length === 0 ? (
        <p>No confirmed regression trail is retained in this snapshot.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Regression</th>
              <th>Experiment</th>
              <th>Failing run</th>
              <th>Owning fix</th>
              <th>Regression fixture</th>
              <th>First confirming run</th>
            </tr>
          </thead>
          <tbody>
            {ledger.regression_trails.map(regression => (
              <tr key={regression.id}>
                <td><code>{regression.id}</code></td>
                <td><code>{regression.experiment}</code></td>
                <td><a href={regression.failing_run_url}>evidence</a></td>
                <td><a href={regression.fix_url}>fix</a></td>
                <td><a href={regression.regression_fixture_url}>fixture</a></td>
                <td><a href={regression.first_confirming_run_url}>evidence</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

export default function ConformanceRunLedger() {
  useEffect(() => {
    const revealHashTarget = () => {
      let targetId;
      try {
        targetId = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target?.closest('[data-conformance-run-ledger]')) return;

      const disclosure = target.matches('details') ? target : target.closest('details');
      if (disclosure) disclosure.open = true;

      const focusTarget = target.matches('details')
        ? target.querySelector(':scope > summary')
        : target;
      focusTarget?.focus({preventScroll: true});
      window.requestAnimationFrame(() => {
        target.scrollIntoView({block: 'start'});
        window.setTimeout(() => target.scrollIntoView({block: 'start'}), 50);
      });
    };

    revealHashTarget();
    window.addEventListener('hashchange', revealHashTarget);
    return () => window.removeEventListener('hashchange', revealHashTarget);
  }, []);

  return (
    <section className={styles.ledger} data-conformance-run-ledger>
      <div className={styles.snapshotTimes}>
        <p data-ledger-metadata="snapshot_refreshed_at">
          <strong>Ledger snapshot</strong>
          <span>Refreshed at</span>
          <time dateTime={ledger.snapshot_refreshed_at}>
            <code>{ledger.snapshot_refreshed_at}</code>
          </time>
        </p>
        <p data-ledger-metadata="retained_evidence_captured_at">
          <strong>Retained evidence</strong>
          <span>Captured at</span>
          <time dateTime={ledger.retained_evidence_captured_at}>
            <code>{ledger.retained_evidence_captured_at}</code>
          </time>
        </p>
      </div>
      <p>
        Refreshing the snapshot updates its current artifact tuple and derived
        freshness states, but does not change the capture time or historical
        run evidence.
      </p>
      <p>
        “Current” means that every artifact version exactly matches the tuple
        below. A stale or missing row is an evidence gap, not a product failure.
        Outcomes and finish times remain attached to their historical exact
        tuples.
      </p>
      <p>
        The ledger reports tier and experiment state directly. It does not
        calculate or claim an aggregate historical pass rate.
      </p>

      <h3>Current artifact tuple</h3>
      <div
        className={styles.currentTuple}
        data-ledger-current-tuple
        id="conformance-ledger-summary"
        tabIndex="-1">
        <ArtifactTuple tuple={ledger.current_artifact_tuple} />
      </div>

      <h3 id="conformance-ledger-tiers" tabIndex="-1">
        Per-tier state and experiment detail
      </h3>
      <p>
        Each tier keeps its state and evidence counts visible. Expand a tier to
        inspect its exact experiment rows and retained evidence links.
      </p>
      <div className={styles.tierList}>
        {ledger.tiers.map(tier => <TierDisclosure key={tier.id} tier={tier} />)}
      </div>
      <RegressionTrails />
    </section>
  );
}
