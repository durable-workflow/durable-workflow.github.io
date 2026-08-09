import React from 'react';

const {
  PYTHON_PACKAGE_AUTHORITY,
} = require('../../../scripts/public-artifact-versions');

export default function PythonPackageReleaseLink({children}) {
  return (
    <a href={PYTHON_PACKAGE_AUTHORITY.authorityUrl}>
      {children}
    </a>
  );
}
