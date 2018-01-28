const Button = require('./Button.vue').default;
const Vue = require('vue');
const {expect} = require('chai');

describe('<Button>', function () {
  let vm;

  beforeEach(function () {
    vm = new Vue(Button);
    vm.$mount();
  });

  it('emits a click event', function () {
    let called = false;
    vm.$on('clicked', called = true);
    vm.onClick();
    expect(called).to.be.true;
  });
});
