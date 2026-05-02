import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt tracks the site's lastVersion (1.x). Readers
    // on a /docs/2.0/ path are explicitly looking at v2; rewrite the footer's
    // bundle link to the v2 pin so they don't get the 1.x bundle from the
    // canonical link.
    const pathname = window.location.pathname;
    const isV2Docs = pathname.startsWith('/docs/2.0/');

    const llmDocsLink = footerRef.current.querySelector('a[href*="llms-full.txt"]');
    if (llmDocsLink && isV2Docs) {
      llmDocsLink.setAttribute('href', 'https://durable-workflow.com/llms-full-2.0.txt');
    }
  }, []);

  return (
    <div ref={footerRef}>
      <Footer {...props} />
    </div>
  );
}
