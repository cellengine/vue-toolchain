const AppDemo = require('./AppDemo.vue').default;
const Vue = require('vue');
const {expect} = require('chai');

describe('<AppDemo>', function () {
  let vm;

  beforeEach(function () {
    vm = new Vue(AppDemo);
    vm.$mount();
  });

  it('starts with a Hello There greeting', function () {
    expect(vm._vnode.children[0].children[0].text).to.match(/Hello there!/);
  });

  it('should change the greeting on button press', function (done) {
    const greeting1 = vm._vnode.children[0].children[0].text;
    vm.changeGreeting();
    vm.$nextTick(function () {
      expect(vm._vnode.children[0].children[0].text).to.not.equal(greeting1);
      done();
    });
  });

  it('should count the number of greetings', function (done) {
    vm.changeGreeting();
    vm.changeGreeting();
    vm.changeGreeting();
    vm.$nextTick(function () {
      try {
        expect(vm._vnode.children[4].children[0].text).to.match(/You pressed the button 3 times/);
        done();
      } catch (e) {
        done(e);
      }
    });
  });
});
