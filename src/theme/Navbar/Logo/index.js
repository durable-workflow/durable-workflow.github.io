import React from 'react';
import Link from '@docusaurus/Link';
import useBaseUrl from '@docusaurus/useBaseUrl';

export default function NavbarLogo() {
  return (
    <Link to="/" className="navbar__brand dw-brand" aria-label="Durable Workflow home">
      <span className="dw-logo-chip"><img src={useBaseUrl('/img/logo.svg')} width="32" height="32" alt="" /></span>
      <span className="dw-wordmark">Durable Workflow</span>
      <span className="dw-surface-label"><span aria-hidden="true">/ </span>docs</span>
    </Link>
  );
}
