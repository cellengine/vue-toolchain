# vue-toolchain

This is a small suite of tools for bundling and testing a Vue project.

Its main motivation was to require Vue files in node for testing - no DOM required:

```javascript
const Button = require('./Button.vue').default;
const Vue = require('vue');

const vm = new Vue(Button);
vm.text = 'Click Me!';
vm.$mount();

expect(vm._vnode.children[0].text).toBe('Click me!')

vm.onMousemove();
expect(vm._vnode.data.style.background).toBe('blue')
```

# Features

* Require `.vue` files in node for testing by simply doing `require('vue-toolchain/register')`
* Load `.vue` files in Webpack by adding `vue-toolchain/loader` to your Webpack config. There is only one loader that uses Babel instead of the 3 loader approach used by the upstream `vue-loader`, so you'll end up with a smaller build output.
* [TODO] integrate styles into your Gulp pipeline
