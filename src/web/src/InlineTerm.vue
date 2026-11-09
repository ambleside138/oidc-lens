<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { briefMeaning, glossary } from './learning'

const props = defineProps<{ id: string; label?: string }>()
const term = computed(() => glossary.find(item => item.id === props.id))
const shortNames: Record<string, string> = { redirect: 'ページの移動', authentication: '認証', code: '認可コード', id_token: 'IDトークン', access_token: 'アクセストークン', cookie: 'Cookie', resource: 'API', signature: '署名による確認' }
const heading = computed(() => props.label ?? shortNames[props.id] ?? term.value?.label ?? props.id)
const element = ref<HTMLDetailsElement>()
function dismiss(event: Event) {
  if (event instanceof KeyboardEvent && event.key === 'Escape' && element.value?.open) {
    event.stopPropagation()
    element.value.open = false
    element.value.querySelector('summary')?.focus()
  } else if (event.type === 'pointerdown' && !element.value?.contains(event.target as Node)) {
    if (element.value) element.value.open = false
  }
}
onMounted(() => { document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismiss) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismiss) })
</script>

<template>
  <details ref="element" class="inline-term">
    <summary>{{ heading }}</summary>
    <div class="inline-term-definition"><p>{{ briefMeaning(id, label) }}</p><a :href="`#learn/glossary/${id}`">用語辞典で詳しく読む →</a></div>
  </details>
</template>
