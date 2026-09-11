"use client";

import { useState, useEffect } from "react";

type Status = "unsupported" | "denied" | "loading" | "off" | "on";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function isIosNonStandalone() {
  if (typeof navigator === "undefined") return false;
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = "standalone" in window.navigator && (window.navigator as { standalone?: boolean }).standalone;
  return isIos && !isStandalone;
}

export default function ChatNotificationsToggle() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const existing = await registration?.pushManager.getSubscription();
        setStatus(existing ? "on" : "off");
      } catch {
        setStatus("off");
      }
    }
    check();
  }, []);

  async function enable() {
    setError(null);
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      setError("Push isn't configured yet.");
      return;
    }
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!res.ok) throw new Error("Could not save subscription.");
      setStatus("on");
    } catch {
      setError("Couldn't turn on notifications. Try again.");
      setStatus("off");
    }
  }

  async function disable() {
    setError(null);
    setStatus("loading");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError("Couldn't turn off notifications.");
      setStatus("on");
    }
  }

  if (status === "unsupported") return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {error && <div className="text-[11px] text-red">{error}</div>}
      {status === "denied" && (
        <div className="text-[11px] text-mist max-w-[220px] text-right">
          Notifications are blocked in your browser settings.
        </div>
      )}
      {status === "loading" && <div className="text-xs text-mist">...</div>}
      {status === "off" && (
        <button
          onClick={enable}
          className="px-3.5 py-1.5 bg-green-mid text-white text-xs font-semibold rounded-lg hover:bg-green-dark transition-colors"
        >
          Enable Notifications
        </button>
      )}
      {status === "on" && (
        <button
          onClick={disable}
          className="px-3.5 py-1.5 border-[1.5px] border-rule text-ink text-xs font-semibold rounded-lg hover:border-red hover:text-red transition-colors"
        >
          Notifications On — Turn Off
        </button>
      )}
      {isIosNonStandalone() && (status === "off" || status === "denied") && (
        <div className="text-[11px] text-mist max-w-[220px] text-right">
          On iPhone, add this site to your Home Screen first (Share → Add to Home Screen) for notifications to work.
        </div>
      )}
    </div>
  );
}
