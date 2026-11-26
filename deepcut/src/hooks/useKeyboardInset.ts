import { useEffect, useState } from 'react';

/**
 * True while an on-screen keyboard covers part of the page (visual viewport much shorter than the window).
 * Also exposes the visible height as --vvh so mobile layouts can fit above the keyboard.
 */
export function useKeyboardInset(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      setOpen(window.innerHeight - vv.height > 120);
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      document.documentElement.style.removeProperty('--vvh');
    };
  }, []);
  return open;
}
