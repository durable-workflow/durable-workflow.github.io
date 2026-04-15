import React, {useEffect, useState} from 'react';
import BrowserOnly from '@docusaurus/BrowserOnly';
import CodeBlock from '@theme/CodeBlock';

const PLATFORMS = [
  {
    id: 'linux-x86_64',
    label: 'Linux (x86_64)',
    shell: 'bash',
    command: 'curl -fsSL https://durable-workflow.com/install.sh | sh',
    note: 'Installs to ~/.local/bin. Set DURABLE_WORKFLOW_INSTALL_DIR to override.',
    asset: 'durable-workflow-linux-x86_64',
  },
  {
    id: 'linux-aarch64',
    label: 'Linux (arm64)',
    shell: 'bash',
    command: 'curl -fsSL https://durable-workflow.com/install.sh | sh',
    note: 'Installs to ~/.local/bin. Set DURABLE_WORKFLOW_INSTALL_DIR to override.',
    asset: 'durable-workflow-linux-aarch64',
  },
  {
    id: 'macos-aarch64',
    label: 'macOS (Apple Silicon)',
    shell: 'bash',
    command: 'curl -fsSL https://durable-workflow.com/install.sh | sh',
    note: 'Installs to ~/.local/bin. Set DURABLE_WORKFLOW_INSTALL_DIR to override.',
    asset: 'durable-workflow-macos-aarch64',
  },
  {
    id: 'windows-x86_64',
    label: 'Windows (x86_64)',
    shell: 'powershell',
    command: 'irm https://durable-workflow.com/install.ps1 | iex',
    note: 'Installs to %USERPROFILE%\\.durable-workflow\\bin and adds it to your user PATH.',
    asset: 'durable-workflow-windows-x86_64.exe',
  },
];

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'linux-x86_64';
  const ua = (navigator.userAgent || '').toLowerCase();
  const platform = (navigator.platform || '').toLowerCase();

  const isArm =
    /arm|aarch64/.test(ua) ||
    /arm|aarch64/.test(platform) ||
    (navigator.userAgentData && navigator.userAgentData.platform === 'macOS' && /arm/i.test(platform));

  if (/win/.test(platform) || /windows/.test(ua)) return 'windows-x86_64';
  if (/mac/.test(platform) || /mac os x/.test(ua)) return 'macos-aarch64';
  if (/linux/.test(platform) || /linux/.test(ua)) {
    return isArm ? 'linux-aarch64' : 'linux-x86_64';
  }
  return 'linux-x86_64';
}

function Installer() {
  const [selected, setSelected] = useState(PLATFORMS[0].id);
  const [detected, setDetected] = useState(null);

  useEffect(() => {
    const p = detectPlatform();
    setSelected(p);
    setDetected(p);
  }, []);

  const platform = PLATFORMS.find((p) => p.id === selected) || PLATFORMS[0];
  const assetUrl = `https://github.com/durable-workflow/cli/releases/latest/download/${platform.asset}`;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        {PLATFORMS.map((p) => {
          const isActive = p.id === selected;
          const isDetected = p.id === detected;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '6px',
                border: isActive
                  ? '1px solid var(--ifm-color-primary)'
                  : '1px solid var(--ifm-color-emphasis-300)',
                background: isActive
                  ? 'var(--ifm-color-primary)'
                  : 'var(--ifm-background-surface-color)',
                color: isActive ? 'white' : 'var(--ifm-color-emphasis-900)',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              {p.label}
              {isDetected && !isActive ? ' •' : ''}
            </button>
          );
        })}
      </div>

      {detected && detected !== selected && (
        <p style={{fontSize: '0.85rem', color: 'var(--ifm-color-emphasis-700)'}}>
          Detected <strong>{PLATFORMS.find((p) => p.id === detected).label}</strong>.{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setSelected(detected);
            }}
          >
            Switch back
          </a>
          .
        </p>
      )}

      <CodeBlock language={platform.shell}>{platform.command}</CodeBlock>

      <p style={{fontSize: '0.9rem', color: 'var(--ifm-color-emphasis-700)'}}>
        {platform.note}
      </p>

      <details>
        <summary>Or download the binary directly</summary>
        <p>
          <a href={assetUrl}>
            <code>{platform.asset}</code>
          </a>{' '}
          from the{' '}
          <a href="https://github.com/durable-workflow/cli/releases/latest">
            latest release
          </a>
          .
        </p>
      </details>
    </div>
  );
}

export default function CliInstall() {
  return (
    <BrowserOnly
      fallback={
        <CodeBlock language="bash">
          curl -fsSL https://durable-workflow.com/install.sh | sh
        </CodeBlock>
      }
    >
      {() => <Installer />}
    </BrowserOnly>
  );
}
