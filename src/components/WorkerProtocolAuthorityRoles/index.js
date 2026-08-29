import React from 'react';
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
      <h2 id="worker-protocol-authority-roles">Worker protocol authority roles</h2>
      <p>
        Runtime discovery and conformance qualification use separate protocol
        authorities. Choose the row for the job you are doing; a matching
        version label does not make a versioned historical resolver an alias
        for the unversioned Server authority.
      </p>
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Current marker</th>
            <th>Resolver authority</th>
          </tr>
        </thead>
        <tbody>
          <tr
            data-worker-protocol-role={currentServer.role}
            data-protocol-version={currentServer.protocolVersion}
            data-resolver-role={currentServer.resolverRole}
            data-api-url={currentServer.apiUrl}
            data-stream-url={currentServer.streamUrl}>
            <td><strong>Current published Server protocol</strong></td>
            <td>
              <code>{currentServer.marker}</code>{' = '}
              <code>{currentServer.protocolVersion}</code>
            </td>
            <td>
              Unversioned Server-backed mirrors:{' '}
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
            <td><strong>Current Workflow conformance target</strong></td>
            <td>
              Suite <code>{currentConformance.suiteVersion}</code>{' targets '}
              protocol <code>{currentConformance.protocolVersion}</code>
            </td>
            <td>
              Versioned, digest-bound fixtures:{' '}
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
            <td><strong>Retained historical conformance bindings</strong></td>
            <td>
              Bindings marked <code>historical</code> for protocols{' '}
              <code>{historicalVersions}</code>
            </td>
            <td>
              Immutable resolver and digest records in the{' '}
              <a href={historicalConformance.manifestUrl}>conformance manifest</a>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
