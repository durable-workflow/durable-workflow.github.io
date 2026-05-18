import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt tracks the current v2 docs. Readers on a v1.x
    // path are explicitly looking at the legacy snapshot, so route the footer
    // bundle link to the version-pinned v1 artifact.
    const pathname = window.location.pathname;
    const isV1Docs = pathname.startsWith('/docs/1.x/');

    const llmDocsLink = footerRef.current.querySelector('a[href*="llms-full.txt"]');
    if (llmDocsLink && isV1Docs) {
      llmDocsLink.setAttribute('href', 'https://durable-workflow.com/llms-full-1.x.txt');
    }
  }, []);

  return (
    <div ref={footerRef}>
      <Footer {...props} />
    </div>
  );
}
