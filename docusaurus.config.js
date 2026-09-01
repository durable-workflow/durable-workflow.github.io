// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const { themes: prismThemes } = require('prism-react-renderer');
const { artifactVersionRemarkPlugin } = require('./scripts/public-artifact-versions');

const cloudflareWebAnalytics = Object.freeze({
  provider: 'cloudflare-web-analytics',
  beaconUrl: 'https://static.cloudflareinsights.com/beacon.min.js',
  productionHostname: 'durable-workflow.com',
  cookieFree: true,
});
const cloudflareWebAnalyticsToken =
  process.env.CLOUDFLARE_WEB_ANALYTICS_TOKEN || '__CLOUDFLARE_WEB_ANALYTICS_TOKEN__';

function mobileNavigationReachabilityPlugin() {
  return {
    name: 'mobile-navigation-reachability',
    getClientModules() {
      return [require.resolve('./src/clientModules/mobileNavigationReachability')];
    },
  };
}

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Durable Workflow',
  tagline: 'Durable execution for PHP, Python, and Rust.',
  url: 'https://durable-workflow.com',
  baseUrl: '/',
  trailingSlash: true,
  onBrokenAnchors: 'throw',
  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },
  favicon: 'img/favicon.ico',
  customFields: {
    analytics: cloudflareWebAnalytics,
  },
  scripts: [
    {
      src: '/analytics/cloudflare-web-analytics.js',
      type: 'module',
      'data-cloudflare-web-analytics-token': cloudflareWebAnalyticsToken,
    },
  ],

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'durable-workflow', // Usually your GitHub org/user name.
  projectName: 'durable-workflow.github.io', // Usually your repo name.

  // Even if you don't use internationalization, you can use this field to set useful
  // metadata like html lang. For example, if your site is Chinese, you may want
  // to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          remarkPlugins: [artifactVersionRemarkPlugin],
          editUrl:
            'https://github.com/durable-workflow/durable-workflow.github.io/edit/main/',
          lastVersion: 'current',
          versions: {
            current: {
              label: '2.0',
              path: '',
              banner: 'none',
            },
            '1.x': {
              label: '1.x',
              path: '1.x',
            },
          },
        },
        blog: {
          showReadingTime: true,
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/durable-workflow/durable-workflow.github.io/edit/main/',
        },
        sitemap: {
          // Docusaurus derives this from each route's source commit. The
          // post-build discovery patch adds the same signal to generated
          // artifacts and accounts for structured rendering dependencies.
          lastmod: 'date',
          ignorePatterns: [
            '/docs/constraints/idempotent-vs-deterministic',
            '/docs/constraints/idempotent-vs-deterministic/**',
          ],
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      }),
    ],
  ],

  plugins: [
    mobileNavigationReachabilityPlugin,
    [
      '@docusaurus/plugin-client-redirects',
      {
        createRedirects(existingPath) {
          if (
            existingPath.startsWith('/docs/') &&
            !existingPath.startsWith('/docs/1.x/')
          ) {
            return existingPath.replace('/docs/', '/docs/2.0/');
          }

          return undefined;
        },
        redirects: [
          {
            from: '/docs',
            to: '/docs/introduction/',
          },
          {
            from: '/docs/2.0',
            to: '/docs/introduction/',
          },
          {
            from: '/docs/2.0/server-setup',
            to: '/docs/polyglot/server',
          },
          {
            from: '/docs/2.0/cli',
            to: '/docs/polyglot/cli',
          },
          {
            from: '/docs/2.0/sdks/python',
            to: '/docs/polyglot/python',
          },
          {
            from: '/docs/2.0/configuration/worker-protocol',
            to: '/docs/polyglot/worker-protocol',
          },
        ],
      },
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        defaultMode: 'dark',
        disableSwitch: false,
        respectPrefersColorScheme: false,
      },
      navbar: {
        title: 'Durable Workflow',
        logo: {
          alt: 'Workflow Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            type: 'doc',
            docId: 'introduction',
            position: 'left',
            label: 'Docs',
          },
          {
            type: 'docsVersionDropdown',
            position: 'left',
            dropdownActiveClassDisabled: true,
          },
          {to: '/blog', label: 'Blog', position: 'left'},
          {
            type: 'custom-githubStar',
            href: 'https://github.com/durable-workflow/workflow',
            repo: 'durable-workflow/workflow',
            label: 'Star on GitHub',
            position: 'right',
            'aria-label': 'Star Durable Workflow on GitHub',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Docs',
            items: [
              {
                label: 'Introduction',
                to: '/docs/introduction',
              },
              {
                label: 'Installation',
                to: '/docs/installation',
              },
            ],
          },
          {
            title: 'Community',
            items: [
              {
                label: 'Discord',
                href: 'https://discord.gg/xu5aDDpqVy',
              },
              {
                label: 'X',
                href: 'https://x.com/DurableWorkflow',
              },
            ],
          },
          {
            title: 'More',
            items: [
              {
                label: 'LLM Docs',
                href: 'https://durable-workflow.com/llms-full.txt',
              },
              {
                label: 'Packagist',
                href: 'https://packagist.org/packages/durable-workflow/workflow',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} <a href="https://durable-workflow.com">Durable Workflow</a>.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
      },
      image: 'img/durable-workflow-2.0.png',
      algolia: {
        appId: 'IYIBF1DKO0',
        apiKey: 'bd5089d395bb02b42c90304ead050cdf',
        indexName: 'docs',
      },
    }),
};

module.exports = config;
