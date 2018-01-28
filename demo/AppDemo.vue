<script>
import Btn from "./Button.vue";

const greetings = [
	'Hello there!',
	'Welcome',
	'Hello world!'
];

export default {
  components: {Btn},
	data() {
		return {greetingIndex: 0};
	},
	methods: {
		changeGreeting() {
			this.greetingIndex += 1;
		}
	},
	computed: {
		greeting() {
			return greetings[this.greetingIndex % greetings.length];
		}
	}
};
</script>

<template>
	<div class="app-demo">
		<div class="app-demo__greeting">
			{{greeting}}
		</div>
		<div class="app-demo__actions">
  		<btn @click="changeGreeting">Change greeting</btn>
		</div>
		<div class="app-demo__footer">
			You pressed the button {{greetingIndex}} time{{greetingIndex === 1 ? '' : 's'}}
		</div>
	</div>
</template>

<style type="scss">
.app-demo {
	background: $primary-color;
	display: flex;
	flex-flow: column nowrap;
	align-items: center;
	justify-content: center;
}

.app-demo__greeting {
	font: 200 64px Helvetica;
	color: $text-color;
}
.app-demo__footer {
	color: $text-color;
	font: 100 12px Helvetica;
}
</style>
