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
                href: 'https://packagist.org/packages/laravel-workflow/laravel-workflow',
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
