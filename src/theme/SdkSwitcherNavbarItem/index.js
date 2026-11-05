import React, {useEffect, useRef, useState} from 'react';
import Link from '@docusaurus/Link';

export default function SdkSwitcherNavbarItem({items, mobile, label = 'SDKs', onClick}) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const trigger = useRef(null);
  useEffect(() => {
    const closeOutside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('focusin', closeOutside);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('focusin', closeOutside);
    };
  }, []);
  const handleKey = event => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
    if (event.key === 'ArrowDown' && event.target === trigger.current) {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => root.current?.querySelector('a')?.focus());
    }
  };
  const content = (
    <div ref={root} className={`dw-sdk-switcher ${mobile ? 'dw-sdk-switcher-mobile' : 'navbar__item'}`} onKeyDown={handleKey}>
      <button ref={trigger} type="button" className={mobile ? 'menu__link' : 'navbar__link'}
        aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}<span aria-hidden="true"> ▾</span>
      </button>
      <ul className="dw-sdk-links" hidden={!open}>
        {items.map(item => <li key={item.label}><Link to={item.href} onClick={onClick}>{item.label}<span aria-hidden="true"> ↗</span></Link></li>)}
      </ul>
    </div>
  );
  return mobile ? <li>{content}</li> : content;
}
