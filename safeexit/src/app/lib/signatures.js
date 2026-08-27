"use client";

// On-demand signature images.
//
// List endpoints return has*Signature booleans, never the bytes — a row can carry three
// ~15KB blobs and those lists are polled every 15-30s. The bytes come from here instead,
// when a card expands or a letter viewer opens.
//
// Stamped signatures are immutable, so a fetched set is cached for the tab's lifetime.
// Caching the promise (not the result) also dedupes concurrent callers.

import { useEffect, useState } from "react";
import { apiFetch } from "./api";

const cache = new Map();

// kind: "outing" | "leave"
export const fetchSignatures = (kind, id) => {
  const key = `${kind}:${id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      apiFetch(`/${kind}/${id}/signatures`).catch((err) => {
        cache.delete(key); // a transient failure shouldn't poison the entry
        throw err;
      })
    );
  }
  return cache.get(key);
};

// React hook. Returns { signatures, loading, error }; `signatures` is
// { studentSignature, caretakerSignature, wardenSignature } once resolved, else null.
// Callers render the surrounding markup off the has*Signature flag and don't wait on this.
export const useSignatures = (kind, id, enabled = true) => {
  const [entry, setEntry] = useState(null);
  const key = enabled && id ? `${kind}:${id}` : null;

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    fetchSignatures(kind, id)
      .then((data) => { if (!cancelled) setEntry({ key, signatures: data, error: null }); })
      .catch((err) => { if (!cancelled) setEntry({ key, signatures: null, error: err }); });
    return () => { cancelled = true; };
  }, [key, kind, id]);

  // Derived rather than reset in the effect: a result only counts for the key that is
  // active now, so moving to another row shows a fresh load instead of the last row's
  // signature. This also keeps setState out of the effect body.
  const fresh = entry && entry.key === key ? entry : null;
  return {
    signatures: fresh ? fresh.signatures : null,
    error: fresh ? fresh.error : null,
    loading: Boolean(key) && !fresh,
  };
};
