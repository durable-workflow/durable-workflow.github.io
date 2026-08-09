import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import {useDocsVersion} from '@docusaurus/plugin-content-docs/client';
import {ThemeClassNames} from '@docusaurus/theme-common';
import DocVersionBanner from '@theme-original/DocVersionBanner';
import styles from './styles.module.css';

export default function DocVersionBannerWrapper(props) {
  const versionMetadata = useDocsVersion();

  if (
    versionMetadata.version === 'current' &&
    versionMetadata.banner === 'unreleased'
  ) {
    return (
      <aside
        aria-label="Documentation release status"
        className={clsx(
          props.className,
          ThemeClassNames.docs.docVersionBanner,
          styles.releaseBanner,
          'margin-bottom--md',
        )}
        data-docs-release-banner-version="2.0">
        <strong>2.0 release-candidate documentation.</strong>{' '}
        <Link
          data-docs-stable-version="1.x"
          to="/docs/introduction/">
          1.x
        </Link>{' '}
        remains the current stable line.
      </aside>
    );
  }

  return <DocVersionBanner {...props} />;
}
