import React from 'react';

const {
  QUALIFIED_ARTIFACT_INSTALL_SURFACE,
  QUALIFIED_ARTIFACT_TUPLE_AUTHORITY,
} = require('../../../scripts/public-artifact-versions');

export default function QualifiedArtifactTuple() {
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>Exact install identity</th>
          </tr>
        </thead>
        <tbody>
          {QUALIFIED_ARTIFACT_INSTALL_SURFACE.map(row => (
            <tr key={row.artifact}>
              <td>{row.label}</td>
              <td><a href={row.packageUrl}><code>{row.identity}</code></a></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <a href={QUALIFIED_ARTIFACT_TUPLE_AUTHORITY.authorityUrl}>
          Open the versioned qualification authority
        </a>
      </p>
    </>
  );
}
