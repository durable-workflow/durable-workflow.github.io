#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const config = require('../docusaurus.config.js');
const searchConsoleBaselines = require('./search-console-baselines.json');

const buildDir = path.join(__dirname, '..', 'build');
const baselineId = 'high-impression-article-search-relevance';
const descriptionLength = {minimum: 120, maximum: 160};
const titleMaximumLength = 70;

function fail(message) {
  throw new Error(message);
}

function decodeHtml(value) {
  return value
    ?.replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(?:x27|39);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>') ?? null;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`, 'i'));
  return match ? decodeHtml(match[1]) : null;
}

function openingTags(html, tagName) {
  return [...html.matchAll(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))]
    .map(match => match[0]);
}

function metaContent(html, keyName, keyValue) {
  const tag = openingTags(html, 'meta')
    .find(candidate => attribute(candidate, keyName) === keyValue);
  return tag ? attribute(tag, 'content') : null;
}

function linkHref(html, relationship) {
  const tag = openingTags(html, 'link')
    .find(candidate => attribute(candidate, 'rel') === relationship);
  return tag ? attribute(tag, 'href') : null;
}

function titleContent(html) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeHtml(match[1].trim()) : null;
}

function readRoute(route) {
  const relativePath = `${route.replace(/^\/+|\/+$/g, '')}/index.html`;
  const filePath = path.join(buildDir, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`Missing established article route at build/${relativePath}`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

function requireValue(value, label) {
  if (!value) {
    fail(`Missing ${label}`);
  }
  return value;
}

function assertMetadata(entry) {
  const html = readRoute(entry.route);
  const canonicalUrl = new URL(entry.route, config.url).toString();
  const title = requireValue(titleContent(html), `${entry.route} title`);
  const description = requireValue(
    metaContent(html, 'name', 'description'),
    `${entry.route} description`,
  );
  const openGraphTitle = requireValue(
    metaContent(html, 'property', 'og:title'),
    `${entry.route} Open Graph title`,
  );
  const openGraphDescription = requireValue(
    metaContent(html, 'property', 'og:description'),
    `${entry.route} Open Graph description`,
  );

  if (title !== openGraphTitle) {
    fail(`${entry.route} search and Open Graph titles must match`);
  }
  if (description !== openGraphDescription) {
    fail(`${entry.route} search and Open Graph descriptions must match`);
  }
  if (linkHref(html, 'canonical') !== canonicalUrl) {
    fail(`${entry.route} canonical must remain ${canonicalUrl}`);
  }
  if (metaContent(html, 'property', 'og:url') !== canonicalUrl) {
    fail(`${entry.route} Open Graph URL must match its canonical`);
  }
  if (metaContent(html, 'property', 'og:type') !== 'article') {
    fail(`${entry.route} must render Open Graph article metadata`);
  }
  if (!metaContent(html, 'name', 'twitter:card')) {
    fail(`${entry.route} must render Twitter card metadata`);
  }
  if (title.length > titleMaximumLength) {
    fail(`${entry.route} rendered title is ${title.length} characters; maximum is ${titleMaximumLength}`);
  }
  if (
    description.length < descriptionLength.minimum
    || description.length > descriptionLength.maximum
  ) {
    fail(
      `${entry.route} description is ${description.length} characters; `
      + `expected ${descriptionLength.minimum}-${descriptionLength.maximum}`,
    );
  }

  return {canonicalUrl, title, description};
}

function assertDistinct(values, property) {
  if (new Set(values.map(value => value[property])).size !== values.length) {
    fail(`Measured articles must render distinct ${property} values`);
  }
}

function main() {
  const baseline = searchConsoleBaselines.baselines
    .find(candidate => candidate.id === baselineId);
  if (!baseline || baseline.window?.status !== 'finalized') {
    fail(`Missing finalized Search Console baseline ${baselineId}`);
  }
  if (!Array.isArray(baseline.landing_pages) || baseline.landing_pages.length !== 4) {
    fail(`${baselineId} must identify four established landing pages`);
  }

  const rendered = baseline.landing_pages.map(assertMetadata);
  assertDistinct(rendered, 'canonicalUrl');
  assertDistinct(rendered, 'title');
  assertDistinct(rendered, 'description');

  console.log('High-impression article search and social metadata checks passed');
}

main();
