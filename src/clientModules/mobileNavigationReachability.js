const managedAttribute = 'data-dw-navigation-drawer-inert';
let observer;

function syncNavigationIsolation() {
  const drawerOpen = Boolean(document.querySelector('.navbar-sidebar--show .navbar-sidebar'));
  const backgroundSurfaces = document.querySelectorAll(
    '.navbar__inner, main, footer, ' +
    '#durable-workflow-analytics-consent, #durable-workflow-analytics-preferences',
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

function observeNavigationDrawer() {
  if (observer || !document.body) {
    return;
  }

  syncNavigationIsolation();
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
