import React from 'react';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import Link from '@docusaurus/Link';
import {useDocsVersion} from '@docusaurus/theme-common/internal';

// Docusaurus only renders the built-in banner when a version declares
// `banner` in docusaurus.config.js. v1.x carries no banner by default, so this
// wrapper renders an info banner on historical pages.
export default function DocVersionBannerWrapper(props) {
  const versionMetadata = useDocsVersion();

  if (versionMetadata.version === '1.x') {
    return (
      <div
        className="alert alert--info margin-bottom--md"
        role="alert">
        <div>
          You are viewing the historical <b>v1.x</b> documentation.
        </div>
        <div className="margin-top--md">
          Current 2.0 guidance is available in the{' '}
          <Link to="/docs/introduction">default documentation</Link>.
        </div>
      </div>
    );
  }

  return <DocVersionBanner {...props} />;
}
