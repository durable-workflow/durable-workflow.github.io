import React from 'react';
import Head from '@docusaurus/Head';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {PageMetadata} from '@docusaurus/theme-common';
import {useDoc} from '@docusaurus/plugin-content-docs/client';

function SupplementalMetadata({canonicalPath, title, description}) {
  const {
    siteConfig: {title: siteTitle, url: siteUrl},
  } = useDocusaurusContext();
  const canonicalUrl = canonicalPath
    ? new URL(canonicalPath, siteUrl).toString()
    : null;
  const socialTitle = title ? `${title} | ${siteTitle}` : siteTitle;

  return (
    <Head>
      <meta name="twitter:title" content={socialTitle} />
      <meta name="twitter:description" content={description} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
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
      <SupplementalMetadata
        canonicalPath={canonicalPath}
        title={metadata.title}
        description={metadata.description}
      />
    </>
  );
}
