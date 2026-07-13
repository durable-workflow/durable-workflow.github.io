function availableProtocolEntries(catalog) {
  return Object.entries(catalog.specs).filter(
    ([, entry]) => entry.status !== 'planned' && typeof entry.spec_url === 'string',
  );
}

module.exports = {
  availableProtocolEntries,
};
