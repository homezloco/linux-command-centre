<script lang="ts">
  import HomePanel from '../home/HomePanel.svelte'

  let { visible = true }: { visible?: boolean } = $props()
</script>

<HomePanel {visible} />
