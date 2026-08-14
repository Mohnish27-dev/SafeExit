"use client";

import { getApiBase } from "@/app/lib/api";

// All dashboard consumers in a browser tab share this one EventSource. The
// backend publishes every staff event through /events, while each subscriber
// still listens only for the event names it needs.
let source = null;
let closeTimer = null;
const channels = new Map();

const ensureSource = () => {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
  if (source || typeof window === "undefined" || typeof EventSource === "undefined") return;

  source = new EventSource(`${getApiBase()}/events`, { withCredentials: true });
  channels.forEach(({ dispatch }, eventName) => {
    source.addEventListener(eventName, dispatch);
  });
};

const getChannel = (eventName) => {
  let channel = channels.get(eventName);
  if (channel) return channel;

  const listeners = new Set();
  const dispatch = (event) => {
    [...listeners].forEach((listener) => listener(event));
  };

  channel = { listeners, dispatch };
  channels.set(eventName, channel);
  source?.addEventListener(eventName, dispatch);
  return channel;
};

export const subscribeToStaffEvents = (handlersByEvent) => {
  if (typeof window === "undefined" || typeof EventSource === "undefined") return () => {};

  const subscriptions = Object.entries(handlersByEvent || {})
    .filter(([, handler]) => typeof handler === "function")
    .map(([eventName, handler]) => {
      const channel = getChannel(eventName);
      // A wrapper gives every subscription its own identity even when two
      // components happen to pass the same callback function.
      const listener = (event) => handler(event);
      channel.listeners.add(listener);
      return { eventName, channel, listener };
    });

  if (!subscriptions.length) return () => {};
  ensureSource();

  let active = true;
  return () => {
    if (!active) return;
    active = false;

    subscriptions.forEach(({ eventName, channel, listener }) => {
      channel.listeners.delete(listener);
      if (channel.listeners.size === 0) {
        source?.removeEventListener(eventName, channel.dispatch);
        channels.delete(eventName);
      }
    });

    if (channels.size === 0 && source && !closeTimer) {
      // Delay closure until the next task. This prevents React development
      // Strict Mode's effect cleanup/re-run cycle from opening two overlapping
      // network connections while still closing an actually unused stream.
      closeTimer = setTimeout(() => {
        closeTimer = null;
        if (channels.size === 0 && source) {
          source.close();
          source = null;
        }
      }, 0);
    }
  };
};
