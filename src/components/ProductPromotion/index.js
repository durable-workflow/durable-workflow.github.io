import React, {useEffect, useId, useRef} from 'react';
import Link from '@docusaurus/Link';

import styles from './styles.module.css';

const CLOUD_EARLY_ACCESS_URL = 'https://cloud.durable-workflow.com/early-access';
const PROMOTION_EVENT_URL = `${CLOUD_EARLY_ACCESS_URL}/promotion-events`;
const PUBLIC_HOSTNAME = 'durable-workflow.com';

function sendPromotionEvent(source, event) {
  if (typeof window === 'undefined' || window.location.hostname !== PUBLIC_HOSTNAME) {
    return;
  }

  window.fetch(PROMOTION_EVENT_URL, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    keepalive: true,
    referrer: '',
    referrerPolicy: 'strict-origin-when-cross-origin',
    headers: {'Content-Type': 'text/plain'},
    body: JSON.stringify({source, event}),
  }).catch(() => {});
}

export default function ProductPromotion({source, children}) {
  const titleId = useId();
  const placementRef = useRef(null);
  const impressionSent = useRef(false);

  useEffect(() => {
    const placement = placementRef.current;
    if (!placement) return undefined;

    const recordImpression = () => {
      if (impressionSent.current) return;
      impressionSent.current = true;
      sendPromotionEvent(source, 'impression');
    };

    if (typeof IntersectionObserver === 'undefined') {
      recordImpression();
      return undefined;
    }

    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        recordImpression();
        observer.disconnect();
      }
    }, {threshold: 0.35});
    observer.observe(placement);

    return () => observer.disconnect();
  }, [source]);

  return (
    <aside
      ref={placementRef}
      className={styles.promotion}
      aria-labelledby={titleId}
      data-promotion-source={source}>
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Managed service · limited cohort</p>
        <h2 id={titleId}>Durable Workflow Cloud launch cohort</h2>
        <div className={styles.description}>{children}</div>
      </div>
      <Link
        className="button button--primary"
        data-promotion-action="early-access"
        to={`${CLOUD_EARLY_ACCESS_URL}#source=${encodeURIComponent(source)}`}
        onClick={() => sendPromotionEvent(source, 'click')}>
        Request early access
      </Link>
    </aside>
  );
}
