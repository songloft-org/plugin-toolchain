<template>
  <div class="app-container">
    <h1>{{ pluginName }}</h1>
    <p>Welcome to your new Vue 3 plugin for Songloft.</p>
    <button @click="count++">Count: {{ count }}</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const pluginName = ref('{{name}}')
const count = ref(0)
</script>

<style>
.app-container {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  padding: 20px;
  text-align: center;
}
button {
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #ccc;
  background: #f0f0f0;
  cursor: pointer;
}
button:hover {
  background: #e0e0e0;
}
</style>
