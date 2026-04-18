import React from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';

import styles from './index.module.css';

const installCommands = [
  {
    title: 'Laravel package',
    label: '2.0 preview',
    command: 'composer require durable-workflow/workflow:^2.0@alpha',
    to: '/docs/2.0/installation',
  },
  {
    title: 'Server image',
    label: 'Docker',
    command: 'docker pull durableworkflow/server:0.2.2',
    to: '/docs/2.0/polyglot/server',
  },
  {
    title: 'CLI',
    label: 'Operators',
    command: 'curl -fsSL https://durable-workflow.com/install.sh | sh',
    to: '/docs/2.0/polyglot/cli',
  },
  {
    title: 'Python SDK',
    label: 'Polyglot',
    command: 'pip install durable-workflow',
    to: '/docs/2.0/polyglot/python',
  },
];

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/introduction">
            Stable Docs
          </Link>
          <Link
            className="button button--outline button--secondary button--lg"
            to="/docs/2.0/getting-started">
            2.0 Preview Quickstart
          </Link>
        </div>
      </div>
    </header>
  );
}

function InstallCommands() {
  return (
    <section className={styles.installSection}>
      <div className="container">
        <div className={styles.installHeader}>
          <p className={styles.installEyebrow}>2.0 preview installs</p>
          <h2>Run the engine where your code already lives.</h2>
          <p>
            Keep using the stable 1.x docs for production defaults. Use these
            commands when you are evaluating the v2 package, standalone server,
            CLI, or Python SDK.
          </p>
        </div>
        <div className={styles.installGrid}>
          {installCommands.map((item) => (
            <Link className={styles.installCard} to={item.to} key={item.title}>
              <div className={styles.installCardHeader}>
                <h3>{item.title}</h3>
                <span>{item.label}</span>
              </div>
              <code>{item.command}</code>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <Layout
      title="Durable Orchestration for Laravel"
      description="Laravel-native durable orchestration engine for long-running, fault-tolerant workflows in PHP without a dedicated cluster.">
      <HomepageHeader />
      <main>
        <InstallCommands />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
