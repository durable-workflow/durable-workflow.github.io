import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Build in PHP, Python, or Rust',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Author clients, workflows, and activities with first-party SDKs that
        share one public protocol and portable Avro payload model.
      </>
    ),
  },
  {
    title: 'Choose who operates the runtime',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Use Durable Workflow Cloud, run the standalone Server, or keep the
        Laravel-native embedded runtime inside your application.
      </>
    ),
  },
  {
    title: 'Recover through failures',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Durable history, deterministic replay, timers, retries, signals,
        updates, child workflows, and sagas keep long-running work moving.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section
      className={styles.features}
      data-homepage-release="stable-2.0">
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
