import React from 'react';

const {
  QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS,
  QUALIFIED_ARTIFACT_MATRIX,
  QUALIFIED_ARTIFACT_TUPLE_AUTHORITY,
} = require('../../../scripts/public-artifact-versions');

const roleLabels = {
  service_runtime: 'Service runtime',
  service_operator_tool: 'Optional service operator tool',
  embedded_laravel_engine: 'Embedded Laravel engine',
  embedded_laravel_operator_ui: 'Embedded Laravel operator UI',
  service_mode_sdk: 'Service-mode SDK',
};

const applicabilityLabels = {
  provisioned_not_installed: 'provisioned; do not install',
  managed_not_installed: 'managed; do not install',
  not_in_first_success: 'not part of first success',
  required: 'required',
  optional: 'optional',
  choose_one: 'choose one SDK',
  not_used: 'not used',
  separate_service_identity: 'optional service uses a different identity',
};

const provisionedComponentLabels = {
  server_runtime_values: 'Server runtime values',
  managed_waterline: 'Managed Waterline',
};

const separatelyDeployedComponentLabels = {
  waterline_service: 'Waterline service (its service distribution identity is not listed below)',
};

function joinLabels(items) {
  return items.map(item => item.label).join(', ');
}

function PathSummary({path, artifactsById}) {
  const required = path.required_artifacts.map(id => artifactsById[id]);
  const chooseOne = path.choose_one_artifacts.map(id => artifactsById[id]);
  const optional = path.optional_artifacts.map(id => artifactsById[id]);
  const artifactsWithStatus = status => QUALIFIED_ARTIFACT_MATRIX.filter(
    row => row.applicability[path.id] === status,
  );
  const notInstalled = [
    ...artifactsWithStatus('provisioned_not_installed'),
    ...artifactsWithStatus('managed_not_installed'),
  ];
  const notUsed = artifactsWithStatus('not_used');
  const notInFirstSuccess = artifactsWithStatus('not_in_first_success');

  return (
    <section>
      <h3>{path.label}</h3>
      <ul>
        {required.length > 0 && <li><strong>Run or install:</strong> {joinLabels(required)}</li>}
        {chooseOne.length > 0 && <li><strong>Choose one SDK:</strong> {joinLabels(chooseOne)}</li>}
        {optional.length > 0 && <li><strong>Optional:</strong> {joinLabels(optional)}</li>}
        {path.provisioned_components.length > 0 && (
          <li>
            <strong>Provisioned for you:</strong>{' '}
            {path.provisioned_components.map(id => provisionedComponentLabels[id]).join(', ')}
          </li>
        )}
        {path.separately_deployed_components.length > 0 && (
          <li>
            <strong>Optional separate deployment:</strong>{' '}
            {path.separately_deployed_components
              .map(id => separatelyDeployedComponentLabels[id])
              .join(', ')}
          </li>
        )}
        {notInstalled.length > 0 && (
          <li><strong>Do not install:</strong> {joinLabels(notInstalled)}</li>
        )}
        {notInFirstSuccess.length > 0 && (
          <li><strong>Not part of first success:</strong> {joinLabels(notInFirstSuccess)}</li>
        )}
        {notUsed.length > 0 && (
          <li><strong>Not used in this mode:</strong> {joinLabels(notUsed)}</li>
        )}
      </ul>
    </section>
  );
}

export default function QualifiedArtifactTuple() {
  const artifactsById = Object.fromEntries(
    QUALIFIED_ARTIFACT_MATRIX.map(row => [row.artifact, row]),
  );

  return (
    <>
      <div className="qualified-artifact-paths">
        {QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS.map(path => (
          <PathSummary key={path.id} path={path} artifactsById={artifactsById} />
        ))}
      </div>
      <table className="qualified-artifact-matrix">
        <thead>
          <tr>
            <th>Component</th>
            <th>Role</th>
            <th>Deployment applicability</th>
            <th>Stable identity</th>
          </tr>
        </thead>
        <tbody>
          {QUALIFIED_ARTIFACT_MATRIX.map(row => (
            <tr key={row.artifact}>
              <td>
                <span className="qualified-artifact-cell-label" aria-hidden="true">Component</span>
                {row.label}
              </td>
              <td>
                <span className="qualified-artifact-cell-label" aria-hidden="true">Role</span>
                {roleLabels[row.role]}
              </td>
              <td>
                <span className="qualified-artifact-cell-label" aria-hidden="true">
                  Deployment applicability
                </span>
                {QUALIFIED_ARTIFACT_DEPLOYMENT_PATHS.map((path, index) => (
                  <React.Fragment key={path.id}>
                    {index > 0 && <br />}
                    <strong>{path.label}:</strong>{' '}
                    {applicabilityLabels[row.applicability[path.id]]}
                  </React.Fragment>
                ))}
              </td>
              <td>
                <span className="qualified-artifact-cell-label" aria-hidden="true">
                  Stable identity
                </span>
                <a href={row.packageUrl}><code>{row.identity}</code></a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href={QUALIFIED_ARTIFACT_TUPLE_AUTHORITY.authorityUrl}>
          Open the stable release manifest
        </a>
      </p>
    </>
  );
}
