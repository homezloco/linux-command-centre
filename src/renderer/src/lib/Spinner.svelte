<script lang="ts">
  let { height = 'h-40' }: { height?: string } = $props()
</script>

<div class="flex items-center justify-center {height}">
  <div class="w-5 h-5 rounded-full border-2 border-border border-t-primary animate-spin"></div>
</div>
