const managedAttribute = 'data-dw-navigation-drawer-inert';
let observer;

function syncNavigationIsolation() {
  const drawerOpen = Boolean(document.querySelector('.navbar-sidebar--show .navbar-sidebar'));
  const backgroundSurfaces = document.querySelectorAll(
    '.navbar__inner, .dw-docs-toolbar, .theme-announcement-bar, a[class^="skipToContent"], main, footer',
  );

  for (const surface of backgroundSurfaces) {
    if (drawerOpen) {
      if (!surface.inert) {
        surface.inert = true;
        surface.setAttribute(managedAttribute, '');
      }
    } else if (surface.hasAttribute(managedAttribute)) {
      surface.inert = false;
      surface.removeAttribute(managedAttribute);
    }
  }
}

function closeNavigationOnEscape(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const closeButton = document.querySelector('.navbar-sidebar--show .navbar-sidebar__close');
  if (!closeButton) return;
  event.preventDefault();
  closeButton.click();
  requestAnimationFrame(() => document.querySelector('.navbar__toggle')?.focus());
}

function observeNavigationDrawer() {
  if (observer || !document.body) {
    return;
  }

  syncNavigationIsolation();
  document.addEventListener('keydown', closeNavigationOnEscape);
  observer = new MutationObserver(syncNavigationIsolation);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['class'],
    childList: true,
    subtree: true,
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observeNavigationDrawer, {once: true});
  } else {
    observeNavigationDrawer();
  }
}
