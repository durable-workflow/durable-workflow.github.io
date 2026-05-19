import React from 'react';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import Link from '@docusaurus/Link';
import {useDocsVersion} from '@docusaurus/theme-common/internal';

// Docusaurus only renders the built-in banner when a version declares
// `banner` in docusaurus.config.js. v2.0 already shows an "unreleased"
// warning banner; v1.x carries no banner by default. Until v2.0 ships,
// this wrapper renders an info banner on v1.x pages so every page gives
// readers a visual cue about which major version they are viewing.
export default function DocVersionBannerWrapper(props) {
  const versionMetadata = useDocsVersion();

  if (versionMetadata.version === '1.x') {
    return (
      <div
        className="alert alert--info margin-bottom--md"
        role="alert">
        <div>
          You are viewing the <b>v1.x</b> documentation (the current stable
          release line).
        </div>
        <div className="margin-top--md">
          v2.0 is in active development -{' '}
          <Link to="/docs/2.0/introduction">preview the v2.0 documentation</Link>.
        </div>
      </div>
    );
  }

  return <DocVersionBanner {...props} />;
}
