<!--
  AceMagic S1 Display - Design Gallery
  Based on s1panel by Tomasz Jaworski
  Copyright (c) 2024-2025 Tomasz Jaworski
  Modifications Copyright (c) 2026 Merlin Lietz and contributors
  SPDX-License-Identifier: GPL-3.0-only
-->
<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { activateDesign, fetchAbout, fetchDesigns, fetchHealth } from './common/api';

const designs = ref([]);
const filter = ref('all');
const selectedId = ref(null);
const loading = ref(true);
const activatingId = ref(null);
const message = ref(null);
const health = ref({ healthy: false, status: 'loading' });
const about = ref(null);
const aboutOpen = ref(false);
let healthTimer = null;

const filters = computed(() => [
  { id: 'all', label: 'Alle', count: designs.value.length },
  { id: 'available', label: 'Verfügbar', count: designs.value.filter((design) => design.available).length },
  { id: 'concept', label: 'Konzepte', count: designs.value.filter((design) => !design.available).length },
].filter((item) => item.id !== 'concept' || item.count > 0));

const visibleDesigns = computed(() => {
  if (filter.value === 'available') {
    return designs.value.filter((design) => design.available);
  }

  if (filter.value === 'concept') {
    return designs.value.filter((design) => !design.available);
  }

  return designs.value;
});

const activeDesign = computed(() => designs.value.find((design) => design.active));

function setMessage(kind, title, detail) {
  message.value = { kind, title, detail };
}

async function loadDesigns() {
  loading.value = true;

  try {
    const response = await fetchDesigns();
    designs.value = response.designs;
    selectedId.value = response.designs.find((design) => design.active)?.id ?? null;
  } catch (error) {
    setMessage('error', 'Gallery nicht erreichbar', error.message);
  } finally {
    loading.value = false;
  }
}

async function loadHealth() {
  try {
    health.value = await fetchHealth();
  } catch {
    health.value = { healthy: false, status: 'offline' };
  }
}

async function loadAbout() {
  try {
    about.value = await fetchAbout();
  } catch {
    about.value = null;
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') aboutOpen.value = false;
}

async function selectDesign(design) {
  selectedId.value = design.id;

  if (!design.available) {
    setMessage(
      'info',
      `${design.name} ist vorgemerkt`,
      'Die Vorschau ist ausgewählt. Live aktivieren lässt sich das Design, sobald sein nativer Renderer fertig und geprüft ist.',
    );
    return;
  }

  if (design.active) {
    setMessage('success', `${design.name} ist bereits aktiv`, 'Das Display verwendet dieses Design aktuell.');
    return;
  }

  activatingId.value = design.id;

  try {
    const response = await activateDesign(design.id);

    if (response.status === 'unavailable') {
      setMessage('info', `${design.name} ist noch nicht verfügbar`, response.message);
      return;
    }

    if (response.status === 'restart_required') {
      setMessage('info', `${design.name} wurde gespeichert`, response.message);
    } else {
      setMessage('success', `${design.name} ist aktiv`, response.message ?? 'Das vollständige Bild wurde auf das Display übertragen.');
    }
    await loadDesigns();
  } catch (error) {
    setMessage('error', 'Aktivierung fehlgeschlagen', error.message);
  } finally {
    activatingId.value = null;
  }
}

onMounted(() => {
  healthTimer = window.setInterval(loadHealth, 10000);
  window.addEventListener('keydown', handleKeydown);
  return Promise.all([loadDesigns(), loadHealth(), loadAbout()]);
});

onBeforeUnmount(() => {
  window.clearInterval(healthTimer);
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="AceMagic S1 Design Gallery">
        <span class="brand-mark">A</span>
        <span class="brand-copy">
          <strong>ACEMAGIC S1</strong>
          <small>Display Control</small>
        </span>
      </a>

      <div class="system-state" :class="{ offline: !health.healthy }" :aria-label="`Displaystatus ${health.healthy ? 'online' : 'offline'}`">
        <span class="state-dot"></span>
        <span>
          <small>DISPLAY</small>
          <strong>{{ health.healthy ? 'ONLINE' : 'OFFLINE' }}</strong>
        </span>
      </div>
    </header>

    <main>
      <section class="intro" aria-labelledby="gallery-title">
        <div>
          <p class="eyebrow">DESIGN GALLERY</p>
          <h1 id="gallery-title">Wähle deinen Look.</h1>
          <p class="intro-copy">
            Alle 13 Ansichten werden nativ für das AceMagic S1 gerendert.
            Ein Klick übernimmt das ausgewählte Design kontrolliert auf dem Display.
          </p>
        </div>

        <div class="active-summary" v-if="activeDesign">
          <span class="summary-label">AKTIVES DESIGN</span>
          <strong>{{ activeDesign.name }}</strong>
          <span class="summary-meta">170 × 320 · LIVE</span>
        </div>
      </section>

      <nav class="filterbar" aria-label="Designs filtern">
        <button
          v-for="item in filters"
          :key="item.id"
          class="filter-button"
          :class="{ active: filter === item.id }"
          type="button"
          @click="filter = item.id"
        >
          {{ item.label }} <span>{{ item.count }}</span>
        </button>
      </nav>

      <div
        v-if="message"
        class="notice"
        :class="`notice-${message.kind}`"
        role="status"
      >
        <div>
          <strong>{{ message.title }}</strong>
          <span>{{ message.detail }}</span>
        </div>
        <button type="button" aria-label="Hinweis schließen" @click="message = null">×</button>
      </div>

      <section v-if="loading" class="loading-grid" aria-label="Designs werden geladen">
        <div v-for="item in 8" :key="item" class="skeleton-card"></div>
      </section>

      <section v-else class="design-grid" aria-label="Verfügbare Displaydesigns">
        <button
          v-for="design in visibleDesigns"
          :key="design.id"
          class="design-card"
          :class="{
            active: design.active,
            selected: selectedId === design.id,
            unavailable: !design.available,
          }"
          type="button"
          :disabled="activatingId !== null"
          :aria-pressed="selectedId === design.id"
          @click="selectDesign(design)"
        >
          <span class="preview-wrap">
            <img :src="design.preview_url" :alt="`${design.name} Displayvorschau`" loading="lazy">
            <span v-if="design.active" class="active-badge"><i></i> AKTIV</span>
            <span v-else-if="!design.available" class="concept-badge">KONZEPT</span>
            <span v-if="activatingId === design.id" class="activation-layer">WIRD AKTIVIERT</span>
          </span>

          <span class="card-copy">
            <span class="design-number">{{ String(design.number).padStart(2, '0') }}</span>
            <strong>{{ design.name }}</strong>
            <span>{{ design.description }}</span>
          </span>

          <span class="card-action">
            <span v-if="design.active">Aktuell auf dem Display</span>
            <span v-else-if="design.available">Mit einem Klick aktivieren</span>
            <span v-else>Vorschau ansehen</span>
            <b aria-hidden="true">→</b>
          </span>
        </button>
      </section>
    </main>

    <footer>
      <span>ACEMAGIC S1 · DISPLAY GALLERY</span>
      <button type="button" class="about-button" @click="aboutOpen = true">Über dieses Projekt · Credits</button>
    </footer>

    <div v-if="aboutOpen" class="modal-backdrop" role="presentation" @click.self="aboutOpen = false">
      <section class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <button class="modal-close" type="button" aria-label="Dialog schließen" @click="aboutOpen = false">×</button>
        <p class="eyebrow">OPEN SOURCE</p>
        <h2 id="about-title">Über dieses Projekt</h2>
        <p>
          AceMagic S1 Display ist eine deutlich veränderte Weiterentwicklung des
          GPL-3.0-Projekts <strong>s1panel</strong> von Tomasz Jaworski.
        </p>
        <dl v-if="about">
          <div><dt>Version</dt><dd>{{ about.version }} · {{ about.revision }}</dd></div>
          <div><dt>Lizenz</dt><dd>{{ about.license }}</dd></div>
        </dl>
        <div class="about-links">
          <a v-if="about" :href="about.source_url" target="_blank" rel="noreferrer">Quellcode dieser Version</a>
          <a v-if="about" :href="about.upstream_url" target="_blank" rel="noreferrer">Originalprojekt von Tomasz Jaworski</a>
          <a v-if="about" :href="about.license_url" target="_blank" rel="noreferrer">GNU GPL v3</a>
        </div>
        <p class="about-note">Inoffizielles Community-Projekt. Keine Verbindung zu ACEMAGIC.</p>
      </section>
    </div>
  </div>
</template>
