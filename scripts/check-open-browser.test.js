#!/usr/bin/env node

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const {EventEmitter} = require("node:events");
const {apps} = require("open");

const browserModule = require.resolve(
  "@docusaurus/core/lib/commands/utils/openBrowser/openBrowser",
);
const url = "http://localhost:3123/docs/introduction";

async function checkBrowser(browser, expectedApplication) {
  const originalSpawn = childProcess.spawn;
  const originalExec = childProcess.exec;
  const originalBrowser = process.env.DOCUSAURUS_BROWSER;
  const originalArguments = process.env.DOCUSAURUS_BROWSER_ARGS;
  const launches = [];
  try {
    if (browser === undefined) delete process.env.DOCUSAURUS_BROWSER;
    else process.env.DOCUSAURUS_BROWSER = browser;
    process.env.DOCUSAURUS_BROWSER_ARGS = "--new-window";
    // Skip native macOS browser discovery; capture launches on every platform.
    childProcess.exec = (...args) => {
      args.at(-1)(new Error("Native browser discovery is disabled in this test."));
    };
    childProcess.spawn = (command, args, options) => {
      launches.push({command, args, options});
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => {
        child.emit("spawn");
        child.emit("close", 0);
      });
      return child;
    };
    delete require.cache[browserModule];
    const openBrowser = require(browserModule).default;
    assert.equal(await openBrowser(url), true, `browser ${browser ?? "default"}`);
    assert.equal(launches.length, 1);
    const launch = launches[0];
    const encodedAt = launch.args.findIndex((arg) =>
      /^-encodedcommand$/i.test(arg));
    const argumentsText = encodedAt < 0
      ? launch.args.join(" ")
      : Buffer.from(launch.args[encodedAt + 1], "base64").toString("utf16le");
    assert.ok(argumentsText.includes(url));
    assert.notEqual(launch.options.shell, true);
    if (expectedApplication) {
      assert.ok(`${launch.command} ${argumentsText}`.includes(expectedApplication));
      assert.ok(argumentsText.includes("--new-window"));
    }
  } finally {
    childProcess.spawn = originalSpawn;
    childProcess.exec = originalExec;
    if (originalBrowser === undefined) delete process.env.DOCUSAURUS_BROWSER;
    else process.env.DOCUSAURUS_BROWSER = originalBrowser;
    if (originalArguments === undefined) delete process.env.DOCUSAURUS_BROWSER_ARGS;
    else process.env.DOCUSAURUS_BROWSER_ARGS = originalArguments;
    delete require.cache[browserModule];
  }
}

async function main() {
  await checkBrowser("docs-test-browser", "docs-test-browser");
  await checkBrowser("chrome", [apps.chrome].flat()[0]);
  await checkBrowser(undefined);
  console.log("Real Docusaurus/open custom-browser, alias and default launch controls pass.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
