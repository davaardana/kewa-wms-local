import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

let openPortalsCount = 0;

export default function Portal({ children }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    openPortalsCount++;
    if (openPortalsCount === 1) {
      document.body.style.overflow = 'hidden';
    }

    return () => {
      openPortalsCount = Math.max(0, openPortalsCount - 1);
      if (openPortalsCount === 0) {
        document.body.style.overflow = '';
      }
      setMounted(false);
    };
  }, []);

  if (!mounted || typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
