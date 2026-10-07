import React, { useEffect, useRef } from 'react';
import Footer from '@theme-original/Footer';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export default function FooterWrapper(props) {
  const footerRef = useRef(null);
  const {i18n: {currentLocale, defaultLocale}} = useDocusaurusContext();

  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM || !footerRef.current) {
      return;
    }

    // Canonical /llms-full.txt tracks the stable unversioned docs line.
    // Only the explicit prerelease docs path should switch to the 2.0 bundle.
    const pathname = window.location.pathname;
    const docsPrefix = currentLocale === defaultLocale
      ? '/docs/'
      : `/${currentLocale}/docs/`;
    const isV2Docs = pathname.startsWith(docsPrefix);

    const llmDocsLink = footerRef.current.querySelector('a[href*="llms-full.txt"]');
    if (llmDocsLink && isV2Docs) {
      llmDocsLink.setAttribute('href', 'https://durable-workflow.com/llms-full-2.0.txt');
    }
  }, [currentLocale, defaultLocale]);

  return (
    <div ref={footerRef}>
      <Footer {...props} />
    </div>
  );
}
