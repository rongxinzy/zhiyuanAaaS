import { useEffect, useState } from 'react';

/** Debounce the committed document-list keyword; Enter/button can still flush via applySearch. */
export function useDebouncedDocumentKeyword(delayMs = 300): {
  readonly keyword: string;
  readonly search: string;
  readonly setKeyword: (value: string) => void;
  readonly applySearch: (raw?: string) => void;
  readonly clearSearch: () => void;
} {
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = keyword.trim();
      setSearch((prev) => (prev === next ? prev : next));
    }, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, keyword]);

  const applySearch = (raw?: string) => {
    const next = (raw ?? keyword).trim();
    if (raw !== undefined) setKeyword(raw);
    setSearch(next);
  };

  const clearSearch = () => {
    setKeyword('');
    setSearch('');
  };

  return { keyword, search, setKeyword, applySearch, clearSearch };
}
