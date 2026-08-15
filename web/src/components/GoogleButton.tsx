import { useEffect, useRef, useState } from "react";

interface GoogleAccountsId {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      type?: "standard" | "icon";
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "small" | "medium" | "large";
      text?: "signin_with" | "signup_with" | "continue_with";
      shape?: "rectangular" | "pill";
      width?: number;
      logo_alignment?: "left" | "center";
    },
  ): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleAccountsId } };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Loads Google Identity Services once, no matter how many callers ask. */
function loadGsi(): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise((resolve, reject) => {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("gsi failed to load")));
        });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("gsi failed to load")));
    document.head.appendChild(script);
  });
}

interface Props {
  clientId: string;
  onCredential: (credential: string) => void;
  disabled?: boolean;
}

/**
 * Renders Google's own button rather than a look-alike.
 *
 * Google's branding terms are specific about how the button may look, and their
 * widget also handles the popup, the account chooser and the token refresh.
 * Re-implementing it to save a few pixels of design fidelity is not a trade
 * worth making.
 */
export function GoogleButton({ clientId, onCredential, disabled }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [failed, setFailed] = useState(false);

  // Keep the latest callback without re-initialising the widget on every render.
  callback.current = onCredential;

  useEffect(() => {
    let cancelled = false;

    void loadGsi()
      .then(() => {
        if (cancelled || !host.current || !window.google) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => callback.current(response.credential),
          cancel_on_tap_outside: true,
        });

        window.google.accounts.id.renderButton(host.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "left",
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (failed) {
    return (
      <p className="text-center text-xs text-white/40">
        Google xizmatiga ulanib bo'lmadi. Foydalanuvchi nomi bilan kiring.
      </p>
    );
  }

  return (
    <div
      ref={host}
      aria-busy={disabled}
      className={`flex justify-center transition-opacity ${disabled ? "pointer-events-none opacity-50" : ""}`}
    />
  );
}
