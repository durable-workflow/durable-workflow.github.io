function collectReachabilityGeometry(options = {}) {
  const viewport = {
    left: 0,
    top: 0,
    right: document.documentElement.clientWidth,
    bottom: document.documentElement.clientHeight,
  };
  const round = value => Math.round(value * 100) / 100;
  const hasArea = rect => rect.right > rect.left && rect.bottom > rect.top;
  const intersect = (first, second) => ({
    left: Math.max(first.left, second.left),
    top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom),
  });
  const describeRect = rect => ({
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height),
  });
  const visible = element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();

    if (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      Number.parseFloat(style.opacity) <= 0
    ) {
      return false;
    }
    if (box.width <= 0 || box.height <= 0 || element.getClientRects().length === 0) {
      return false;
    }
    if (typeof element.checkVisibility === 'function') {
      return element.checkVisibility({checkOpacity: true, checkVisibilityCSS: true});
    }

    return true;
  };
  const visibleFragments = element => {
    let clippingBox = viewport;

    for (
      let ancestor = element.parentElement;
      ancestor &&
      ancestor !== document.body &&
      ancestor !== document.documentElement &&
      hasArea(clippingBox);
      ancestor = ancestor.parentElement
    ) {
      const style = getComputedStyle(ancestor);
      const clipsX = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowX);
      const clipsY = ['auto', 'hidden', 'clip', 'scroll'].includes(style.overflowY);

      if (!clipsX && !clipsY) {
        continue;
      }

      const ancestorBox = ancestor.getBoundingClientRect();
      clippingBox = {
        left: clipsX ? Math.max(clippingBox.left, ancestorBox.left) : clippingBox.left,
        right: clipsX ? Math.min(clippingBox.right, ancestorBox.right) : clippingBox.right,
        top: clipsY ? Math.max(clippingBox.top, ancestorBox.top) : clippingBox.top,
        bottom: clipsY ? Math.min(clippingBox.bottom, ancestorBox.bottom) : clippingBox.bottom,
      };
    }

    return [...element.getClientRects()]
      .map(fragment => intersect(fragment, clippingBox))
      .filter(hasArea);
  };
  const nativeInteractiveSelector = 'input, select, textarea, button, a[href], summary';
  const scopeSelector = options.scopeSelector || null;
  const scopeElement = scopeSelector ? document.querySelector(scopeSelector) : document;
  if (!scopeElement) {
    throw new Error(`Reachability geometry scope not found: ${scopeSelector}`);
  }
  const scopedElements = selector => {
    const descendants = [...scopeElement.querySelectorAll(selector)];
    if (scopeElement instanceof Element && scopeElement.matches(selector)) {
      descendants.unshift(scopeElement);
    }
    return descendants;
  };
  const interactiveRoles = new Set([
    'button',
    'checkbox',
    'combobox',
    'gridcell',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'scrollbar',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'textbox',
    'treeitem',
  ]);
  const interactiveElements = scopedElements(`${nativeInteractiveSelector}, [role]`)
    .filter(element => {
      if (!visible(element)) {
        return false;
      }
      if (element.matches('input[type="hidden"], :disabled, [aria-disabled="true"]')) {
        return false;
      }
      if (element.closest('[aria-disabled="true"], [inert]')) {
        return false;
      }
      if (element.matches(nativeInteractiveSelector)) {
        return true;
      }

      const roles = String(element.getAttribute('role') || '').toLowerCase().split(/\s+/);
      return roles.some(role => interactiveRoles.has(role));
    });
  const isRelatedHit = (hit, control) => {
    if (!hit) {
      return false;
    }
    if (hit === control || control.contains(hit)) {
      return true;
    }

    const labels = [...(control.labels || [])];
    if (labels.some(label => hit === label || label.contains(hit))) {
      return true;
    }

    const hitLabel = hit.closest?.('label');
    return Boolean(hitLabel && hitLabel.control === control);
  };
  const describe = element => ({
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type') || null,
    role: element.getAttribute('role') || null,
    name: element.getAttribute('name') || '',
    id: element.id || '',
    fixture_target: element.hasAttribute('data-visual-reachability-fixture-target'),
  });
  const describeBlocker = element => {
    const style = getComputedStyle(element);

    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || null,
      id: element.id || '',
      position: style.position,
    };
  };
  const sampleFractions = [0.08, 0.29, 0.5, 0.71, 0.92];
  const unreachableControls = interactiveElements.flatMap(control => {
    const controlBox = control.getBoundingClientRect();
    const fragments = visibleFragments(control);

    if (fragments.length === 0) {
      return [];
    }

    const visibleBox = {
      left: Math.min(...fragments.map(fragment => fragment.left)),
      top: Math.min(...fragments.map(fragment => fragment.top)),
      right: Math.max(...fragments.map(fragment => fragment.right)),
      bottom: Math.max(...fragments.map(fragment => fragment.bottom)),
    };
    const points = [];
    const seen = new Set();

    for (const fragment of fragments) {
      const fragmentArea = (fragment.right - fragment.left) * (fragment.bottom - fragment.top);
      const sampleArea = fragmentArea / (sampleFractions.length ** 2);

      for (const yFraction of sampleFractions) {
        for (const xFraction of sampleFractions) {
          const x = Math.min(
            fragment.right - 0.01,
            fragment.left + (fragment.right - fragment.left) * xFraction,
          );
          const y = Math.min(
            fragment.bottom - 0.01,
            fragment.top + (fragment.bottom - fragment.top) * yFraction,
          );
          const key = `${round(x)}:${round(y)}`;

          if (seen.has(key)) {
            continue;
          }

          seen.add(key);
          points.push({
            x,
            y,
            area: sampleArea,
            center: xFraction === 0.5 && yFraction === 0.5,
          });
        }
      }
    }

    let reachablePoints = 0;
    let reachableArea = 0;
    let centerReachable = true;
    const blockerCounts = new Map();

    for (const point of points) {
      const primary = document.elementFromPoint(point.x, point.y);
      const reachable = isRelatedHit(primary, control);

      if (reachable) {
        reachablePoints += 1;
        reachableArea += point.area;
        continue;
      }
      if (point.center) {
        centerReachable = false;
      }

      const blocker = document
        .elementsFromPoint(point.x, point.y)
        .find(element => !isRelatedHit(element, control));
      if (blocker) {
        blockerCounts.set(blocker, (blockerCounts.get(blocker) || 0) + 1);
      }
    }

    const sampledArea = points.reduce((total, point) => total + point.area, 0);
    const reachableAreaRatio = sampledArea ? reachableArea / sampledArea : 0;
    const unblockedFragmentCenterMiss = fragments.length > 1
      && !centerReachable
      && blockerCounts.size === 0;

    if (
      reachableAreaRatio >= 0.5
      && (centerReachable || unblockedFragmentCenterMiss)
    ) {
      return [];
    }

    const blockers = [...blockerCounts.entries()]
      .sort((first, second) => second[1] - first[1])
      .slice(0, 3)
      .map(([element, blockedPoints]) => ({
        ...describeBlocker(element),
        blocked_points: blockedPoints,
      }));

    return [{
      ...describe(control),
      rect: {
        x: round(controlBox.x),
        y: round(controlBox.y),
        width: round(controlBox.width),
        height: round(controlBox.height),
        visible_width: round(visibleBox.right - visibleBox.left),
        visible_height: round(visibleBox.bottom - visibleBox.top),
      },
      tested_points: points.length,
      reachable_points: reachablePoints,
      reachable_area_ratio: round(reachableAreaRatio),
      center_reachable: centerReachable,
      blockers,
    }];
  }).slice(0, 25);

  const navbar = document.querySelector('.navbar');
  const navbarBox = navbar?.getBoundingClientRect();
  const stickyNavigationIntersections = navbarBox
    ? interactiveElements
      .filter(control => !navbar.contains(control))
      .filter(control => {
        const bounds = control.getBoundingClientRect();
        return bounds.right > 0
          && bounds.left < viewport.right
          && bounds.bottom > 0
          && bounds.top < navbarBox.bottom;
      })
      .map(control => ({
        ...describe(control),
        rect: describeRect(control.getBoundingClientRect()),
        navbar_bottom: round(navbarBox.bottom),
      }))
      .slice(0, 25)
    : [];

  const floatingElements = [...document.querySelectorAll('body *')]
    .filter(element => visible(element) && !navbar?.contains(element))
    .filter(element => ['fixed', 'sticky'].includes(getComputedStyle(element).position));
  const overlapCandidates = scopedElements([
    'main td',
    'main th',
    'main a[href]',
    'main button',
    'main summary',
  ].join(',')).filter(visible);
  const overlappingFloatingElements = floatingElements.flatMap(floating => {
    const floatingBox = floating.getBoundingClientRect();
    const overlaps = overlapCandidates
      .filter(candidate => !floating.contains(candidate) && !candidate.contains(floating))
      .flatMap(candidate => visibleFragments(candidate).flatMap(fragment => {
        const overlap = intersect(floatingBox, fragment);
        if (!hasArea(overlap)) return [];

        return [{
          ...describe(candidate),
          overlap_width: round(overlap.right - overlap.left),
          overlap_height: round(overlap.bottom - overlap.top),
        }];
      }))
      .slice(0, 10);

    if (overlaps.length === 0) return [];
    return [{
      ...describeBlocker(floating),
      rect: describeRect(floatingBox),
      overlaps,
    }];
  }).slice(0, 10);

  const isClipped = element => {
    const style = getComputedStyle(element);
    const clipsX = ['clip', 'hidden'].includes(style.overflowX);
    const clipsY = ['clip', 'hidden'].includes(style.overflowY);
    return (clipsX && element.scrollWidth > element.clientWidth + 1)
      || (clipsY && element.scrollHeight > element.clientHeight + 1);
  };
  const clippedControlText = interactiveElements
    .filter(isClipped)
    .map(control => ({
      ...describe(control),
      rect: describeRect(control.getBoundingClientRect()),
    }))
    .slice(0, 25);
  const clippedText = scopedElements([
    'main h1',
    'main h2',
    'main h3',
    'main h4',
    'main p',
    'main li',
    'main th',
    'main td',
    'main code',
  ].join(','))
    .filter(element => visible(element) && isClipped(element))
    .map(element => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || '',
      rect: describeRect(element.getBoundingClientRect()),
    }))
    .slice(0, 25);

  return {
    document_width: document.documentElement.scrollWidth,
    viewport_width: document.documentElement.clientWidth,
    scope_selector: scopeSelector,
    scope_rect: scopeElement instanceof Element
      ? describeRect(scopeElement.getBoundingClientRect())
      : null,
    horizontal_overflow:
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    visible_element_count: scopedElements('*').filter(visible).length,
    interactive_control_count: interactiveElements.length,
    unreachable_controls: unreachableControls,
    sticky_navigation_intersections: stickyNavigationIntersections,
    overlapping_floating_elements: overlappingFloatingElements,
    clipped_control_text: clippedControlText,
    clipped_text: clippedText,
  };
}

module.exports = {collectReachabilityGeometry};
