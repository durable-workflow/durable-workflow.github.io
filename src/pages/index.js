import React from 'react';
import clsx from 'clsx';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

const homepageTitle = 'Durable Workflow for Laravel';
const homepageDescription =
  'A Laravel-native durable workflow engine for long-running PHP applications, powered by Laravel queues and databases with deterministic replay and crash recovery.';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header
      className={clsx('hero hero--primary', styles.heroBanner)}
      data-homepage-release="stable-1.x">
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            data-homepage-action="stable-get-started"
            data-action-priority="primary"
            to="/docs/introduction/">
            Get Started with 1.x
          </Link>
          <Link
            className={styles.prereleaseLink}
            data-homepage-action="prerelease-2.0"
            data-action-priority="secondary"
            to="/docs/2.0/introduction/">
            Explore the 2.0 prerelease →
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
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
