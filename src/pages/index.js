import React from 'react';
import Head from '@docusaurus/Head';
import Link from '@docusaurus/Link';
import Translate, {translate} from '@docusaurus/Translate';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import ProductPromotion from '@site/src/components/ProductPromotion';
import identityLinks from '@site/static/identity/links.json';
import styles from './index.module.css';

function HomepageHeader() {
  return (
    <header className={styles.heroBanner} data-homepage-release="stable-2.0">
      <div className={`container ${styles.heroGrid}`}>
        <div>
          <p className="dw-eyebrow"><Translate id="identity.durableExecution">Durable execution</Translate></p>
          <h1><Translate id="identity.heroTitle">Work that keeps going.</Translate></h1>
          <p className={styles.lede}><Translate id="homepage.tagline">Durable execution for PHP, Python, and Rust.</Translate></p>
          <p className={styles.description}><Translate id="homepage.description">A language-neutral durable execution platform for PHP, Python, and Rust, available as managed Cloud, self-hosted Server, or an embedded Laravel runtime.</Translate></p>
          <div className={styles.buttons}>
            <Link className="button button--primary" data-homepage-action="get-started" data-action-priority="primary" to="/docs/introduction/">
              <Translate id="homepage.getStarted">Get started</Translate><span aria-hidden="true"> →</span>
            </Link>
            <Link className="button button--secondary" data-homepage-action="deployment-modes" data-action-priority="secondary" to="/docs/polyglot/deployment-modes/">
              <Translate id="homepage.deploymentModes">Choose a deployment mode</Translate>
            </Link>
          </div>
        </div>
        <div className={styles.startCard}>
          <p className="dw-eyebrow"><Translate id="identity.startEyebrow">Your next step</Translate></p>
          <h2><Translate id="identity.startTitle">Start where you build.</Translate></h2>
          <Link className={styles.startLink} to="/docs/installation/">
            <span><strong>Laravel</strong><small><Translate id="identity.embedded">Embedded in your application</Translate></small></span><span aria-hidden="true">→</span>
          </Link>
          {['python', 'rust', 'php'].map(language => (
            <Link key={language} className={styles.startLink} to={identityLinks[language]}>
              <span><strong>{language === 'php' ? 'PHP' : language[0].toUpperCase() + language.slice(1)}</strong><small><Translate id="identity.sdkGuide">SDK guide and API reference</Translate></small></span><span aria-hidden="true">↗</span>
            </Link>
          ))}
          <p className={styles.cardNote}><Translate id="identity.runtimeNote">Run the Server yourself or connect to managed Cloud.</Translate></p>
        </div>
      </div>
    </header>
  );
}

export default function Home() {
  const description = translate({id: 'homepage.description', message: 'A language-neutral durable execution platform for PHP, Python, and Rust, available as managed Cloud, self-hosted Server, or an embedded Laravel runtime.'});
  return (
    <Layout title={translate({id: 'identity.heroTitle', message: 'Work that keeps going.'})} description={description}>
      <Head><meta property="og:title" content="Durable Workflow" /><meta name="twitter:title" content="Durable Workflow" /></Head>
      <main>
        <HomepageHeader />
        <HomepageFeatures />
        <section className={`container ${styles.cloudSection}`} aria-label="Durable Workflow Cloud">
          <ProductPromotion source="docs-homepage">
            <p><Translate id="homepage.cloudDescription">Run it managed: Cloud Dev, $0.075/hour, capped at $50/month, no per-workflow charges.</Translate></p>
            <p><Translate id="homepage.cloudTerms">USD per runtime, metered by the minute while provisioned, with a $2 minimum per active month and 5 GB included storage. Dev has no uptime SLA.</Translate></p>
          </ProductPromotion>
        </section>
      </main>
    </Layout>
  );
}
