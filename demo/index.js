import AppDemo from "./AppDemo.vue";
import Vue from "vue";

new Vue({
  el: "#app",
  components: {AppDemo},
  render(createElement) {
    return createElement("app-demo");
  }
}).$mount();
