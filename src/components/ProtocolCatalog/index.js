import React from 'react';
import Translate from '@docusaurus/Translate';
import protocolCatalog from '@site/static/platform-protocol-specs.json';

const {availableProtocolEntries} = require('./catalog');

function ObjectFamilies({families}) {
  return (
    <ul>
      {families.map(family => (
        <li
          key={`${family.name}:${family.owner_repo}`}
          data-object-family={family.name}
          data-owner-repo={family.owner_repo}>
          <code>{family.name}</code> — <code>{family.owner_repo}</code>
        </li>
      ))}
    </ul>
  );
}

export default function ProtocolCatalog() {
  return (
    <div
      data-platform-protocol-catalog={protocolCatalog.schema}
      data-catalog-version={protocolCatalog.version}>
      {availableProtocolEntries(protocolCatalog).map(([name, entry]) => (
        <section
          key={name}
          data-protocol-entry={name}
          data-spec-id={entry.spec_id}
          data-spec-url={entry.spec_url}
          data-owner-repo={entry.owner_repo}
          data-format={entry.format}
          data-status={entry.status}
          data-availability="available">
          <h3 id={name}>
            <code>{name}</code>
          </h3>
          <dl>
            <div>
              <dt><Translate id="protocolCatalog.specId">Specification ID</Translate></dt>
              <dd><code>{entry.spec_id}</code></dd>
            </div>
            <div>
              <dt><Translate id="protocolCatalog.publicSpec">Public specification</Translate></dt>
              <dd><a href={entry.spec_url}>{entry.spec_url}</a></dd>
            </div>
            <div>
              <dt><Translate id="protocolCatalog.formatStatus">Format and status</Translate></dt>
              <dd><code>{entry.format}</code> · <code>{entry.status}</code></dd>
            </div>
            <div>
              <dt><Translate id="protocolCatalog.owner">Owning contract</Translate></dt>
              <dd><code>{entry.owner_repo}</code></dd>
            </div>
          </dl>
          <h4><Translate id="protocolCatalog.objectFamilies">Object families and owning contracts</Translate></h4>
          <ObjectFamilies families={entry.object_families} />
        </section>
      ))}
    </div>
  );
}
