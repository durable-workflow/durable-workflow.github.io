import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt tracks the default current docs. Readers on a
    // versioned historical path should get the matching pinned bundle.
    const pathname = window.location.pathname;
    const isV1Docs = pathname.startsWith('/docs/1.x/');
    const isV2Docs = pathname.startsWith('/docs/');

    const llmDocsLink = footerRef.current.querySelector('a[href*="llms-full.txt"]');
    if (llmDocsLink && (isV1Docs || isV2Docs)) {
      const version = isV1Docs ? '1.x' : '2.0';
      llmDocsLink.setAttribute('href', `https://durable-workflow.com/llms-full-${version}.txt`);
    }
  }, []);

  return (
    <div ref={footerRef}>
      <Footer {...props} />
    </div>
  );
}
