<script setup lang="ts">
import { computed } from 'vue'
import { actors } from './replay'
import { makeSequenceWindow } from './sequence'
import type { Actor, ReplayStep } from './replay'

const props = defineProps<{ steps: ReplayStep[]; selectedIndex: number; actorHosts?: Partial<Record<Actor, string>> }>()
const diagram = computed(() => makeSequenceWindow(props.steps, props.selectedIndex))
const lane = (actor: Actor) => 96 + actors.findIndex(item => item.id === actor) * 236
const number = (index: number) => String(index + 1).padStart(2, '0')
const host = (id: Actor) => props.actorHosts?.[id] ?? actors.find(actor => actor.id === id)!.host
const longHost = (id: Actor) => host(id).length > 24 && /:\d+$/.test(host(id))
const description = computed(() => diagram.value.groups.map(group =>
  `${group.position} ${number(group.index)} ${group.step.title}。` + group.events.map(event =>
    `${actors.find(actor => actor.id === event.log.from)!.name}から${actors.find(actor => actor.id === event.log.to)!.name}へ、${event.log.label}。`,
  ).join(''),
).join(' '))
</script>

<template>
  <figure class="sequence" aria-labelledby="sequence-heading">
    <figcaption><h3 id="sequence-heading">前後の通信</h3><span>表示中の場面を青枠で表示</span></figcaption>
    <div class="sequence-scroll" tabindex="0" role="region" aria-label="前後のシーケンス図。狭い画面では左右にスクロールできます">
      <svg :viewBox="`0 0 900 ${diagram.height}`" role="img" aria-labelledby="sequence-title" aria-describedby="sequence-description">
        <title id="sequence-title">場面{{ number(selectedIndex) }}と前後のシーケンス図</title>
        <desc id="sequence-description">{{ description }}</desc>
        <defs><marker id="sequence-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" /></marker></defs>
        <g v-for="group in diagram.groups" :key="group.step.id" :class="['sequence-group', { current: group.current }]">
          <rect x="8" :y="group.y" width="884" :height="group.height" rx="4" class="sequence-band" />
        </g>
        <g v-for="actor in actors" :key="actor.id" class="sequence-actor">
          <rect :x="lane(actor.id) - 90" y="4" width="180" height="64" rx="4" />
          <text :x="lane(actor.id)" y="26" text-anchor="middle" class="sequence-actor-name">{{ actor.name }}</text>
          <text :x="lane(actor.id)" y="45" text-anchor="middle" class="sequence-host"><template v-if="longHost(actor.id)"><tspan :x="lane(actor.id)" y="43">{{ host(actor.id).replace(/:\d+$/, '') }}</tspan><tspan :x="lane(actor.id)" y="59">{{ host(actor.id).match(/:\d+$/)?.[0] }}</tspan></template><template v-else>{{ host(actor.id) }}</template></text>
          <line :x1="lane(actor.id)" y1="68" :x2="lane(actor.id)" :y2="diagram.height - 8" class="sequence-lifeline" />
        </g>
        <g v-for="group in diagram.groups" :key="`events-${group.step.id}`" :class="['sequence-group', { current: group.current }]">
          <text x="24" :y="group.y + 21" class="sequence-scene-label">{{ group.position }} · {{ number(group.index) }} {{ group.step.phase }}</text>
          <text v-if="!group.events.length" x="450" :y="group.y + 62" text-anchor="middle" class="sequence-message-detail">未記録（実行後に表示します）</text>
          <g v-for="event in group.events" :key="event.logIndex" :class="['sequence-message', event.log.kind]">
            <template v-if="event.log.from !== event.log.to">
              <path :d="`M ${lane(event.log.from)} ${event.y + 24} H ${lane(event.log.to) + (lane(event.log.from) < lane(event.log.to) ? -6 : 6)}`" class="sequence-arrow" marker-end="url(#sequence-arrow)" />
              <text :x="(lane(event.log.from) + lane(event.log.to)) / 2" :y="event.y + 16" text-anchor="middle" class="sequence-message-label">{{ event.label }}</text>
              <text :x="(lane(event.log.from) + lane(event.log.to)) / 2" :y="event.y + 44" text-anchor="middle" class="sequence-message-detail">{{ event.detail }}</text>
            </template>
            <template v-else>
              <path :d="`M ${lane(event.log.from)} ${event.y + 18} h 32 v 16 h -26`" class="sequence-arrow" marker-end="url(#sequence-arrow)" />
              <text :x="lane(event.log.from) + (event.log.from === 'resource' ? -12 : 44)" :y="event.y + 22" :text-anchor="event.log.from === 'resource' ? 'end' : 'start'" class="sequence-message-label">{{ event.label }}</text>
              <text :x="lane(event.log.from) + (event.log.from === 'resource' ? -12 : 44)" :y="event.y + 42" :text-anchor="event.log.from === 'resource' ? 'end' : 'start'" class="sequence-message-detail">{{ event.detail }}</text>
            </template>
          </g>
        </g>
      </svg>
    </div>
    <p class="sequence-note">前後の場面は最後／最初の通信を抜粋しています。表示中の場面は、下のログと同じ順序です。<span>図は左右にスクロールできます。</span></p>
  </figure>
</template>
