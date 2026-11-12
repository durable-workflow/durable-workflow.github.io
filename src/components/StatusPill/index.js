import React, {useEffect, useState} from 'react';
import {translate} from '@docusaurus/Translate';
import {watchPublicStatus} from '@site/static/identity/status.mjs';
import links from '@site/static/identity/links.json';

export default function StatusPill() {
  const [state, setState] = useState('unknown');
  useEffect(() => watchPublicStatus(setState), []);
  const labels = {
    operational: translate({id: 'identity.statusOperational', message: 'All systems operational'}),
    degraded: translate({id: 'identity.statusDegraded', message: 'Service degraded'}),
    incident: translate({id: 'identity.statusIncident', message: 'Service incident'}),
    maintenance: translate({id: 'identity.statusMaintenance', message: 'Maintenance'}),
    stale: translate({id: 'identity.statusStale', message: 'Status stale'}),
    unverified: translate({id: 'identity.statusUnverified', message: 'Status unverified'}),
    unavailable: translate({id: 'identity.statusUnavailable', message: 'Status unavailable'}),
    unknown: translate({id: 'identity.statusUnknown', message: 'Status unknown'}),
  };
  return <a href={links.status} className="dw-status-pill" data-status={state} aria-live="polite" aria-atomic="true"><span className="dw-status-dot" aria-hidden="true" />{labels[state] || labels.unknown}</a>;
}
