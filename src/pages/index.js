import React from 'react';
import clsx from 'clsx';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <p className={styles.supportingLine}>
          Run deterministic workflows in PHP, Python, and Rust against one self-hostable runtime. Start embedded in Laravel or deploy the standalone server, with structured diagnostics and safe operational controls built for humans and autonomous agents.
        </p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/introduction">
            Get Started - 5min ⏱️
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/2.0/quickstart/">
            2.0 Prerelease Quickstart
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
        <title>Durable Workflow: Agent-First Durable Execution</title>
        <meta
          property="og:title"
          content="Durable Workflow: Agent-First Durable Execution"
        />
        <meta
          name="twitter:title"
          content="Durable Workflow: Agent-First Durable Execution"
        />
        <meta
          name="description"
          content="A self-hostable, polyglot durable orchestration platform for applications and AI agents, with first-party PHP, Python, and Rust SDKs, deterministic replay, and machine-readable operations."
        />
        <meta
          property="og:description"
          content="A self-hostable, polyglot durable orchestration platform for applications and AI agents, with first-party PHP, Python, and Rust SDKs, deterministic replay, and machine-readable operations."
        />
        <meta
          name="twitter:description"
          content="A self-hostable, polyglot durable orchestration platform for applications and AI agents, with first-party PHP, Python, and Rust SDKs, deterministic replay, and machine-readable operations."
        />
      </Head>
      <HomepageHeader />
      <main>
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
