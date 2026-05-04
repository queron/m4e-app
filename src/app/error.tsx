"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Application route error.", { digest: error.digest, error });
  }, [error]);

  return (
    <main className="shell">
      <section className="emptyState recoveryState" role="alert">
        <h1>Something went wrong</h1>
        <p>The app hit an unexpected error while loading this crew plan.</p>
        <div className="recoveryActions">
          <button className="primary" type="button" onClick={reset}>
            Try again
          </button>
          <button className="subtleButton" type="button" onClick={() => window.location.reload()}>
            Reload app
          </button>
        </div>
      </section>
    </main>
  );
}
