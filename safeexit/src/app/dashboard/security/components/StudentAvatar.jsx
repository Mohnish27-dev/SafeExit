"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";

// Face photos are base64 data URLs of a few hundred KB each, so the roster ships a
// `hasPhoto` flag instead of the bytes (see getUsers in adminController.js). This fetches
// one row's photo — and only once that row is actually on screen, because a filter that
// matches 300 students would otherwise just trade one huge response for 300 medium ones.

// Module scope, not state: switching the status filter unmounts and remounts every tile,
// and a face already on the wire should not be requested again because of it.
const photoCache = new Map(); // id -> data URL, or null for "asked, there is none"
const inFlight = new Map(); // id -> Promise, so two tiles for one id share one request

const loadPhoto = (id) => {
  if (photoCache.has(id)) return Promise.resolve(photoCache.get(id));
  if (inFlight.has(id)) return inFlight.get(id);

  const request = apiFetch(`/admin/users/${id}/photo`)
    .then((data) => {
      const photo = data?.photo || null;
      photoCache.set(id, photo);
      return photo;
    })
    .catch((err) => {
      // 403/404 are permanent answers — cache them so scrolling past the row again does
      // not re-ask. Anything else (offline, 500, timeout) stays uncached so it can retry.
      if (err?.status === 403 || err?.status === 404) photoCache.set(id, null);
      return null;
    })
    .finally(() => inFlight.delete(id));

  inFlight.set(id, request);
  return request;
};

export default function StudentAvatar({ id, name, hasPhoto, className = "" }) {
  // Seeded from the cache so a remount of an already-loaded face paints immediately
  // instead of flashing initials for a frame.
  const [photo, setPhoto] = useState(() => (id ? photoCache.get(id) ?? null : null));
  const holder = useRef(null);

  useEffect(() => {
    // A warm cache needs nothing: the initial state above already read it. Tiles are keyed
    // by student id, so `id` never changes on a live instance.
    if (!id || !hasPhoto || photoCache.has(id)) return;

    let alive = true;
    const show = (value) => {
      if (alive) setPhoto(value);
    };

    // No observer (jsdom, older browser) → just fetch. Correct, only less frugal.
    if (typeof IntersectionObserver === "undefined") {
      loadPhoto(id).then(show);
      return () => {
        alive = false;
      };
    }

    const el = holder.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        // One shot: stop watching before the request, so a fast scroll back and forth
        // cannot queue a second fetch for the same tile.
        observer.disconnect();
        loadPhoto(id).then(show);
      },
      // Start a little before the tile arrives, so the face is usually there by the time
      // the guard can read the name next to it.
      { rootMargin: "200px" }
    );

    observer.observe(el);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [id, hasPhoto]);

  return (
    <div ref={holder} className={className}>
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt={name || ""} className="h-full w-full object-cover" />
      ) : (
        getInitials(name)
      )}
    </div>
  );
}
