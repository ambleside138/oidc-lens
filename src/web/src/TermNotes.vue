<script setup lang="ts">
import { computed } from 'vue'
import { glossary, references } from './learning'
const props = defineProps<{ ids: string[] }>()
const terms = computed(() => props.ids.flatMap(id => glossary.find(term => term.id === id) ?? []))
</script>

<template>
  <div class="term-notes">
    <details v-for="term in terms" :key="term.id">
      <summary>{{ term.label }}</summary>
      <p>{{ term.meaning }}</p>
      <p><strong>なぜ必要か：</strong>{{ term.why }}</p>
      <p class="support-text">このデモでは：{{ term.here }}</p>
      <a :href="references[term.source].url" target="_blank" rel="noopener noreferrer">{{ references[term.source].title }}（別タブで開く）</a>
    </details>
  </div>
</template>
