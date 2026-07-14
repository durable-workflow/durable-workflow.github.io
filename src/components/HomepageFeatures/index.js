import React from 'react';
import clsx from 'clsx';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Built for Laravel',
    Svg: require('@site/static/img/undraw_docusaurus_mountain.svg').default,
    description: (
      <>
        Add the Composer package to your application and keep using Laravel's
        database, queues, service container, events, and Eloquent models.
      </>
    ),
  },
  {
    title: 'Durable through failures',
    Svg: require('@site/static/img/undraw_docusaurus_tree.svg').default,
    description: (
      <>
        Event-sourced history and deterministic replay rebuild workflow state after
        a crash, while durable timers survive restarts and long waits.
      </>
    ),
  },
  {
    title: 'Coordinate long-running work',
    Svg: require('@site/static/img/undraw_docusaurus_react.svg').default,
    description: (
      <>
        Run activities in series or parallel, then use signals, queries, updates,
        child workflows, and sagas to model processes that evolve over time.
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
      data-homepage-release="stable-1.x">
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
