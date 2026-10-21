/** Return one bounded page of words, ranked by label match then visual family. */
export function wordPage(entries, { originalId, query = '', family = '', page = 0, limit = 8 } = {}) {
  const original = entries.find((entry) => entry.id === originalId);
  const search = query.trim().toLowerCase();
  const matches = entries.filter((entry) => {
    if (search) return `${entry.label} ${entry.family}`.toLowerCase().includes(search);
    return entry.family === (family || original?.family);
  }).sort((first, second) => {
    const rank = (entry) => (search && entry.label.toLowerCase().includes(search) ? 2 : 0)
      + (entry.family === original?.family ? 1 : 0);
    return rank(second) - rank(first) || first.label.localeCompare(second.label);
  });
  const pages = Math.max(1, Math.ceil(matches.length / limit));
  const currentPage = Math.max(0, Math.min(page, pages - 1));
  return { entries: matches.slice(currentPage * limit, (currentPage + 1) * limit), total: matches.length, page: currentPage, pages };
}
