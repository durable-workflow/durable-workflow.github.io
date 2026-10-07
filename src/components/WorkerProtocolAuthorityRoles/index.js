import React from 'react';
import Translate from '@docusaurus/Translate';
import compatibilityContract from '@site/static/compatibility-contract.json';
import conformanceContract from '@site/static/platform-conformance-contract.json';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

const {
  deriveWorkerProtocolAuthorityRoles,
} = require('./roles');

const roles = deriveWorkerProtocolAuthorityRoles({
  catalog: protocolCatalog,
  compatibilityContract,
  conformanceContract,
});

function ResolverLinks({apiUrl, streamUrl}) {
  return (
    <>
      <a href={apiUrl}>OpenAPI</a>
      {' · '}
      <a href={streamUrl}>AsyncAPI</a>
    </>
  );
}

export default function WorkerProtocolAuthorityRoles() {
  const {currentServer, currentConformance, historicalConformance} = roles;
  const historicalVersions = historicalConformance.protocolVersions.join(', ');

  return (
    <section
      data-worker-protocol-authority-roles="true"
      data-current-server-protocol-version={currentServer.protocolVersion}
      data-current-conformance-protocol-version={currentConformance.protocolVersion}
      data-current-conformance-suite-version={currentConformance.suiteVersion}>
      <h2 id="worker-protocol-authority-roles"><Translate id="workerAuthority.title">Worker protocol authority roles</Translate></h2>
      <p>
        <Translate id="workerAuthority.description">
          Runtime discovery and conformance qualification use separate protocol
          authorities. Choose the row for the job you are doing; a matching
          version label does not make a versioned historical resolver an alias
          for the unversioned Server authority.
        </Translate>
      </p>
      <table>
        <thead>
          <tr>
            <th><Translate id="workerAuthority.role">Role</Translate></th>
            <th><Translate id="workerAuthority.marker">Current marker</Translate></th>
            <th><Translate id="workerAuthority.resolver">Resolver authority</Translate></th>
          </tr>
        </thead>
        <tbody>
          <tr
            data-worker-protocol-role={currentServer.role}
            data-protocol-version={currentServer.protocolVersion}
            data-resolver-role={currentServer.resolverRole}
            data-api-url={currentServer.apiUrl}
            data-stream-url={currentServer.streamUrl}>
            <td><strong><Translate id="workerAuthority.currentServer">Current published Server protocol</Translate></strong></td>
            <td>
              <code>{currentServer.marker}</code>{' = '}
              <code>{currentServer.protocolVersion}</code>
            </td>
            <td>
              <Translate id="workerAuthority.serverMirrors">Unversioned Server-backed mirrors:</Translate>{' '}
              <ResolverLinks
                apiUrl={currentServer.apiUrl}
                streamUrl={currentServer.streamUrl}
              />
            </td>
          </tr>
          <tr
            data-worker-protocol-role={currentConformance.role}
            data-protocol-version={currentConformance.protocolVersion}
            data-suite-version={currentConformance.suiteVersion}
            data-resolver-role={currentConformance.resolverRole}
            data-api-url={currentConformance.apiUrl}
            data-stream-url={currentConformance.streamUrl}>
            <td><strong><Translate id="workerAuthority.currentConformance">Current Workflow conformance target</Translate></strong></td>
            <td>
              <Translate
                id="workerAuthority.suiteTarget"
                values={{suite: <code>{currentConformance.suiteVersion}</code>, protocol: <code>{currentConformance.protocolVersion}</code>}}>
                {'Suite {suite} targets protocol {protocol}'}
              </Translate>
            </td>
            <td>
              <Translate id="workerAuthority.fixtures">Versioned, digest-bound fixtures:</Translate>{' '}
              <ResolverLinks
                apiUrl={currentConformance.apiUrl}
                streamUrl={currentConformance.streamUrl}
              />
            </td>
          </tr>
          <tr
            data-worker-protocol-role={historicalConformance.role}
            data-history-protocol-versions={historicalVersions}
            data-history-binding-count={historicalConformance.bindingCount}
            data-resolver-role={historicalConformance.resolverRole}>
            <td><strong><Translate id="workerAuthority.historicalConformance">Retained historical conformance bindings</Translate></strong></td>
            <td>
              <Translate
                id="workerAuthority.historicalBindings"
                values={{marker: <code>historical</code>, protocols: <code>{historicalVersions}</code>}}>
                {'Bindings marked {marker} for protocols {protocols}'}
              </Translate>
            </td>
            <td>
              <Translate id="workerAuthority.historicalRecords">Immutable resolver and digest records in the</Translate>{' '}
              <a href={historicalConformance.manifestUrl}><Translate id="workerAuthority.manifest">conformance manifest</Translate></a>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
