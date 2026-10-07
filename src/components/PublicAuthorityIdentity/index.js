import React from 'react';
import Translate from '@docusaurus/Translate';

export default function PublicAuthorityIdentity({manifest, manifestUrl}) {
  const manifestPath = new URL(manifestUrl).pathname;

  return (
    <p
      data-public-authority-identity="true"
      data-authority-manifest={manifestUrl}
      data-authority-schema={manifest.schema}
      data-authority-version={manifest.version}>
      <Translate
        id="authority.identity"
        values={{
          manifest: <a href={manifestUrl}><code data-authority-field="manifest-path">{manifestPath}</code></a>,
          schema: <code data-authority-field="schema">{manifest.schema}</code>,
          version: <code data-authority-field="version">{manifest.version}</code>,
        }}>
        {'The machine-readable authority is published at {manifest} with schema {schema}, version {version}.'}
      </Translate>
    </p>
  );
}
