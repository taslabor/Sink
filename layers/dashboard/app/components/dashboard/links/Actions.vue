<script setup lang="ts">
import type { Link } from '@/types'
import { useClipboard } from '@vueuse/core'
import { Copy, CopyCheck, Eraser, Link as LinkIcon, QrCode, SquareChevronDown, SquarePen } from 'lucide-vue-next'
import { parseURL } from 'ufo'
import { toast } from 'vue-sonner'

// Auto-imported as <DashboardLinksActions :link="link" />.
// The same action set as the link card (copy / open original / QR / edit-delete),
// laid out inline for use in table rows. Edits and deletes flow through the
// dashboard links store, so any table listing this component stays in sync.

const props = defineProps<{
  link: Link
}>()

const { t } = useI18n()
const editPopoverOpen = ref(false)

const requestUrl = useRequestURL()
const origin = requestUrl.origin

function getLinkHost(url: string): string | undefined {
  const { host } = parseURL(url)
  return host
}

const shortLink = computed(() => `${origin}/${props.link.slug}`)
const linkIcon = computed(() => `https://unavatar.webp.se/${getLinkHost(props.link.url)}?fallback=https://sink.cool/icon.png`)

const { copy, copied } = useClipboard({ copiedDuring: 400 })

function copyLink() {
  copy(shortLink.value)
  toast(t('links.copy_success'))
}
</script>

<template>
  <div class="flex items-center gap-2.5" @click.stop>
    <!-- Copy short link -->
    <Button
      v-if="copied"
      variant="ghost"
      size="icon"
      class="h-auto w-auto p-0"
      aria-label="Link copied"
      @click.prevent
    >
      <CopyCheck class="h-4 w-4 shrink-0" />
    </Button>
    <Button
      v-else
      variant="ghost"
      size="icon"
      class="h-auto w-auto p-0"
      aria-label="Copy link"
      @click.prevent="copyLink"
    >
      <Copy class="h-4 w-4 shrink-0" />
    </Button>

    <!-- Open original destination -->
    <a
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open original link"
      class="inline-flex"
    >
      <LinkIcon class="h-4 w-4" />
    </a>

    <!-- QR code -->
    <Popover>
      <PopoverTrigger aria-label="Show QR code" class="inline-flex">
        <QrCode class="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent>
        <DashboardLinksQRCode
          :data="shortLink"
          :image="linkIcon"
        />
      </PopoverContent>
    </Popover>

    <!-- Edit / delete menu -->
    <Popover v-model:open="editPopoverOpen">
      <PopoverTrigger aria-label="More actions" class="inline-flex">
        <SquareChevronDown class="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent
        class="w-auto p-0"
        :hide-when-detached="false"
      >
        <DashboardLinksEditor :link="link">
          <div
            class="
              flex cursor-pointer items-center rounded-sm px-2 py-1.5
              text-sm outline-hidden select-none
              hover:bg-accent hover:text-accent-foreground
            "
          >
            <SquarePen aria-hidden="true" class="mr-2 h-5 w-5" />
            {{ $t('common.edit') }}
          </div>
        </DashboardLinksEditor>

        <Separator />

        <DashboardLinksDelete :link="link">
          <div
            class="
              flex cursor-pointer items-center rounded-sm px-2 py-1.5
              text-sm outline-hidden select-none
              hover:bg-accent hover:text-accent-foreground
            "
          >
            <Eraser aria-hidden="true" class="mr-2 h-5 w-5" />
            {{ $t('common.delete') }}
          </div>
        </DashboardLinksDelete>
      </PopoverContent>
    </Popover>
  </div>
</template>
