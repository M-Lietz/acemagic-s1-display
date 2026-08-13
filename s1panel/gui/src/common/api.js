/*!
 * AceMagic S1 Display - Gallery client
 * Based on s1panel by Tomasz Jaworski
 * Copyright (c) 2024-2025 Tomasz Jaworski
 * Modifications Copyright (c) 2026 Merlin Lietz and contributors
 * SPDX-License-Identifier: GPL-3.0-only
 */

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`Der Displaydienst antwortet mit HTTP ${response.status}.`);
  }

  return response.json();
}

export function fetchDesigns() {
  return request('/api/designs');
}

export async function fetchHealth() {
  const response = await fetch('/healthz', { headers: { Accept: 'application/json' } });
  const health = await response.json();
  return { ...health, healthy: response.ok };
}

export function fetchAbout() {
  return request('/api/about');
}

export function activateDesign(id) {
  return request('/api/designs/activate', {
    method: 'POST',
    body: JSON.stringify({ id }),
  });
}
