import React from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import DocItemContent from '@theme-original/DocItem/Content';

export default function DocItemContentWrapper(props) {
  const {i18n: {currentLocale, defaultLocale}} = useDocusaurusContext();
  const {metadata} = useDoc();
  const usesEnglishFallback = currentLocale !== defaultLocale &&
    !metadata.source.startsWith(`@site/i18n/${currentLocale}/`);
  const englishPath = metadata.permalink.replace(`/${currentLocale}/`, '/').replace(/\/?$/, '/');

  return (
    <>
      {usesEnglishFallback && (
        <aside className="alert alert--info margin-bottom--md" data-docs-language-fallback="en">
          <Translate id="docs.translationFallback">
            This page is available in English while its translation is being prepared.
          </Translate>{' '}
          <Link to={`pathname://${englishPath}`} autoAddBaseUrl={false}>
            <Translate id="docs.readInEnglish">Read in English</Translate>
          </Link>
        </aside>
      )}
      <div lang={usesEnglishFallback ? 'en' : currentLocale}>
        <DocItemContent {...props} />
      </div>
    </>
  );
}
