<template>
  <button class="button" @click="onClick"><slot></slot></button>
</template>

<script>
export default {
  props: ['text'],
  methods: {
    onClick(e) {
			this.$emit("click");
    }
  }
};
</script>

<style type="scss">
.button {
	border: 0;
	padding: 1em 2em;
	font: inherit;
	margin: 1em 0;
	cursor: pointer;
}
</style>
