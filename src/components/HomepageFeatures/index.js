import React from 'react';
import Translate from '@docusaurus/Translate';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: <Translate id="homepage.features.languages.title">Build in PHP, Python, or Rust</Translate>,
    description: (
      <Translate id="homepage.features.languages.description">
        Author clients, workflows, and activities with first-party SDKs that
        share one public protocol and portable Avro payload model.
      </Translate>
    ),
  },
  {
    title: <Translate id="homepage.features.runtime.title">Choose who operates the runtime</Translate>,
    description: (
      <Translate id="homepage.features.runtime.description">
        Use Durable Workflow Cloud, run the standalone Server, or keep the
        Laravel-native embedded runtime inside your application.
      </Translate>
    ),
  },
  {
    title: <Translate id="homepage.features.recovery.title">Recover through failures</Translate>,
    description: (
      <Translate id="homepage.features.recovery.description">
        Durable history, deterministic replay, timers, retries, signals,
        updates, child workflows, and sagas keep long-running work moving.
      </Translate>
    ),
  },
];

function Feature({title, description, index}) {
  return (
    <article className={styles.feature}>
      <p className="dw-eyebrow">0{index + 1}</p>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}

export default function HomepageFeatures() {
  return (
    <section
      className={styles.features}
      data-homepage-release="stable-2.0">
      <div className="container">
        <div className={styles.grid}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} index={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
