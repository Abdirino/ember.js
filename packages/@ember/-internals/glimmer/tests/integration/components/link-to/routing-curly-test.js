import {
  ApplicationTestCase,
  ModuleBasedTestResolver,
  moduleFor,
  runLoopSettled,
  runTask,
} from 'internal-test-helpers';
import Controller, { inject as injectController } from '@ember/controller';
import { A as emberA, RSVP } from '@ember/-internals/runtime';
import { alias } from '@ember/-internals/metal';
import { subscribe, reset } from '@ember/instrumentation';
import { Route, NoneLocation } from '@ember/-internals/routing';
import { EMBER_IMPROVED_INSTRUMENTATION } from '@ember/canary-features';
import Engine from '@ember/engine';
import { DEBUG } from '@glimmer/env';
import { compile } from '../../../utils/helpers';

// IE includes the host name
function normalizeUrl(url) {
  return url.replace(/https?:\/\/[^/]+/, '');
}

function shouldNotBeActive(assert, element) {
  checkActive(assert, element, false);
}

function shouldBeActive(assert, element) {
  checkActive(assert, element, true);
}

function checkActive(assert, element, active) {
  let classList = element.attr('class');
  assert.equal(classList.indexOf('active') > -1, active, `${element} active should be ${active}`);
}

moduleFor(
  '{{link-to}} component (routing tests)',
  class extends ApplicationTestCase {
    constructor() {
      super();

      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link'}}About{{/link-to}}
        {{#link-to 'index' id='self-link'}}Self{{/link-to}}
        `
      );
      this.addTemplate(
        'about',
        `
        <h3 class="about">About</h3>
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        {{#link-to 'about' id='self-link'}}Self{{/link-to}}
        `
      );
    }

    ['@test The {{link-to}} component navigates into the named route'](assert) {
      return this.visit('/')
        .then(() => {
          assert.equal(this.$('h3.home').length, 1, 'The home template was rendered');
          assert.equal(
            this.$('#self-link.active').length,
            1,
            'The self-link was rendered with active class'
          );
          assert.equal(
            this.$('#about-link:not(.active)').length,
            1,
            'The other link was rendered without active class'
          );

          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.$('h3.about').length, 1, 'The about template was rendered');
          assert.equal(
            this.$('#self-link.active').length,
            1,
            'The self-link was rendered with active class'
          );
          assert.equal(
            this.$('#home-link:not(.active)').length,
            1,
            'The other link was rendered without active class'
          );
        });
    }

    [`@test the {{link-to}} component doesn't add an href when the tagName isn't 'a'`](assert) {
      this.addTemplate(
        'index',
        `{{#link-to 'about' id='about-link' tagName='div'}}About{{/link-to}}`
      );

      return this.visit('/').then(() => {
        assert.equal(this.$('#about-link').attr('href'), undefined, 'there is no href attribute');
      });
    }

    [`@test the {{link-to}} component applies a 'disabled' class when disabled`](assert) {
      this.addTemplate(
        'index',
        `
        {{#link-to "about" id="about-link-static" disabledWhen="shouldDisable"}}About{{/link-to}}
        {{#link-to "about" id="about-link-dynamic" disabledWhen=this.dynamicDisabledWhen}}About{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          shouldDisable: true,
          dynamicDisabledWhen: 'shouldDisable',
        })
      );

      return this.visit('/').then(() => {
        assert.equal(
          this.$('#about-link-static.disabled').length,
          1,
          'The static link is disabled when its disabledWhen is true'
        );
        assert.equal(
          this.$('#about-link-dynamic.disabled').length,
          1,
          'The dynamic link is disabled when its disabledWhen is true'
        );

        let controller = this.applicationInstance.lookup('controller:index');
        runTask(() => controller.set('dynamicDisabledWhen', false));

        assert.equal(
          this.$('#about-link-dynamic.disabled').length,
          0,
          'The dynamic link is re-enabled when its disabledWhen becomes false'
        );
      });
    }

    [`@test the {{link-to}} component doesn't apply a 'disabled' class if disabledWhen is not provided`](
      assert
    ) {
      this.addTemplate('index', `{{#link-to "about" id="about-link"}}About{{/link-to}}`);

      return this.visit('/').then(() => {
        assert.ok(
          !this.$('#about-link').hasClass('disabled'),
          'The link is not disabled if disabledWhen not provided'
        );
      });
    }

    [`@test the {{link-to}} component supports a custom disabledClass`](assert) {
      this.addTemplate(
        'index',
        `{{#link-to "about" id="about-link" disabledWhen=true disabledClass="do-not-want"}}About{{/link-to}}`
      );

      return this.visit('/').then(() => {
        assert.equal(
          this.$('#about-link.do-not-want').length,
          1,
          'The link can apply a custom disabled class'
        );
      });
    }

    [`@test the {{link-to}} component supports a custom disabledClass set via bound param`](
      assert
    ) {
      this.addTemplate(
        'index',
        `{{#link-to "about" id="about-link" disabledWhen=true disabledClass=this.disabledClass}}About{{/link-to}}`
      );

      this.add(
        'controller:index',
        Controller.extend({
          disabledClass: 'do-not-want',
        })
      );

      return this.visit('/').then(() => {
        assert.equal(
          this.$('#about-link.do-not-want').length,
          1,
          'The link can apply a custom disabled class via bound param'
        );
      });
    }

    [`@test the {{link-to}} component does not respond to clicks when disabledWhen`](assert) {
      this.addTemplate(
        'index',
        `{{#link-to "about" id="about-link" disabledWhen=true}}About{{/link-to}}`
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.$('h3.about').length, 0, 'Transitioning did not occur');
        });
    }

    [`@test the {{link-to}} component does not respond to clicks when disabled`](assert) {
      this.addTemplate(
        'index',
        `{{#link-to "about" id="about-link" disabled=true}}About{{/link-to}}`
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.$('h3.about').length, 0, 'Transitioning did not occur');
        });
    }

    [`@test the {{link-to}} component responds to clicks according to its disabledWhen bound param`](
      assert
    ) {
      this.addTemplate(
        'index',
        `{{#link-to "about" id="about-link" disabledWhen=this.disabledWhen}}About{{/link-to}}`
      );

      this.add(
        'controller:index',
        Controller.extend({
          disabledWhen: true,
        })
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.$('h3.about').length, 0, 'Transitioning did not occur');

          let controller = this.applicationInstance.lookup('controller:index');
          controller.set('disabledWhen', false);

          return runLoopSettled();
        })
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(
            this.$('h3.about').length,
            1,
            'Transitioning did occur when disabledWhen became false'
          );
        });
    }

    [`@test The {{link-to}} component supports a custom activeClass`](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link'}}About{{/link-to}}
        {{#link-to 'index' id='self-link' activeClass='zomg-active'}}Self{{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        assert.equal(this.$('h3.home').length, 1, 'The home template was rendered');
        assert.equal(
          this.$('#self-link.zomg-active').length,
          1,
          'The self-link was rendered with active class'
        );
        assert.equal(
          this.$('#about-link:not(.active)').length,
          1,
          'The other link was rendered without active class'
        );
      });
    }

    [`@test The {{link-to}} component supports a custom activeClass from a bound param`](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link'}}About{{/link-to}}
        {{#link-to 'index' id='self-link' activeClass=this.activeClass}}Self{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          activeClass: 'zomg-active',
        })
      );

      return this.visit('/').then(() => {
        assert.equal(this.$('h3.home').length, 1, 'The home template was rendered');
        assert.equal(
          this.$('#self-link.zomg-active').length,
          1,
          'The self-link was rendered with active class'
        );
        assert.equal(
          this.$('#about-link:not(.active)').length,
          1,
          'The other link was rendered without active class'
        );
      });
    }

    [`@test The {{link-to}} component supports 'classNameBindings' with custom values [GH #11699]`](
      assert
    ) {
      expectDeprecation(
        "Passing the `classNameBindings` property as an argument within templates has been deprecated. Instead, you can pass the class argument and use concatenation to produce the class value dynamically. ('my-app/templates/index.hbs' @ L3:C8) "
      );

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link' classNameBindings='this.foo:foo-is-true:foo-is-false'}}About{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          foo: false,
        })
      );

      return this.visit('/').then(() => {
        assert.equal(
          this.$('#about-link.foo-is-false').length,
          1,
          'The about-link was rendered with the falsy class'
        );

        let controller = this.applicationInstance.lookup('controller:index');
        runTask(() => controller.set('foo', true));

        assert.equal(
          this.$('#about-link.foo-is-true').length,
          1,
          'The about-link was rendered with the truthy class after toggling the property'
        );
      });
    }

    async ['@test Using {{link-to}} inside a non-routable engine errors'](assert) {
      this.add(
        'engine:not-routable',
        class NotRoutableEngine extends Engine {
          Resolver = ModuleBasedTestResolver;

          init() {
            super.init(...arguments);
            this.register(
              'template:application',
              compile(`{{#link-to 'about'}}About{{/link-to}}`, {
                moduleName: 'non-routable/templates/application.hbs',
              })
            );
          }
        }
      );

      this.addTemplate('index', `{{mount "not-routable"}}`);

      await assert.rejectsAssertion(
        this.visit('/'),
        'You attempted to use the <LinkTo> component within a routeless engine, this is not supported. ' +
          'If you are using the ember-engines addon, use the <LinkToExternal> component instead. ' +
          'See https://ember-engines.com/docs/links for more info.'
      );
    }

    async ['@test Using {{link-to}} inside a routable engine link within the engine'](assert) {
      this.add(
        'engine:routable',
        class RoutableEngine extends Engine {
          Resolver = ModuleBasedTestResolver;

          init() {
            super.init(...arguments);
            this.register(
              'template:application',
              compile(
                `
                <h2 id='engine-layout'>Routable Engine</h2>
                {{outlet}}
                {{#link-to 'application' id='engine-application-link'}}Engine Appliction{{/link-to}}
                `,
                {
                  moduleName: 'routable/templates/application.hbs',
                }
              )
            );
            this.register(
              'template:index',
              compile(
                `
                <h3 class='engine-home'>Engine Home</h3>
                {{#link-to 'about' id='engine-about-link'}}Engine About{{/link-to}}
                {{#link-to 'index' id='engine-self-link'}}Engine Self{{/link-to}}
                `,
                {
                  moduleName: 'routable/templates/index.hbs',
                }
              )
            );
            this.register(
              'template:about',
              compile(
                `
                <h3 class='engine-about'>Engine About</h3>
                {{#link-to 'index' id='engine-home-link'}}Engine Home{{/link-to}}
                {{#link-to 'about' id='engine-self-link'}}Engine Self{{/link-to}}
                `,
                {
                  moduleName: 'routable/templates/about.hbs',
                }
              )
            );
          }
        }
      );

      this.router.map(function () {
        this.mount('routable');
      });

      this.add('route-map:routable', function () {
        this.route('about');
      });

      this.addTemplate(
        'application',
        `
        <h1 id="application-layout">Application</h1>
        {{outlet}}
        {{#link-to 'application' id='application-link'}}Appliction{{/link-to}}
        {{#link-to 'routable' id='engine-link'}}Engine{{/link-to}}
        `
      );

      await this.visit('/');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.strictEqual(this.$('#engine-layout').length, 0, 'The engine layout was not rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link:not(.active)').length, 1, 'The engine link is not active');

      assert.equal(this.$('h3.home').length, 1, 'The application index page is rendered');
      assert.equal(this.$('#self-link.active').length, 1, 'The application index link is active');
      assert.equal(
        this.$('#about-link:not(.active)').length,
        1,
        'The application about link is not active'
      );

      await this.click('#about-link');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.strictEqual(this.$('#engine-layout').length, 0, 'The engine layout was not rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link:not(.active)').length, 1, 'The engine link is not active');

      assert.equal(this.$('h3.about').length, 1, 'The application about page is rendered');
      assert.equal(this.$('#self-link.active').length, 1, 'The application about link is active');
      assert.equal(
        this.$('#home-link:not(.active)').length,
        1,
        'The application home link is not active'
      );

      await this.click('#engine-link');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.equal(this.$('#engine-layout').length, 1, 'The engine layout was rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link.active').length, 1, 'The engine link is active');
      assert.equal(
        this.$('#engine-application-link.active').length,
        1,
        'The engine application link is active'
      );

      assert.equal(this.$('h3.engine-home').length, 1, 'The engine index page is rendered');
      assert.equal(this.$('#engine-self-link.active').length, 1, 'The engine index link is active');
      assert.equal(
        this.$('#engine-about-link:not(.active)').length,
        1,
        'The engine about link is not active'
      );

      await this.click('#engine-about-link');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.equal(this.$('#engine-layout').length, 1, 'The engine layout was rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link.active').length, 1, 'The engine link is active');
      assert.equal(
        this.$('#engine-application-link.active').length,
        1,
        'The engine application link is active'
      );

      assert.equal(this.$('h3.engine-about').length, 1, 'The engine about page is rendered');
      assert.equal(this.$('#engine-self-link.active').length, 1, 'The engine about link is active');
      assert.equal(
        this.$('#engine-home-link:not(.active)').length,
        1,
        'The engine home link is not active'
      );

      await this.click('#engine-application-link');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.equal(this.$('#engine-layout').length, 1, 'The engine layout was rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link.active').length, 1, 'The engine link is active');
      assert.equal(
        this.$('#engine-application-link.active').length,
        1,
        'The engine application link is active'
      );

      assert.equal(this.$('h3.engine-home').length, 1, 'The engine index page is rendered');
      assert.equal(this.$('#engine-self-link.active').length, 1, 'The engine index link is active');
      assert.equal(
        this.$('#engine-about-link:not(.active)').length,
        1,
        'The engine about link is not active'
      );

      await this.click('#application-link');

      assert.equal(this.$('#application-layout').length, 1, 'The application layout was rendered');
      assert.strictEqual(this.$('#engine-layout').length, 0, 'The engine layout was not rendered');
      assert.equal(this.$('#application-link.active').length, 1, 'The application link is active');
      assert.equal(this.$('#engine-link:not(.active)').length, 1, 'The engine link is not active');

      assert.equal(this.$('h3.home').length, 1, 'The application index page is rendered');
      assert.equal(this.$('#self-link.active').length, 1, 'The application index link is active');
      assert.equal(
        this.$('#about-link:not(.active)').length,
        1,
        'The application about link is not active'
      );
    }
  }
);

moduleFor(
  '{{link-to}} component (routing tests - location hooks)',
  class extends ApplicationTestCase {
    constructor() {
      super();

      this.updateCount = 0;
      this.replaceCount = 0;

      let testContext = this;
      this.add(
        'location:none',
        NoneLocation.extend({
          setURL() {
            testContext.updateCount++;
            return this._super(...arguments);
          },
          replaceURL() {
            testContext.replaceCount++;
            return this._super(...arguments);
          },
        })
      );

      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link'}}About{{/link-to}}
        {{#link-to 'index' id='self-link'}}Self{{/link-to}}
        `
      );
      this.addTemplate(
        'about',
        `
        <h3 class="about">About</h3>
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        {{#link-to 'about' id='self-link'}}Self{{/link-to}}
        `
      );
    }

    visit() {
      return super.visit(...arguments).then(() => {
        this.updateCountAfterVisit = this.updateCount;
        this.replaceCountAfterVisit = this.replaceCount;
      });
    }

    ['@test The {{link-to}} component supports URL replacement'](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link' replace=true}}About{{/link-to}}
        `
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.updateCount, this.updateCountAfterVisit, 'setURL should not be called');
          assert.equal(
            this.replaceCount,
            this.replaceCountAfterVisit + 1,
            'replaceURL should be called once'
          );
        });
    }

    ['@test The {{link-to}} component supports URL replacement via replace=boundTruthyThing'](
      assert
    ) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link' replace=this.boundTruthyThing}}About{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          boundTruthyThing: true,
        })
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.updateCount, this.updateCountAfterVisit, 'setURL should not be called');
          assert.equal(
            this.replaceCount,
            this.replaceCountAfterVisit + 1,
            'replaceURL should be called once'
          );
        });
    }

    ['@test The {{link-to}} component supports setting replace=this.boundFalseyThing'](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link' replace=this.boundFalseyThing}}About{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          boundFalseyThing: false,
        })
      );

      return this.visit('/')
        .then(() => {
          return this.click('#about-link');
        })
        .then(() => {
          assert.equal(this.updateCount, this.updateCountAfterVisit + 1, 'setURL should be called');
          assert.equal(
            this.replaceCount,
            this.replaceCountAfterVisit,
            'replaceURL should not be called'
          );
        });
    }
  }
);

if (EMBER_IMPROVED_INSTRUMENTATION) {
  moduleFor(
    'The {{link-to}} component with EMBER_IMPROVED_INSTRUMENTATION',
    class extends ApplicationTestCase {
      constructor() {
        super();

        this.router.map(function () {
          this.route('about');
        });

        this.addTemplate(
          'index',
          `
          <h3 class="home">Home</h3>
          {{#link-to 'about' id='about-link'}}About{{/link-to}}
          {{#link-to 'index' id='self-link'}}Self{{/link-to}}
          `
        );
        this.addTemplate(
          'about',
          `
          <h3 class="about">About</h3>
          {{#link-to 'index' id='home-link'}}Home{{/link-to}}
          {{#link-to 'about' id='self-link'}}Self{{/link-to}}
          `
        );
      }

      beforeEach() {
        return this.visit('/');
      }

      afterEach() {
        reset();

        return super.afterEach();
      }

      ['@test The {{link-to}} component fires an interaction event'](assert) {
        assert.expect(2);

        subscribe('interaction.link-to', {
          before() {
            assert.ok(true, 'instrumentation subscriber was called');
          },
          after() {
            assert.ok(true, 'instrumentation subscriber was called');
          },
        });

        return this.click('#about-link');
      }

      ['@test The {{link-to}} component interaction event includes the route name'](assert) {
        assert.expect(2);

        subscribe('interaction.link-to', {
          before(name, timestamp, { routeName }) {
            assert.equal(routeName, 'about', 'instrumentation subscriber was passed route name');
          },
          after(name, timestamp, { routeName }) {
            assert.equal(routeName, 'about', 'instrumentation subscriber was passed route name');
          },
        });

        return this.click('#about-link');
      }

      ['@test The {{link-to}} component interaction event includes the transition in the after hook'](
        assert
      ) {
        assert.expect(1);

        subscribe('interaction.link-to', {
          before() {},
          after(name, timestamp, { transition }) {
            assert.equal(
              transition.targetName,
              'about',
              'instrumentation subscriber was passed route name'
            );
          },
        });

        return this.click('#about-link');
      }
    }
  );
}

moduleFor(
  'The {{link-to}} component - nested routes and link-to arguments',
  class extends ApplicationTestCase {
    ['@test The {{link-to}} component supports leaving off .index for nested routes'](assert) {
      this.router.map(function () {
        this.route('about', function () {
          this.route('item');
        });
      });

      this.addTemplate('about', `<h1>About</h1>{{outlet}}`);
      this.addTemplate('about.index', `<div id='index'>Index</div>`);
      this.addTemplate('about.item', `<div id='item'>{{#link-to 'about'}}About{{/link-to}}</div>`);

      return this.visit('/about/item').then(() => {
        assert.equal(normalizeUrl(this.$('#item a').attr('href')), '/about');
      });
    }

    [`@test The {{link-to}} component supports custom, nested, current-when`](assert) {
      this.router.map(function () {
        this.route('index', { path: '/' }, function () {
          this.route('about');
        });

        this.route('item');
      });

      this.addTemplate('index', `<h3 class="home">Home</h3>{{outlet}}`);
      this.addTemplate(
        'index.about',
        `{{#link-to 'item' id='other-link' current-when='index'}}ITEM{{/link-to}}`
      );

      return this.visit('/about').then(() => {
        assert.equal(
          this.$('#other-link.active').length,
          1,
          'The link is active since current-when is a parent route'
        );
      });
    }

    [`@test The {{link-to}} component does not disregard current-when when it is given explicitly for a route`](
      assert
    ) {
      this.router.map(function () {
        this.route('index', { path: '/' }, function () {
          this.route('about');
        });

        this.route('items', function () {
          this.route('item');
        });
      });

      this.addTemplate('index', `<h3 class="home">Home</h3>{{outlet}}`);
      this.addTemplate(
        'index.about',
        `{{#link-to 'items' id='other-link' current-when='index'}}ITEM{{/link-to}}`
      );

      return this.visit('/about').then(() => {
        assert.equal(
          this.$('#other-link.active').length,
          1,
          'The link is active when current-when is given for explicitly for a route'
        );
      });
    }

    ['@test The {{link-to}} component does not disregard current-when when it is set via a bound param'](
      assert
    ) {
      this.router.map(function () {
        this.route('index', { path: '/' }, function () {
          this.route('about');
        });

        this.route('items', function () {
          this.route('item');
        });
      });

      this.add(
        'controller:index.about',
        Controller.extend({
          currentWhen: 'index',
        })
      );

      this.addTemplate('index', `<h3 class="home">Home</h3>{{outlet}}`);
      this.addTemplate(
        'index.about',
        `{{#link-to 'items' id='other-link' current-when=this.currentWhen}}ITEM{{/link-to}}`
      );

      return this.visit('/about').then(() => {
        assert.equal(
          this.$('#other-link.active').length,
          1,
          'The link is active when current-when is given for explicitly for a route'
        );
      });
    }

    ['@test The {{link-to}} component supports multiple current-when routes'](assert) {
      this.router.map(function () {
        this.route('index', { path: '/' }, function () {
          this.route('about');
        });
        this.route('item');
        this.route('foo');
      });

      this.addTemplate('index', `<h3 class="home">Home</h3>{{outlet}}`);
      this.addTemplate(
        'index.about',
        `{{#link-to 'item' id='link1' current-when='item index'}}ITEM{{/link-to}}`
      );
      this.addTemplate(
        'item',
        `{{#link-to 'item' id='link2' current-when='item index'}}ITEM{{/link-to}}`
      );
      this.addTemplate(
        'foo',
        `{{#link-to 'item' id='link3' current-when='item index'}}ITEM{{/link-to}}`
      );

      return this.visit('/about')
        .then(() => {
          assert.equal(
            this.$('#link1.active').length,
            1,
            'The link is active since current-when contains the parent route'
          );

          return this.visit('/item');
        })
        .then(() => {
          assert.equal(
            this.$('#link2.active').length,
            1,
            'The link is active since you are on the active route'
          );

          return this.visit('/foo');
        })
        .then(() => {
          assert.equal(
            this.$('#link3.active').length,
            0,
            'The link is not active since current-when does not contain the active route'
          );
        });
    }

    ['@test The {{link-to}} component supports boolean values for current-when'](assert) {
      this.router.map(function () {
        this.route('index', { path: '/' }, function () {
          this.route('about');
        });
        this.route('item');
      });

      this.addTemplate(
        'index.about',
        `
        {{#link-to 'index' id='index-link' current-when=this.isCurrent}}index{{/link-to}}
        {{#link-to 'item' id='about-link' current-when=true}}ITEM{{/link-to}}
        `
      );

      this.add('controller:index.about', Controller.extend({ isCurrent: false }));

      return this.visit('/about').then(() => {
        assert.ok(
          this.$('#about-link').hasClass('active'),
          'The link is active since current-when is true'
        );
        assert.notOk(
          this.$('#index-link').hasClass('active'),
          'The link is not active since current-when is false'
        );

        let controller = this.applicationInstance.lookup('controller:index.about');
        runTask(() => controller.set('isCurrent', true));

        assert.ok(
          this.$('#index-link').hasClass('active'),
          'The link is active since current-when is true'
        );
      });
    }

    ['@test The {{link-to}} component defaults to bubbling'](assert) {
      this.addTemplate(
        'about',
        `
        <div {{action 'hide'}}>
          {{#link-to 'about.contact' id='about-contact'}}About{{/link-to}}
        </div>
        {{outlet}}
        `
      );

      this.addTemplate('about.contact', `<h1 id='contact'>Contact</h1>`);

      this.router.map(function () {
        this.route('about', function () {
          this.route('contact');
        });
      });

      let hidden = 0;

      this.add(
        'route:about',
        Route.extend({
          actions: {
            hide() {
              hidden++;
            },
          },
        })
      );

      return this.visit('/about')
        .then(() => {
          return this.click('#about-contact');
        })
        .then(() => {
          assert.equal(this.$('#contact').text(), 'Contact', 'precond - the link worked');

          assert.equal(hidden, 1, 'The link bubbles');
        });
    }

    [`@test The {{link-to}} component supports bubbles=false`](assert) {
      this.addTemplate(
        'about',
        `
        <div {{action 'hide'}}>
          {{#link-to 'about.contact' id='about-contact' bubbles=false}}
            About
          {{/link-to}}
        </div>
        {{outlet}}
        `
      );
      this.addTemplate('about.contact', `<h1 id='contact'>Contact</h1>`);

      this.router.map(function () {
        this.route('about', function () {
          this.route('contact');
        });
      });

      let hidden = 0;

      this.add(
        'route:about',
        Route.extend({
          actions: {
            hide() {
              hidden++;
            },
          },
        })
      );

      return this.visit('/about')
        .then(() => {
          return this.click('#about-contact');
        })
        .then(() => {
          assert.equal(this.$('#contact').text(), 'Contact', 'precond - the link worked');

          assert.equal(hidden, 0, "The link didn't bubble");
        });
    }

    [`@test The {{link-to}} component supports bubbles=boundFalseyThing`](assert) {
      this.addTemplate(
        'about',
        `
        <div {{action 'hide'}}>
          {{#link-to 'about.contact' id='about-contact' bubbles=this.boundFalseyThing}}
            About
          {{/link-to}}
        </div>
        {{outlet}}
        `
      );

      this.addTemplate('about.contact', `<h1 id='contact'>Contact</h1>`);

      this.add(
        'controller:about',
        Controller.extend({
          boundFalseyThing: false,
        })
      );

      this.router.map(function () {
        this.route('about', function () {
          this.route('contact');
        });
      });

      let hidden = 0;

      this.add(
        'route:about',
        Route.extend({
          actions: {
            hide() {
              hidden++;
            },
          },
        })
      );

      return this.visit('/about')
        .then(() => {
          return this.click('#about-contact');
        })
        .then(() => {
          assert.equal(this.$('#contact').text(), 'Contact', 'precond - the link worked');
          assert.equal(hidden, 0, "The link didn't bubble");
        });
    }

    async [`@test The {{link-to}} component moves into the named route with context`](assert) {
      this.router.map(function () {
        this.route('about');
        this.route('item', { path: '/item/:id' });
      });

      this.addTemplate(
        'about',
        `
        <h3 class="list">List</h3>
        <ul>
          {{#each @model as |person|}}
            <li>
              {{#link-to 'item' person id=person.id}}
                {{person.name}}
              {{/link-to}}
            </li>
          {{/each}}
        </ul>
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        `
      );

      this.addTemplate(
        'item',
        `
        <h3 class="item">Item</h3>
        <p>{{@model.name}}</p>
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        `
      );

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'about' id='about-link'}}About{{/link-to}}
        `
      );

      this.add(
        'route:about',
        Route.extend({
          model() {
            return [
              { id: 'yehuda', name: 'Yehuda Katz' },
              { id: 'tom', name: 'Tom Dale' },
              { id: 'erik', name: 'Erik Brynroflsson' },
            ];
          },
        })
      );

      await this.visit('/about');

      assert.equal(this.$('h3.list').length, 1, 'The home template was rendered');
      assert.equal(
        normalizeUrl(this.$('#home-link').attr('href')),
        '/',
        'The home link points back at /'
      );

      await this.click('#yehuda');

      assert.equal(this.$('h3.item').length, 1, 'The item template was rendered');
      assert.equal(this.$('p').text(), 'Yehuda Katz', 'The name is correct');

      await this.click('#home-link');

      await this.click('#about-link');

      assert.equal(normalizeUrl(this.$('li a#yehuda').attr('href')), '/item/yehuda');
      assert.equal(normalizeUrl(this.$('li a#tom').attr('href')), '/item/tom');
      assert.equal(normalizeUrl(this.$('li a#erik').attr('href')), '/item/erik');

      await this.click('#erik');

      assert.equal(this.$('h3.item').length, 1, 'The item template was rendered');
      assert.equal(this.$('p').text(), 'Erik Brynroflsson', 'The name is correct');
    }

    [`@test The {{link-to}} component binds some anchor html tag common attributes`](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'index' id='self-link' title='title-attr' rel='rel-attr' tabindex='-1'}}
          Self
        {{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        let link = this.$('#self-link');
        assert.equal(link.attr('title'), 'title-attr', 'The self-link contains title attribute');
        assert.equal(link.attr('rel'), 'rel-attr', 'The self-link contains rel attribute');
        assert.equal(link.attr('tabindex'), '-1', 'The self-link contains tabindex attribute');
      });
    }

    [`@test The {{link-to}} component supports 'target' attribute`](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'index' id='self-link' target='_blank'}}Self{{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        let link = this.$('#self-link');
        assert.equal(link.attr('target'), '_blank', 'The self-link contains `target` attribute');
      });
    }

    [`@test The {{link-to}} component supports 'target' attribute specified as a bound param`](
      assert
    ) {
      this.addTemplate(
        'index',
        `<h3 class="home">Home</h3>{{#link-to 'index' id='self-link' target=this.boundLinkTarget}}Self{{/link-to}}`
      );

      this.add(
        'controller:index',
        Controller.extend({
          boundLinkTarget: '_blank',
        })
      );

      return this.visit('/').then(() => {
        let link = this.$('#self-link');
        assert.equal(link.attr('target'), '_blank', 'The self-link contains `target` attribute');
      });
    }

    [`@test the {{link-to}} component calls preventDefault`](assert) {
      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate('index', `{{#link-to 'about' id='about-link'}}About{{/link-to}}`);

      return this.visit('/').then(() => {
        assertNav({ prevented: true }, () => this.$('#about-link').click(), assert);
      });
    }

    [`@test the {{link-to}} component does not call preventDefault if 'preventDefault=false' is passed as an option`](
      assert
    ) {
      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `{{#link-to 'about' id='about-link' preventDefault=false}}About{{/link-to}}`
      );

      return this.visit('/').then(() => {
        assertNav({ prevented: false }, () => this.$('#about-link').trigger('click'), assert);
      });
    }

    [`@test the {{link-to}} component does not call preventDefault if 'preventDefault=this.boundFalseyThing' is passed as an option`](
      assert
    ) {
      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `{{#link-to 'about' id='about-link' preventDefault=this.boundFalseyThing}}About{{/link-to}}`
      );

      this.add(
        'controller:index',
        Controller.extend({
          boundFalseyThing: false,
        })
      );

      return this.visit('/').then(() => {
        assertNav({ prevented: false }, () => this.$('#about-link').trigger('click'), assert);
      });
    }

    [`@test The {{link-to}} component does not call preventDefault if 'target' attribute is provided`](
      assert
    ) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'index' id='self-link' target='_blank'}}Self{{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        assertNav({ prevented: false }, () => this.$('#self-link').click(), assert);
      });
    }

    [`@test The {{link-to}} component should preventDefault when 'target = _self'`](assert) {
      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to 'index' id='self-link' target='_self'}}Self{{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        assertNav({ prevented: true }, () => this.$('#self-link').click(), assert);
      });
    }

    [`@test The {{link-to}} component should not transition if target is not equal to _self or empty`](
      assert
    ) {
      this.addTemplate(
        'index',
        `
        {{#link-to 'about' id='about-link' replace=true target='_blank'}}
          About
        {{/link-to}}
        `
      );

      this.router.map(function () {
        this.route('about');
      });

      return this.visit('/')
        .then(() => this.click('#about-link'))
        .then(() => {
          expectDeprecation(() => {
            let currentRouteName = this.applicationInstance
              .lookup('controller:application')
              .get('currentRouteName');
            assert.notEqual(
              currentRouteName,
              'about',
              'link-to should not transition if target is not equal to _self or empty'
            );
          }, 'Accessing `currentRouteName` on `controller:application` is deprecated, use the `currentRouteName` property on `service:router` instead.');
        });
    }

    [`@test The {{link-to}} component accepts string/numeric arguments`](assert) {
      this.router.map(function () {
        this.route('filter', { path: '/filters/:filter' });
        this.route('post', { path: '/post/:post_id' });
        this.route('repo', { path: '/repo/:owner/:name' });
      });

      this.add(
        'controller:filter',
        Controller.extend({
          filter: 'unpopular',
          repo: { owner: 'ember', name: 'ember.js' },
          post_id: 123,
        })
      );

      this.addTemplate(
        'filter',
        `
        <p>{{this.filter}}</p>
        {{#link-to "filter" "unpopular" id="link"}}Unpopular{{/link-to}}
        {{#link-to "filter" this.filter id="path-link"}}Unpopular{{/link-to}}
        {{#link-to "post" this.post_id id="post-path-link"}}Post{{/link-to}}
        {{#link-to "post" 123 id="post-number-link"}}Post{{/link-to}}
        {{#link-to "repo" this.repo id="repo-object-link"}}Repo{{/link-to}}
        `
      );

      return this.visit('/filters/popular').then(() => {
        assert.equal(normalizeUrl(this.$('#link').attr('href')), '/filters/unpopular');
        assert.equal(normalizeUrl(this.$('#path-link').attr('href')), '/filters/unpopular');
        assert.equal(normalizeUrl(this.$('#post-path-link').attr('href')), '/post/123');
        assert.equal(normalizeUrl(this.$('#post-number-link').attr('href')), '/post/123');
        assert.equal(
          normalizeUrl(this.$('#repo-object-link').attr('href')),
          '/repo/ember/ember.js'
        );
      });
    }

    [`@test Issue 4201 - Shorthand for route.index shouldn't throw errors about context arguments`](
      assert
    ) {
      assert.expect(2);
      this.router.map(function () {
        this.route('lobby', function () {
          this.route('index', { path: ':lobby_id' });
          this.route('list');
        });
      });

      this.add(
        'route:lobby.index',
        Route.extend({
          model(params) {
            assert.equal(params.lobby_id, 'foobar');
            return params.lobby_id;
          },
        })
      );

      this.addTemplate(
        'lobby.index',
        `{{#link-to 'lobby' 'foobar' id='lobby-link'}}Lobby{{/link-to}}`
      );

      this.addTemplate(
        'lobby.list',
        `{{#link-to 'lobby' 'foobar' id='lobby-link'}}Lobby{{/link-to}}`
      );

      return this.visit('/lobby/list')
        .then(() => this.click('#lobby-link'))
        .then(() => shouldBeActive(assert, this.$('#lobby-link')));
    }

    [`@test Quoteless route param performs property lookup`](assert) {
      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `
        {{#link-to 'index' id='string-link'}}string{{/link-to}}
        {{#link-to this.foo id='path-link'}}path{{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          foo: 'index',
        })
      );

      let assertEquality = (href) => {
        assert.equal(normalizeUrl(this.$('#string-link').attr('href')), '/');
        assert.equal(normalizeUrl(this.$('#path-link').attr('href')), href);
      };

      return this.visit('/').then(() => {
        assertEquality('/');

        let controller = this.applicationInstance.lookup('controller:index');
        runTask(() => controller.set('foo', 'about'));

        assertEquality('/about');
      });
    }

    [`@test The {{link-to}} component refreshes href element when one of params changes`](assert) {
      this.router.map(function () {
        this.route('post', { path: '/posts/:post_id' });
      });

      let post = { id: '1' };
      let secondPost = { id: '2' };

      this.addTemplate('index', `{{#link-to "post" this.post id="post"}}post{{/link-to}}`);

      this.add('controller:index', Controller.extend());

      return this.visit('/').then(() => {
        let indexController = this.applicationInstance.lookup('controller:index');
        runTask(() => indexController.set('post', post));

        assert.equal(
          normalizeUrl(this.$('#post').attr('href')),
          '/posts/1',
          'precond - Link has rendered href attr properly'
        );

        runTask(() => indexController.set('post', secondPost));

        assert.equal(
          this.$('#post').attr('href'),
          '/posts/2',
          'href attr was updated after one of the params had been changed'
        );

        runTask(() => indexController.set('post', null));

        assert.equal(
          this.$('#post').attr('href'),
          '#',
          'href attr becomes # when one of the arguments in nullified'
        );
      });
    }

    [`@test The {{link-to}} component is active when a route is active`](assert) {
      this.router.map(function () {
        this.route('about', function () {
          this.route('item');
        });
      });

      this.addTemplate(
        'about',
        `
        <div id='about'>
          {{#link-to 'about' id='about-link'}}About{{/link-to}}
          {{#link-to 'about.item' id='item-link'}}Item{{/link-to}}
          {{outlet}}
        </div>
        `
      );

      return this.visit('/about')
        .then(() => {
          assert.equal(this.$('#about-link.active').length, 1, 'The about route link is active');
          assert.equal(this.$('#item-link.active').length, 0, 'The item route link is inactive');

          return this.visit('/about/item');
        })
        .then(() => {
          assert.equal(this.$('#about-link.active').length, 1, 'The about route link is active');
          assert.equal(this.$('#item-link.active').length, 1, 'The item route link is active');
        });
    }

    [`@test The {{link-to}} component works in an #each'd array of string route names`](assert) {
      this.router.map(function () {
        this.route('foo');
        this.route('bar');
        this.route('rar');
      });

      this.add(
        'controller:index',
        Controller.extend({
          routeNames: emberA(['foo', 'bar', 'rar']),
          route1: 'bar',
          route2: 'foo',
        })
      );

      this.addTemplate(
        'index',
        `
        {{#each this.routeNames as |routeName|}}
          {{#link-to routeName}}{{routeName}}{{/link-to}}
        {{/each}}
        {{#each this.routeNames as |r|}}
          {{#link-to r}}{{r}}{{/link-to}}
        {{/each}}
        {{#link-to this.route1}}a{{/link-to}}
        {{#link-to this.route2}}b{{/link-to}}
        `
      );

      let linksEqual = (links, expected) => {
        assert.equal(links.length, expected.length, 'Has correct number of links');

        let idx;
        for (idx = 0; idx < links.length; idx++) {
          let href = this.$(links[idx]).attr('href');
          // Old IE includes the whole hostname as well
          assert.equal(
            href.slice(-expected[idx].length),
            expected[idx],
            `Expected link to be '${expected[idx]}', but was '${href}'`
          );
        }
      };

      return this.visit('/').then(() => {
        linksEqual(this.$('a'), ['/foo', '/bar', '/rar', '/foo', '/bar', '/rar', '/bar', '/foo']);

        let indexController = this.applicationInstance.lookup('controller:index');
        runTask(() => indexController.set('route1', 'rar'));

        linksEqual(this.$('a'), ['/foo', '/bar', '/rar', '/foo', '/bar', '/rar', '/rar', '/foo']);

        runTask(() => indexController.routeNames.shiftObject());

        linksEqual(this.$('a'), ['/bar', '/rar', '/bar', '/rar', '/rar', '/foo']);
      });
    }

    [`@test The non-block form {{link-to}} component moves into the named route`](assert) {
      assert.expect(3);
      this.router.map(function () {
        this.route('contact');
      });

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{link-to 'Contact us' 'contact' id='contact-link'}}
        {{#link-to 'index' id='self-link'}}Self{{/link-to}}
        `
      );
      this.addTemplate(
        'contact',
        `
        <h3 class="contact">Contact</h3>
        {{link-to 'Home' 'index' id='home-link'}}
        {{link-to 'Self' 'contact' id='self-link'}}
        `
      );

      return this.visit('/')
        .then(() => {
          return this.click('#contact-link');
        })
        .then(() => {
          assert.equal(this.$('h3.contact').length, 1, 'The contact template was rendered');
          assert.equal(
            this.$('#self-link.active').length,
            1,
            'The self-link was rendered with active class'
          );
          assert.equal(
            this.$('#home-link:not(.active)').length,
            1,
            'The other link was rendered without active class'
          );
        });
    }

    [`@test The non-block form {{link-to}} component updates the link text when it is a binding`](
      assert
    ) {
      assert.expect(8);
      this.router.map(function () {
        this.route('contact');
      });

      this.add(
        'controller:index',
        Controller.extend({
          contactName: 'Jane',
        })
      );

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{link-to this.contactName 'contact' id='contact-link'}}
        {{#link-to 'index' id='self-link'}}Self{{/link-to}}
        `
      );
      this.addTemplate(
        'contact',
        `
        <h3 class="contact">Contact</h3>
        {{link-to 'Home' 'index' id='home-link'}}
        {{link-to 'Self' 'contact' id='self-link'}}
        `
      );

      return this.visit('/')
        .then(() => {
          assert.equal(
            this.$('#contact-link').text(),
            'Jane',
            'The link title is correctly resolved'
          );

          let controller = this.applicationInstance.lookup('controller:index');
          runTask(() => controller.set('contactName', 'Joe'));

          assert.equal(
            this.$('#contact-link').text(),
            'Joe',
            'The link title is correctly updated when the bound property changes'
          );

          runTask(() => controller.set('contactName', 'Robert'));

          assert.equal(
            this.$('#contact-link').text(),
            'Robert',
            'The link title is correctly updated when the bound property changes a second time'
          );

          return this.click('#contact-link');
        })
        .then(() => {
          assert.equal(this.$('h3.contact').length, 1, 'The contact template was rendered');
          assert.equal(
            this.$('#self-link.active').length,
            1,
            'The self-link was rendered with active class'
          );
          assert.equal(
            this.$('#home-link:not(.active)').length,
            1,
            'The other link was rendered without active class'
          );

          return this.click('#home-link');
        })
        .then(() => {
          assert.equal(this.$('h3.home').length, 1, 'The index template was rendered');
          assert.equal(
            this.$('#contact-link').text(),
            'Robert',
            'The link title is correctly updated when the route changes'
          );
        });
    }

    async [`@test The non-block form {{link-to}} component moves into the named route with context`](
      assert
    ) {
      assert.expect(5);

      this.router.map(function () {
        this.route('item', { path: '/item/:id' });
      });

      this.add(
        'route:index',
        Route.extend({
          model() {
            return [
              { id: 'yehuda', name: 'Yehuda Katz' },
              { id: 'tom', name: 'Tom Dale' },
              { id: 'erik', name: 'Erik Brynroflsson' },
            ];
          },
        })
      );

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        <ul>
          {{#each @model as |person|}}
            <li>
              {{link-to person.name 'item' person id=person.id}}
            </li>
          {{/each}}
        </ul>
        `
      );
      this.addTemplate(
        'item',
        `
        <h3 class="item">Item</h3>
        <p>{{@model.name}}</p>
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        `
      );

      await this.visit('/');

      await this.click('#yehuda');

      assert.equal(this.$('h3.item').length, 1, 'The item template was rendered');
      assert.equal(this.$('p').text(), 'Yehuda Katz', 'The name is correct');

      await this.click('#home-link');

      assert.equal(normalizeUrl(this.$('li a#yehuda').attr('href')), '/item/yehuda');
      assert.equal(normalizeUrl(this.$('li a#tom').attr('href')), '/item/tom');
      assert.equal(normalizeUrl(this.$('li a#erik').attr('href')), '/item/erik');
    }

    [`@test The non-block form {{link-to}} performs property lookup`](assert) {
      this.router.map(function () {
        this.route('about');
      });

      this.addTemplate(
        'index',
        `
        {{link-to 'string' 'index' id='string-link'}}
        {{link-to this.path this.foo id='path-link'}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          foo: 'index',
        })
      );

      return this.visit('/').then(() => {
        let assertEquality = (href) => {
          assert.equal(normalizeUrl(this.$('#string-link').attr('href')), '/');
          assert.equal(normalizeUrl(this.$('#path-link').attr('href')), href);
        };

        assertEquality('/');

        let controller = this.applicationInstance.lookup('controller:index');
        runTask(() => controller.set('foo', 'about'));

        assertEquality('/about');
      });
    }

    [`@test The non-block form {{link-to}} protects against XSS`](assert) {
      this.addTemplate('application', `{{link-to this.display 'index' id='link'}}`);

      this.add(
        'controller:application',
        Controller.extend({
          display: 'blahzorz',
        })
      );

      return this.visit('/').then(() => {
        assert.equal(this.$('#link').text(), 'blahzorz');

        let controller = this.applicationInstance.lookup('controller:application');
        runTask(() => controller.set('display', '<b>BLAMMO</b>'));

        assert.equal(this.$('#link').text(), '<b>BLAMMO</b>');
        assert.equal(this.$('b').length, 0);
      });
    }

    async [`@test the {{link-to}} component throws a useful error if you invoke it wrong`](assert) {
      if (!DEBUG) {
        assert.expect(0);
        return;
      }

      this.router.map(function () {
        this.route('post', { path: 'post/:post_id' });
      });

      this.addTemplate('application', `{{#link-to 'post'}}Post{{/link-to}}`);

      return assert.rejectsAssertion(
        this.visit('/'),
        /(You attempted to define a `\{\{link-to "post"\}\}` but did not pass the parameters required for generating its dynamic segments.|You must provide param `post_id` to `generate`)/
      );
    }

    [`@test the {{link-to}} component does not throw an error if its route has exited`](assert) {
      assert.expect(0);

      this.router.map(function () {
        this.route('post', { path: 'post/:post_id' });
      });

      this.addTemplate(
        'application',
        `
        {{#link-to 'index' id='home-link'}}Home{{/link-to}}
        {{#link-to 'post' this.defaultPost id='default-post-link'}}Default Post{{/link-to}}
        {{#if this.currentPost}}
          {{#link-to 'post' this.currentPost id='current-post-link'}}Current Post{{/link-to}}
        {{/if}}
        `
      );

      this.add(
        'controller:application',
        Controller.extend({
          defaultPost: { id: 1 },
          postController: injectController('post'),
          currentPost: alias('postController.model'),
        })
      );

      this.add('controller:post', Controller.extend());

      this.add(
        'route:post',
        Route.extend({
          model() {
            return { id: 2 };
          },
          serialize(model) {
            return { post_id: model.id };
          },
        })
      );

      return this.visit('/')
        .then(() => this.click('#default-post-link'))
        .then(() => this.click('#home-link'))
        .then(() => this.click('#current-post-link'))
        .then(() => this.click('#home-link'));
    }

    [`@test {{link-to}} active property respects changing parent route context`](assert) {
      this.router.map(function () {
        this.route('things', { path: '/things/:name' }, function () {
          this.route('other');
        });
      });

      this.addTemplate(
        'application',
        `
        {{link-to 'OMG' 'things' 'omg' id='omg-link'}}
        {{link-to 'LOL' 'things' 'lol' id='lol-link'}}
        `
      );

      return this.visit('/things/omg')
        .then(() => {
          shouldBeActive(assert, this.$('#omg-link'));
          shouldNotBeActive(assert, this.$('#lol-link'));

          return this.visit('/things/omg/other');
        })
        .then(() => {
          shouldBeActive(assert, this.$('#omg-link'));
          shouldNotBeActive(assert, this.$('#lol-link'));
        });
    }

    [`@test {{link-to}} populates href with default query param values even without query-params object`](
      assert
    ) {
      this.add(
        'controller:index',
        Controller.extend({
          queryParams: ['foo'],
          foo: '123',
        })
      );

      this.addTemplate('index', `{{#link-to 'index' id='the-link'}}Index{{/link-to}}`);

      return this.visit('/').then(() => {
        assert.equal(this.$('#the-link').attr('href'), '/', 'link has right href');
      });
    }

    [`@test {{link-to}} populates href with default query param values with empty query-params object`](
      assert
    ) {
      this.add(
        'controller:index',
        Controller.extend({
          queryParams: ['foo'],
          foo: '123',
        })
      );

      this.addTemplate(
        'index',
        `{{#link-to 'index' (query-params) id='the-link'}}Index{{/link-to}}`
      );

      return this.visit('/').then(() => {
        assert.equal(this.$('#the-link').attr('href'), '/', 'link has right href');
      });
    }

    [`@test {{link-to}} with only query-params and a block updates when route changes`](assert) {
      this.router.map(function () {
        this.route('about');
      });

      this.add(
        'controller:application',
        Controller.extend({
          queryParams: ['foo', 'bar'],
          foo: '123',
          bar: 'yes',
        })
      );

      this.addTemplate(
        'application',
        `{{#link-to (query-params foo='456' bar='NAW') id='the-link'}}Index{{/link-to}}`
      );

      return this.visit('/')
        .then(() => {
          assert.equal(
            this.$('#the-link').attr('href'),
            '/?bar=NAW&foo=456',
            'link has right href'
          );

          return this.visit('/about');
        })
        .then(() => {
          assert.equal(
            this.$('#the-link').attr('href'),
            '/about?bar=NAW&foo=456',
            'link has right href'
          );
        });
    }

    [`@test Block-less {{link-to}} with only query-params updates when route changes`](assert) {
      this.router.map(function () {
        this.route('about');
      });

      this.add(
        'controller:application',
        Controller.extend({
          queryParams: ['foo', 'bar'],
          foo: '123',
          bar: 'yes',
        })
      );

      this.addTemplate(
        'application',
        `{{link-to "Index" (query-params foo='456' bar='NAW') id='the-link'}}`
      );

      return this.visit('/')
        .then(() => {
          assert.equal(
            this.$('#the-link').attr('href'),
            '/?bar=NAW&foo=456',
            'link has right href'
          );

          return this.visit('/about');
        })
        .then(() => {
          assert.equal(
            this.$('#the-link').attr('href'),
            '/about?bar=NAW&foo=456',
            'link has right href'
          );
        });
    }

    ['@test [GH#17018] passing model to link-to with `hash` helper works']() {
      this.router.map(function () {
        this.route('post', { path: '/posts/:post_id' });
      });

      this.add(
        'route:index',
        Route.extend({
          model() {
            return RSVP.hash({
              user: { name: 'Papa Smurf' },
            });
          },
        })
      );

      this.addTemplate('index', `{{link-to 'Post' 'post' (hash id="someId" user=@model.user)}}`);
      this.addTemplate('post', 'Post: {{@model.user.name}}');

      return this.visit('/')
        .then(() => {
          this.assertComponentElement(this.firstChild, {
            tagName: 'a',
            attrs: { href: '/posts/someId' },
            content: 'Post',
          });

          return this.click('a');
        })
        .then(() => {
          this.assertText('Post: Papa Smurf');
        });
    }

    [`@test The {{link-to}} component can use dynamic params`](assert) {
      this.router.map(function () {
        this.route('foo', { path: 'foo/:some/:thing' });
        this.route('bar', { path: 'bar/:some/:thing/:else' });
      });

      this.add(
        'controller:index',
        Controller.extend({
          init() {
            this._super(...arguments);
            this.dynamicLinkParams = ['foo', 'one', 'two'];
          },
        })
      );

      this.addTemplate(
        'index',
        `
        <h3 class="home">Home</h3>
        {{#link-to params=this.dynamicLinkParams id="dynamic-link"}}Dynamic{{/link-to}}
        `
      );

      return this.visit('/').then(() => {
        let link = this.$('#dynamic-link');

        assert.equal(link.attr('href'), '/foo/one/two');

        let controller = this.applicationInstance.lookup('controller:index');
        runTask(() => {
          controller.set('dynamicLinkParams', ['bar', 'one', 'two', 'three']);
        });

        assert.equal(link.attr('href'), '/bar/one/two/three');
      });
    }

    [`@test GJ: {{link-to}} to a parent root model hook which performs a 'transitionTo' has correct active class #13256`](
      assert
    ) {
      assert.expect(3);

      this.router.map(function () {
        this.route('parent', function () {
          this.route('child');
        });
      });

      this.add(
        'route:parent',
        Route.extend({
          afterModel() {
            expectDeprecation(() => {
              this.transitionTo('parent.child');
            }, /Calling transitionTo on a route is deprecated/);
          },
        })
      );

      this.addTemplate('application', `{{link-to 'Parent' 'parent' id='parent-link'}}`);

      return this.visit('/')
        .then(() => {
          return this.click('#parent-link');
        })
        .then(() => {
          shouldBeActive(assert, this.$('#parent-link'));
        });
    }
  }
);

moduleFor(
  'The {{link-to}} component - loading states and warnings',
  class extends ApplicationTestCase {
    [`@test {{link-to}} with null/undefined dynamic parameters are put in a loading state`](
      assert
    ) {
      assert.expect(19);
      let warningMessage =
        'This link is in an inactive loading state because at least one of its models currently has a null/undefined value, or the provided route name is invalid.';

      this.router.map(function () {
        this.route('thing', { path: '/thing/:thing_id' });
        this.route('about');
      });

      this.addTemplate(
        'index',
        `
        {{#link-to this.destinationRoute this.routeContext loadingClass='i-am-loading' id='context-link'}}
          string
        {{/link-to}}
        {{#link-to this.secondRoute loadingClass=this.loadingClass id='static-link'}}
          string
        {{/link-to}}
        `
      );

      this.add(
        'controller:index',
        Controller.extend({
          destinationRoute: null,
          routeContext: null,
          loadingClass: 'i-am-loading',
        })
      );

      this.add(
        'route:about',
        Route.extend({
          activate() {
            assert.ok(true, 'About was entered');
          },
        })
      );

      function assertLinkStatus(link, url) {
        if (url) {
          assert.equal(normalizeUrl(link.attr('href')), url, 'loaded link-to has expected href');
          assert.ok(!link.hasClass('i-am-loading'), 'loaded linkComponent has no loadingClass');
        } else {
          assert.equal(normalizeUrl(link.attr('href')), '#', "unloaded link-to has href='#'");
          assert.ok(link.hasClass('i-am-loading'), 'loading linkComponent has loadingClass');
        }
      }

      let contextLink, staticLink, controller;

      return this.visit('/')
        .then(() => {
          contextLink = this.$('#context-link');
          staticLink = this.$('#static-link');
          controller = this.applicationInstance.lookup('controller:index');

          assertLinkStatus(contextLink);
          assertLinkStatus(staticLink);

          return expectWarning(() => {
            return this.click(contextLink[0]);
          }, warningMessage);
        })
        .then(() => {
          // Set the destinationRoute (context is still null).
          runTask(() => controller.set('destinationRoute', 'thing'));
          assertLinkStatus(contextLink);

          // Set the routeContext to an id
          runTask(() => controller.set('routeContext', '456'));
          assertLinkStatus(contextLink, '/thing/456');

          // Test that 0 isn't interpreted as falsy.
          runTask(() => controller.set('routeContext', 0));
          assertLinkStatus(contextLink, '/thing/0');

          // Set the routeContext to an object
          runTask(() => {
            controller.set('routeContext', { id: 123 });
          });
          assertLinkStatus(contextLink, '/thing/123');

          // Set the destinationRoute back to null.
          runTask(() => controller.set('destinationRoute', null));
          assertLinkStatus(contextLink);

          return expectWarning(() => {
            return this.click(staticLink[0]);
          }, warningMessage);
        })
        .then(() => {
          runTask(() => controller.set('secondRoute', 'about'));
          assertLinkStatus(staticLink, '/about');

          // Click the now-active link
          return this.click(staticLink[0]);
        });
    }
  }
);

function assertNav(options, callback, assert) {
  let nav = false;

  function check(event) {
    assert.equal(
      event.defaultPrevented,
      options.prevented,
      `expected defaultPrevented=${options.prevented}`
    );
    nav = true;
    event.preventDefault();
  }

  try {
    document.addEventListener('click', check);
    callback();
  } finally {
    document.removeEventListener('click', check);
    assert.ok(nav, 'Expected a link to be clicked');
  }
}
