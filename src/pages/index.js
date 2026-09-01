import React from 'react';
import clsx from 'clsx';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import ProductPromotion from '@site/src/components/ProductPromotion';

import styles from './index.module.css';

const homepageTitle = 'Durable Workflow 2.0';
const homepageDescription =
  'A language-neutral durable execution platform for PHP, Python, and Rust, available as managed Cloud, self-hosted Server, or an embedded Laravel runtime.';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header
      className={clsx('hero hero--primary', styles.heroBanner)}
      data-homepage-release="stable-2.0">
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            data-homepage-action="get-started"
            data-action-priority="primary"
            to="/docs/introduction/">
            Get started
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            data-homepage-action="deployment-modes"
            data-action-priority="secondary"
            to="/docs/polyglot/deployment-modes/">
            Choose a deployment mode
          </Link>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>{homepageTitle}</title>
        <meta
          property="og:title"
          content={homepageTitle}
        />
        <meta
          name="twitter:title"
          content={homepageTitle}
        />
        <meta
          name="description"
          content={homepageDescription}
        />
        <meta
          property="og:description"
          content={homepageDescription}
        />
        <meta
          name="twitter:description"
          content={homepageDescription}
        />
      </Head>
      <HomepageHeader />
      <main>
        <section className="container" aria-label="Durable Workflow Cloud">
          <ProductPromotion source="docs-homepage">
            Run PHP, Python, or Rust workers against a managed namespace while
            Durable Workflow operates the orchestration runtime.
          </ProductPromotion>
        </section>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
