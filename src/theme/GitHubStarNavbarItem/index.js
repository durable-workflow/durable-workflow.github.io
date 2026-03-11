import React, {useEffect, useState} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';

// Keep the fallback close to the current real star count so first render stays credible before the live fetch completes.
const DEFAULT_STAR_COUNT = 1172; // latest count used to avoid showing a zero-star count before the first successful fetch
const STAR_COUNT_CACHE_TTL = 1000 * 60 * 30;

function formatFullStarCount(count) {
  return count.toLocaleString('en-US');
}

function formatCompactStarCount(count) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  })
    .format(count)
    .toUpperCase();
}

function getCacheKey(repo) {
  return `github-star-count:${repo}`;
}

function readCachedStarCount(repo) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(getCacheKey(repo));
    if (!rawValue) {
      return null;
    }

    const cachedValue = JSON.parse(rawValue);
    if (
      typeof cachedValue?.count !== 'number' ||
      typeof cachedValue?.fetchedAt !== 'number'
    ) {
      return null;
    }

    if (Date.now() - cachedValue.fetchedAt > STAR_COUNT_CACHE_TTL) {
      return null;
    }

    return cachedValue.count;
  } catch (error) {
    return null;
  }
}

function writeCachedStarCount(repo, count) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      getCacheKey(repo),
      JSON.stringify({
        count,
        fetchedAt: Date.now(),
      }),
    );
  } catch (error) {
    // Ignore storage failures and fall back to a fresh fetch next time.
  }
}

function useGitHubStarCount(repo) {
  const [state, setState] = useState(() => {
    const cachedStarCount = readCachedStarCount(repo);

    return {
      starCount: cachedStarCount ?? DEFAULT_STAR_COUNT,
      resolved: cachedStarCount !== null,
    };
  });

  useEffect(() => {
    const controller = new AbortController();

    async function fetchStarCount() {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();

        if (typeof payload?.stargazers_count !== 'number') {
          return;
        }

        setState({
          starCount: payload.stargazers_count,
          resolved: true,
        });
        writeCachedStarCount(repo, payload.stargazers_count);
      } catch (error) {
        if (error?.name !== 'AbortError') {
          return;
        }
      }
    }

    fetchStarCount();

    return () => controller.abort();
  }, [repo]);

  return state;
}

export default function GitHubStarNavbarItem({
  mobile = false,
  mobileTopBar = false,
  className,
  href,
  repo = 'durable-workflow/workflow',
  position,
  'aria-label': ariaLabel,
  ...props
}) {
  const {starCount, resolved} = useGitHubStarCount(repo);
  const fullStarCount = resolved ? formatFullStarCount(starCount) : null;
  const compactStarCount = formatCompactStarCount(starCount);
  const resolvedAriaLabel = fullStarCount
    ? `${ariaLabel ?? 'GitHub repository'} (${fullStarCount} stars)`
    : ariaLabel ?? 'GitHub repository';
  const sharedClassName = clsx(
    className,
    'navbar-github-star-link',
    {
      'menu__link': mobile,
      'navbar__item navbar__link': !mobile && !mobileTopBar,
      'navbar__link navbar-github-star-link--mobile-topbar': mobileTopBar,
    },
  );

  const content = (
    <>
      <svg
        aria-hidden="true"
        className="navbar-github-star-link__icon"
        viewBox="0 0 16 16"
      >
        <path d="M8 0C3.58 0 0 3.58 0 8a8.01 8.01 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.56 7.56 0 0 1 8 4.76c.68 0 1.36.09 2 .27 1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <span
        className="navbar-github-star-link__count"
        title={resolved ? `${fullStarCount} GitHub stars` : 'GitHub stars'}
      >
        {compactStarCount}
      </span>
    </>
  );

  if (mobile) {
    return (
      <li className="menu__list-item">
        <Link
          aria-label={resolvedAriaLabel}
          className={sharedClassName}
          href={href}
          {...props}
        >
          {content}
        </Link>
      </li>
    );
  }

  return (
    <Link
      aria-label={resolvedAriaLabel}
      className={sharedClassName}
      href={href}
      {...props}
    >
      {content}
    </Link>
  );
}
