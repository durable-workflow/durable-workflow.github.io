import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt tracks the stable unversioned docs line.
    // Only the explicit prerelease docs path should switch to the 2.0 bundle.
    const pathname = window.location.pathname;
    const isV2Docs = pathname.startsWith('/docs/');

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
