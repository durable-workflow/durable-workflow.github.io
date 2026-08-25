import React from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {PageMetadata} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';

function CanonicalMetadata({canonicalPath}) {
  const {
    siteConfig: {url: siteUrl},
  } = useDocusaurusContext();
  const canonicalUrl = new URL(canonicalPath, siteUrl).toString();

  return (
    <Head>
      <meta property="og:url" content={canonicalUrl} />
      <link rel="canonical" href={canonicalUrl} />
    </Head>
  );
}

export default function DocItemMetadata() {
  const {metadata, frontMatter, assets} = useDoc();
  const canonicalPath = frontMatter.canonical_path;

  return (
    <>
      <PageMetadata
        title={metadata.title}
        description={metadata.description}
        keywords={frontMatter.keywords}
        image={assets.image ?? frontMatter.image}
      />
      {canonicalPath && <CanonicalMetadata canonicalPath={canonicalPath} />}
    </>
  );
}
