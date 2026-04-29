// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

const lightCodeTheme = require('prism-react-renderer/themes/github');
const darkCodeTheme = require('prism-react-renderer/themes/dracula');

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Durable Workflow',
  tagline: 'Laravel-native durable workflows.',
  url: 'https://durable-workflow.com',
  baseUrl: '/',
  trailingSlash: true,
  onBrokenLinks: 'throw',
  onBrokenMarkdownLinks: 'warn',
  favicon: 'img/favicon.ico',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'durable-workflow', // Usually your GitHub org/user name.
  projectName: 'durable-workflow.github.io', // Usually your repo name.

  // Even if you don't use internalization, you can use this field to set useful
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
          editUrl:
            'https://github.com/durable-workflow/durable-workflow.github.io/edit/main/',
          lastVersion: '1.x',
          versions: {
            current: {
              label: '2.0',
              path: '2.0',
              banner: 'unreleased',
            },
            '1.x': {
              label: '1.x',
              path: '',
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
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        gtag: {
          trackingID: 'G-HD1YHT442Y',
          anonymizeIP: true,
        },
      }),
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        // TD-079: public v2 polyglot pages moved into /docs/2.0/polyglot/.
        // Keep the prior URLs working so external links, saved references,
        // and package metadata do not land on 404s after deploy.
        // /docs/polyglot/* aliases route unversioned references for the
        // v2-only polyglot surfaces (server, CLI, worker protocol, Python SDK,
        // and other v2 features) onto the published 2.0 pages. v1 never had
        // polyglot content, so these aliases do not collide with v1.
        redirects: [
          {
            from: '/docs/2.0/server-setup',
            to: '/docs/2.0/polyglot/server',
          },
          {
            from: '/docs/2.0/cli',
            to: '/docs/2.0/polyglot/cli',
          },
          {
            from: '/docs/2.0/sdks/python',
            to: '/docs/2.0/polyglot/python',
          },
          {
            from: '/docs/2.0/configuration/worker-protocol',
            to: '/docs/2.0/polyglot/worker-protocol',
          },
          {
            from: '/docs/polyglot/server',
            to: '/docs/2.0/polyglot/server',
          },
          {
            from: '/docs/polyglot/server-api-reference',
            to: '/docs/2.0/polyglot/server-api-reference',
          },
          {
            from: '/docs/polyglot/server-config-reference',
            to: '/docs/2.0/polyglot/server-config-reference',
          },
          {
            from: '/docs/polyglot/server-role-topology',
            to: '/docs/2.0/polyglot/server-role-topology',
          },
          {
            from: '/docs/polyglot/worker-protocol',
            to: '/docs/2.0/polyglot/worker-protocol',
          },
          {
            from: '/docs/polyglot/cli',
            to: '/docs/2.0/polyglot/cli',
          },
          {
            from: '/docs/polyglot/cli-reference',
            to: '/docs/2.0/polyglot/cli-reference',
          },
          {
            from: '/docs/polyglot/cli-python-parity',
            to: '/docs/2.0/polyglot/cli-python-parity',
          },
          {
            from: '/docs/polyglot/python',
            to: '/docs/2.0/polyglot/python',
          },
          {
            from: '/docs/polyglot/namespace-auth-workers',
            to: '/docs/2.0/polyglot/namespace-auth-workers',
          },
          {
            from: '/docs/polyglot/deployment-modes',
            to: '/docs/2.0/polyglot/deployment-modes',
          },
          {
            from: '/docs/polyglot/embedded-to-server',
            to: '/docs/2.0/polyglot/embedded-to-server',
          },
          {
            from: '/docs/polyglot/cloud-control-plane',
            to: '/docs/2.0/polyglot/cloud-control-plane',
          },
          {
            from: '/docs/polyglot/external-execution',
            to: '/docs/2.0/polyglot/external-execution',
          },
          {
            from: '/docs/polyglot/invocable-carrier',
            to: '/docs/2.0/polyglot/invocable-carrier',
          },
          {
            from: '/docs/polyglot/invocable-php-handler',
            to: '/docs/2.0/polyglot/invocable-php-handler',
          },
          {
            from: '/docs/polyglot/task-matching-dispatch',
            to: '/docs/2.0/polyglot/task-matching-dispatch',
          },
          {
            from: '/docs/polyglot/task-queue-admission',
            to: '/docs/2.0/polyglot/task-queue-admission',
          },
          {
            from: '/docs/polyglot/worker-build-id-rollout',
            to: '/docs/2.0/polyglot/worker-build-id-rollout',
          },
          {
            from: '/docs/polyglot/worker-compatibility-routing',
            to: '/docs/2.0/polyglot/worker-compatibility-routing',
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
            docId: 'installation',
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
        theme: lightCodeTheme,
        darkTheme: darkCodeTheme,
      },
      image: 'img/docusaurus.png',
      algolia: {
        appId: 'IYIBF1DKO0',
        apiKey: 'bd5089d395bb02b42c90304ead050cdf',
        indexName: 'docs',
      },
    }),
};

module.exports = config;
