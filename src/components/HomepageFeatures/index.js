import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Polyglot SDKs',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Run the same durable execution model through first-party PHP, Python, and Rust SDKs against one shared runtime contract.
      </>
    ),
  },
  {
    title: 'Agent-First Operations',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Deterministic replay, machine-readable diagnostics, and safe lifecycle controls give both humans and autonomous agents a stable operating surface.
      </>
    ),
  },
  {
    title: 'Laravel-native when you want it. Polyglot when you need it.',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Start embedded in Laravel for a smooth application path, or move to the standalone server when your workers, operators, or deployment topology extend beyond PHP.
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
    <section className={styles.features}>
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
