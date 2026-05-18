import React from 'react';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import Link from '@docusaurus/Link';
import {useDocsVersion} from '@docusaurus/theme-common/internal';

// Docusaurus only renders the built-in banner when a version declares
// `banner` in docusaurus.config.js. This wrapper gives readers a visual cue
// about the current v2 release-candidate docs and the legacy v1.x snapshot.
export default function DocVersionBannerWrapper(props) {
  const versionMetadata = useDocsVersion();

  if (versionMetadata.version === 'current') {
    return (
      <div
        className="alert alert--warning margin-bottom--md"
        role="alert">
        <div>
          You are viewing the <b>v2.0</b> documentation for the current
          release-candidate line.
        </div>
        <div className="margin-top--md">
          Maintaining a v1.x application?{' '}
          <Link to="/docs/1.x/introduction">Open the v1.x documentation</Link>.
        </div>
      </div>
    );
  }

  if (versionMetadata.version === '1.x') {
    return (
      <div
        className="alert alert--info margin-bottom--md"
        role="alert">
        <div>
          You are viewing the legacy <b>v1.x</b> documentation.
        </div>
        <div className="margin-top--md">
          Starting something new?{' '}
          <Link to="/docs/introduction">Open the v2.0 documentation</Link>.
        </div>
      </div>
    );
  }

  return <DocVersionBanner {...props} />;
}
