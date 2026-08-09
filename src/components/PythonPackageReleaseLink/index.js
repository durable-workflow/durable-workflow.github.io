import React from 'react';

const {
  PYTHON_PACKAGE_AUTHORITY,
  QUALIFIED_PYTHON_PACKAGE_AUTHORITY,
} = require('../../../scripts/public-artifact-versions');

export default function PythonPackageReleaseLink({authority = 'published', children}) {
  const packageAuthority = authority === 'qualified'
    ? QUALIFIED_PYTHON_PACKAGE_AUTHORITY
    : PYTHON_PACKAGE_AUTHORITY;

  return (
    <a href={packageAuthority.authorityUrl}>
      {children}
    </a>
  );
}
