import React, { useEffect, useState } from 'react';
import { Bell, Download, WifiOff } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const PWAControls: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      return;
    }
    setShowIosHelp((v) => !v);
  };

  const handleEnableNotifs = async () => {
    if (typeof Notification === 'undefined') return;
    const perm = await Notification.requestPermission();
    setNotifPerm(perm);
  };

  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  return (
    <div className="flex items-center gap-2 shrink-0">
      {!isOnline && (
        <span
          className="inline-flex items-center gap-1 text-xs font-mono text-amber-700 whitespace-nowrap"
          title="Hálózati kapcsolat megszakadt — offline mód"
        >
          <WifiOff className="h-3.5 w-3.5" />
          Offline
        </span>
      )}

      {notifPerm === 'default' && typeof Notification !== 'undefined' && (
        <button
          type="button"
          onClick={() => void handleEnableNotifs()}
          title="Böngésző értesítések engedélyezése emlékeztetőkhöz"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
        >
          <Bell className="h-3.5 w-3.5" />
          Értesítések
        </button>
      )}

      {!isStandalone && (
        <div className="relative">
          <button
            type="button"
            onClick={() => void handleInstall()}
            title="NovaSwarm telepítése PWA alkalmazásként"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            PWA
          </button>
          {showIosHelp && (
            <div className="absolute right-0 mt-2 w-64 p-3 bg-white border border-slate-200 rounded-lg shadow-lg text-xs text-slate-700 z-40">
              <div className="font-semibold text-slate-900 mb-1">Telepítés eszközhöz (PWA)</div>
              <p>
                Chrome/Edge alatt kattints a címsor jobb oldalán lévő telepítés ikonra, iOS Safariban pedig válaszd a
                Megosztás → Főképernyőhöz adás opciót.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
