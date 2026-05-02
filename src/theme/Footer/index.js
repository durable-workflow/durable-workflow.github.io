import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt now serves v2.0. Redirect readers who are on
    // legacy 1.x docs (path prefix /docs/ but not /docs/2.0/) to the v1
    // version-pinned bundle so the footer link matches the docs they are
    // reading.
    const pathname = window.location.pathname;
    const isV1Docs = pathname.startsWith('/docs/') && !pathname.startsWith('/docs/2.0/');

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
