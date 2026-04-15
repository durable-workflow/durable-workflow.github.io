import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Detect if we're on v2.0 docs based on URL
    const isV2Docs = window.location.pathname.startsWith('/docs/2.0/');

    // Find and update the LLM Docs link in the footer
    const llmDocsLink = footerRef.current.querySelector('a[href*="llms-full.txt"]');
    if (llmDocsLink) {
      const targetUrl = isV2Docs
        ? 'https://durable-workflow.com/llms-full-2.0.txt'
        : 'https://durable-workflow.com/llms-full.txt';
      llmDocsLink.setAttribute('href', targetUrl);
    }
  }, []);

  return (
    <div ref={footerRef}>
      <Footer {...props} />
    </div>
  );
}
