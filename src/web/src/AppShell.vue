<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import ReplayApp from './ReplayApp.vue'
import LiveLab from './LiveLab.vue'
const live = ref(window.location.hash.startsWith('#/lab'))
const update = () => { live.value = window.location.hash.startsWith('#/lab') }
onMounted(() => window.addEventListener('hashchange', update))
onBeforeUnmount(() => window.removeEventListener('hashchange', update))
</script>
<template><LiveLab v-if="live" /><ReplayApp v-else /></template>
