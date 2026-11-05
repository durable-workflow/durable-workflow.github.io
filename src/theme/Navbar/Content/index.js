import React from 'react';
import {useThemeConfig} from '@docusaurus/theme-common';
import {useNavbarMobileSidebar} from '@docusaurus/theme-common/internal';
import NavbarItem from '@theme/NavbarItem';
import NavbarColorModeToggle from '@theme/Navbar/ColorModeToggle';
import NavbarMobileSidebarToggle from '@theme/Navbar/MobileSidebar/Toggle';
import NavbarLogo from '@theme/Navbar/Logo';
import SearchBar from '@theme/SearchBar';
import Translate from '@docusaurus/Translate';

// Keep Docusaurus' native sidebar, version/locale routing and search behavior.
// Only the composition separates product navigation from local docs controls.
export default function NavbarContent() {
  const {navbar: {items}} = useThemeConfig();
  const mobileSidebar = useNavbarMobileSidebar();
  const contextual = item => item.className === 'dw-context-item';
  const global = items.filter(item => !contextual(item));
  return (
    <>
      <div className="navbar__inner dw-global-navigation">
        <div className="navbar__items">
          {!mobileSidebar.disabled && <NavbarMobileSidebarToggle />}
          <NavbarLogo />
          {global.filter(item => item.position !== 'right').map(item => <NavbarItem key={item.type || item.href || item.to} {...item} />)}
        </div>
        <div className="navbar__items navbar__items--right">
          {global.filter(item => item.position === 'right').map(item => <NavbarItem key={item.type || item.href || item.to} {...item} />)}
          <NavbarColorModeToggle />
        </div>
      </div>
      <div className="dw-docs-toolbar">
        <span className="dw-docs-toolbar-label"><Translate id="identity.documentation">Documentation</Translate></span>
        <div className="dw-docs-controls">
          {items.filter(contextual).map(item => <NavbarItem key={item.type || item.href || item.to} {...item} />)}
        </div>
        <div className="dw-docs-search"><SearchBar /></div>
      </div>
    </>
  );
}
