const assert = require('node:assert/strict');

const { stripHtmlTags } = require('./generate-llms-full');

assert.equal(
  stripHtmlTags('<strong>Safe</strong> summary'),
  'Safe summary',
);
assert.equal(
  stripHtmlTags('<em>Less than</em> < 10 and > 1'),
  'Less than &lt; 10 and &gt; 1',
);
assert.equal(
  stripHtmlTags('<script without-a-close'),
  '&lt;script without-a-close',
);
assert.equal(
  stripHtmlTags('Nested <scr<script>ipt>alert(1)</script> fragment'),
  'Nested ipt&gt;alert(1) fragment',
);
