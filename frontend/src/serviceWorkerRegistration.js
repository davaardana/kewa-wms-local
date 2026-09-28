// MOSA WMS — Service Worker Registration
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.log('[MOSA PWA] Service Worker aktif dengan scope:', registration.scope);
        registration.onupdatefound = () => {
          const newSW = registration.installing;
          if (!newSW) return;
          newSW.onstatechange = () => {
            if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('🔄 MOSA WMS: Versi baru tersedia, memperbarui cache...');
              setTimeout(() => window.location.reload(), 500);
            }
          };
        };
      })
      .catch((error) => {
        console.warn('[MOSA PWA] Registrasi Service Worker gagal:', error);
      });
  }
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    registerServiceWorker();
  } else {
    window.addEventListener('load', registerServiceWorker);
  }
}
