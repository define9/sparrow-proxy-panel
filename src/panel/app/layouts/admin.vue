<script setup lang="ts">
/**
 * 管理端布局。
 *
 * 与用户端共用侧边栏骨架（AppDashboardShell），菜单数据不同：
 * - 用户端：userNav
 * - 管理端：adminNav（按权限过滤）
 */
</script>

<template>
  <AppDashboardShell scope="admin">
    <slot />
  </AppDashboardShell>
</template>
