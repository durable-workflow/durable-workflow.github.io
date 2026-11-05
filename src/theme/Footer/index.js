import React from 'react';
import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useBaseUrl from '@docusaurus/useBaseUrl';
import {useLocation} from '@docusaurus/router';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import StatusPill from '@site/src/components/StatusPill';
import links from '@site/static/identity/links.json';

export default function Footer() {
  const {i18n: {currentLocale, defaultLocale}} = useDocusaurusContext();
  const {pathname} = useLocation();
  const prefix = currentLocale === defaultLocale ? '/docs/' : `/${currentLocale}/docs/`;
  const currentDocs = pathname.startsWith(prefix) && !pathname.startsWith(`${prefix}1.x/`);
  const llmDocs = currentDocs ? '/llms-full-2.0.txt' : '/llms-full.txt';
  return (
    <footer className="dw-footer">
      <div className="container">
        <div className="dw-footer-grid">
          <div>
            <Link to="/" className="dw-footer-brand"><span className="dw-logo-chip"><img src={useBaseUrl('/img/logo.svg')} width="28" height="28" alt="" /></span>Durable Workflow</Link>
            <p><Translate id="homepage.tagline">Durable execution for PHP, Python, and Rust.</Translate> <Translate id="identity.footerDescription">Self-host the Server or run on Cloud.</Translate></p>
          </div>
          <div><h2>SDKs</h2><ul>{['python', 'rust', 'php'].map(name => <li key={name}><a href={links[name]}>{name === 'php' ? 'PHP' : name[0].toUpperCase() + name.slice(1)}</a></li>)}</ul></div>
          <div>
            <h2><Translate id="identity.run">Run</Translate></h2>
            <ul>
              <li><Link to="/docs/polyglot/server/"><Translate id="identity.selfHosted">Self-hosted Server</Translate></Link></li>
              <li><a href={links.cloud}>Cloud</a></li>
              <li><a href={links.pricing}><Translate id="identity.pricing">Pricing</Translate></a></li>
              <li><a href={links.status}><Translate id="identity.status">Status</Translate></a></li>
              <li><Link to="/docs/installation/">Laravel</Link></li>
              <li><a href={`https://durable-workflow.com${llmDocs}`}>LLM Docs</a></li>
            </ul>
          </div>
          <div>
            <h2><Translate id="identity.project">Project</Translate></h2>
            <ul>
              <li><a href={links.github}>GitHub</a></li>
              <li><Link to="/docs/compatibility/"><Translate id="identity.compatibility">Version compatibility</Translate></Link></li>
              <li><a href={links.terms}><Translate id="identity.terms">Terms of Service</Translate></a></li>
              <li><a href={links.privacy}><Translate id="identity.privacy">Privacy Policy</Translate></a></li>
              <li><a href="https://discord.gg/xu5aDDpqVy">Discord</a> · <a href="https://x.com/DurableWorkflow">X</a></li>
              <li><a href="https://packagist.org/packages/durable-workflow/workflow">Packagist</a></li>
              <li><Link to="/blog/">Blog</Link></li>
            </ul>
          </div>
        </div>
        <div className="dw-footer-bottom"><span>© {new Date().getFullYear()} Durable Workflow</span><StatusPill /></div>
      </div>
    </footer>
  );
}
