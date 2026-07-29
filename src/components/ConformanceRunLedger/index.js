import React from 'react';

import ledger from '@site/static/platform-conformance/run-ledger.json';

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
    <>
      {Object.entries(tuple).map(([artifact, version], index) => (
        <React.Fragment key={artifact}>
          {index > 0 && <br />}
          <span>{ARTIFACT_LABELS[artifact] || artifact}: </span>
          <code>{version}</code>
        </React.Fragment>
      ))}
    </>
  );
}

function TierSummary() {
  return (
    <>
      <h3>Per-tier state</h3>
      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Release critical</th>
            <th>State</th>
            <th>Current</th>
            <th>Stale</th>
            <th>Missing</th>
            <th>Runner blocked</th>
            <th>Current product failures</th>
          </tr>
        </thead>
        <tbody>
          {ledger.tiers.map(tier => (
            <tr key={tier.id}>
              <td>{humanize(tier.id)}</td>
              <td>{tier.release_critical ? 'yes' : 'no'}</td>
              <td><code>{tier.state}</code></td>
              <td>{tier.evidence_state.current}</td>
              <td>{tier.evidence_state.stale}</td>
              <td>{tier.evidence_state.missing}</td>
              <td>{tier.runner_blocked}</td>
              <td>{tier.current_product_failures}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ExperimentTable({tier}) {
  const experiments = ledger.experiments.filter(
    experiment => experiment.tier === tier.id,
  );

  return (
    <>
      <h3>{humanize(tier.id)}</h3>
      <table>
        <thead>
          <tr>
            <th>Experiment</th>
            <th>Static contract coverage</th>
            <th>Executed run evidence</th>
            <th>Exact artifact tuple</th>
            <th>Outcome</th>
            <th>Runner blocked</th>
            <th>Run finished at (UTC)</th>
          </tr>
        </thead>
        <tbody>
          {experiments.map(experiment => {
            const evidence = experiment.executed_evidence;

            return (
              <tr key={experiment.id}>
                <td><code>{experiment.id}</code></td>
                <td>
                  <a href={experiment.static_contract.url}>
                    {experiment.static_contract.status}
                  </a>
                  <br />
                  <small><code>{experiment.static_contract.evidence_kind}</code></small>
                </td>
                <td>
                  {evidence.evidence_url ? (
                    <a href={evidence.evidence_url}>{evidence.status}</a>
                  ) : (
                    evidence.status
                  )}
                  <br />
                  <small><code>{evidence.evidence_kind}</code></small>
                  {evidence.evidence_gap && (
                    <>
                      <br />
                      <small>evidence gap: <code>{evidence.gap_reason}</code></small>
                    </>
                  )}
                </td>
                <td><ArtifactTuple tuple={evidence.artifact_tuple} /></td>
                <td>{evidence.outcome || '—'}</td>
                <td>{evidence.runner_blocked ? 'yes' : 'no'}</td>
                <td>{evidence.finished_at || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
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
  return (
    <>
      <p>
        Ledger snapshot refreshed at <code>{ledger.snapshot_refreshed_at}</code>.
        {' '}Retained evidence captured at{' '}
        <code>{ledger.retained_evidence_captured_at}</code>. Refreshing the
        snapshot updates its current artifact tuple and derived freshness
        states, but does not change the capture time or historical run evidence.
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
      <p><ArtifactTuple tuple={ledger.current_artifact_tuple} /></p>

      <TierSummary />
      {ledger.tiers.map(tier => <ExperimentTable key={tier.id} tier={tier} />)}
      <RegressionTrails />
    </>
  );
}
