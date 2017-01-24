/*!
Waypoints - 4.0.0
Copyright © 2011-2015 Caleb Troughton
Licensed under the MIT license.
https://github.com/imakewebthings/waypoints/blog/master/licenses.txt
*/
(function() {
  'use strict'

  var keyCounter = 0
  var allWaypoints = {}

  /* http://imakewebthings.com/waypoints/api/waypoint */
  function Waypoint(options) {
    if (!options) {
      throw new Error('No options passed to Waypoint constructor')
    }
    if (!options.element) {
      throw new Error('No element option passed to Waypoint constructor')
    }
    if (!options.handler) {
      throw new Error('No handler option passed to Waypoint constructor')
    }

    this.key = 'waypoint-' + keyCounter
    this.options = Waypoint.Adapter.extend({}, Waypoint.defaults, options)
    this.element = this.options.element
    this.adapter = new Waypoint.Adapter(this.element)
    this.callback = options.handler
    this.axis = this.options.horizontal ? 'horizontal' : 'vertical'
    this.enabled = this.options.enabled
    this.triggerPoint = null
    this.group = Waypoint.Group.findOrCreate({
      name: this.options.group,
      axis: this.axis
    })
    this.context = Waypoint.Context.findOrCreateByElement(this.options.context)

    if (Waypoint.offsetAliases[this.options.offset]) {
      this.options.offset = Waypoint.offsetAliases[this.options.offset]
    }
    this.group.add(this)
    this.context.add(this)
    allWaypoints[this.key] = this
    keyCounter += 1
  }

  /* Private */
  Waypoint.prototype.queueTrigger = function(direction) {
    this.group.queueTrigger(this, direction)
  }

  /* Private */
  Waypoint.prototype.trigger = function(args) {
    if (!this.enabled) {
      return
    }
    if (this.callback) {
      this.callback.apply(this, args)
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/destroy */
  Waypoint.prototype.destroy = function() {
    this.context.remove(this)
    this.group.remove(this)
    delete allWaypoints[this.key]
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/disable */
  Waypoint.prototype.disable = function() {
    this.enabled = false
    return this
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/enable */
  Waypoint.prototype.enable = function() {
    this.context.refresh()
    this.enabled = true
    return this
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/next */
  Waypoint.prototype.next = function() {
    return this.group.next(this)
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/previous */
  Waypoint.prototype.previous = function() {
    return this.group.previous(this)
  }

  /* Private */
  Waypoint.invokeAll = function(method) {
    var allWaypointsArray = []
    for (var waypointKey in allWaypoints) {
      allWaypointsArray.push(allWaypoints[waypointKey])
    }
    for (var i = 0, end = allWaypointsArray.length; i < end; i++) {
      allWaypointsArray[i][method]()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/destroy-all */
  Waypoint.destroyAll = function() {
    Waypoint.invokeAll('destroy')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/disable-all */
  Waypoint.disableAll = function() {
    Waypoint.invokeAll('disable')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/enable-all */
  Waypoint.enableAll = function() {
    Waypoint.invokeAll('enable')
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/refresh-all */
  Waypoint.refreshAll = function() {
    Waypoint.Context.refreshAll()
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/viewport-height */
  Waypoint.viewportHeight = function() {
    return window.innerHeight || document.documentElement.clientHeight
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/viewport-width */
  Waypoint.viewportWidth = function() {
    return document.documentElement.clientWidth
  }

  Waypoint.adapters = []

  Waypoint.defaults = {
    context: window,
    continuous: true,
    enabled: true,
    group: 'default',
    horizontal: false,
    offset: 0
  }

  Waypoint.offsetAliases = {
    'bottom-in-view': function() {
      return this.context.innerHeight() - this.adapter.outerHeight()
    },
    'right-in-view': function() {
      return this.context.innerWidth() - this.adapter.outerWidth()
    }
  }

  window.Waypoint = Waypoint
}())
;(function() {
  'use strict'

  function requestAnimationFrameShim(callback) {
    window.setTimeout(callback, 1000 / 60)
  }

  var keyCounter = 0
  var contexts = {}
  var Waypoint = window.Waypoint
  var oldWindowLoad = window.onload

  /* http://imakewebthings.com/waypoints/api/context */
  function Context(element) {
    this.element = element
    this.Adapter = Waypoint.Adapter
    this.adapter = new this.Adapter(element)
    this.key = 'waypoint-context-' + keyCounter
    this.didScroll = false
    this.didResize = false
    this.oldScroll = {
      x: this.adapter.scrollLeft(),
      y: this.adapter.scrollTop()
    }
    this.waypoints = {
      vertical: {},
      horizontal: {}
    }

    element.waypointContextKey = this.key
    contexts[element.waypointContextKey] = this
    keyCounter += 1

    this.createThrottledScrollHandler()
    this.createThrottledResizeHandler()
  }

  /* Private */
  Context.prototype.add = function(waypoint) {
    var axis = waypoint.options.horizontal ? 'horizontal' : 'vertical'
    this.waypoints[axis][waypoint.key] = waypoint
    this.refresh()
  }

  /* Private */
  Context.prototype.checkEmpty = function() {
    var horizontalEmpty = this.Adapter.isEmptyObject(this.waypoints.horizontal)
    var verticalEmpty = this.Adapter.isEmptyObject(this.waypoints.vertical)
    if (horizontalEmpty && verticalEmpty) {
      this.adapter.off('.waypoints')
      delete contexts[this.key]
    }
  }

  /* Private */
  Context.prototype.createThrottledResizeHandler = function() {
    var self = this

    function resizeHandler() {
      self.handleResize()
      self.didResize = false
    }

    this.adapter.on('resize.waypoints', function() {
      if (!self.didResize) {
        self.didResize = true
        Waypoint.requestAnimationFrame(resizeHandler)
      }
    })
  }

  /* Private */
  Context.prototype.createThrottledScrollHandler = function() {
    var self = this
    function scrollHandler() {
      self.handleScroll()
      self.didScroll = false
    }

    this.adapter.on('scroll.waypoints', function() {
      if (!self.didScroll || Waypoint.isTouch) {
        self.didScroll = true
        Waypoint.requestAnimationFrame(scrollHandler)
      }
    })
  }

  /* Private */
  Context.prototype.handleResize = function() {
    Waypoint.Context.refreshAll()
  }

  /* Private */
  Context.prototype.handleScroll = function() {
    var triggeredGroups = {}
    var axes = {
      horizontal: {
        newScroll: this.adapter.scrollLeft(),
        oldScroll: this.oldScroll.x,
        forward: 'right',
        backward: 'left'
      },
      vertical: {
        newScroll: this.adapter.scrollTop(),
        oldScroll: this.oldScroll.y,
        forward: 'down',
        backward: 'up'
      }
    }

    for (var axisKey in axes) {
      var axis = axes[axisKey]
      var isForward = axis.newScroll > axis.oldScroll
      var direction = isForward ? axis.forward : axis.backward

      for (var waypointKey in this.waypoints[axisKey]) {
        var waypoint = this.waypoints[axisKey][waypointKey]
        var wasBeforeTriggerPoint = axis.oldScroll < waypoint.triggerPoint
        var nowAfterTriggerPoint = axis.newScroll >= waypoint.triggerPoint
        var crossedForward = wasBeforeTriggerPoint && nowAfterTriggerPoint
        var crossedBackward = !wasBeforeTriggerPoint && !nowAfterTriggerPoint
        if (crossedForward || crossedBackward) {
          waypoint.queueTrigger(direction)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
      }
    }

    for (var groupKey in triggeredGroups) {
      triggeredGroups[groupKey].flushTriggers()
    }

    this.oldScroll = {
      x: axes.horizontal.newScroll,
      y: axes.vertical.newScroll
    }
  }

  /* Private */
  Context.prototype.innerHeight = function() {
    /*eslint-disable eqeqeq */
    if (this.element == this.element.window) {
      return Waypoint.viewportHeight()
    }
    /*eslint-enable eqeqeq */
    return this.adapter.innerHeight()
  }

  /* Private */
  Context.prototype.remove = function(waypoint) {
    delete this.waypoints[waypoint.axis][waypoint.key]
    this.checkEmpty()
  }

  /* Private */
  Context.prototype.innerWidth = function() {
    /*eslint-disable eqeqeq */
    if (this.element == this.element.window) {
      return Waypoint.viewportWidth()
    }
    /*eslint-enable eqeqeq */
    return this.adapter.innerWidth()
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-destroy */
  Context.prototype.destroy = function() {
    var allWaypoints = []
    for (var axis in this.waypoints) {
      for (var waypointKey in this.waypoints[axis]) {
        allWaypoints.push(this.waypoints[axis][waypointKey])
      }
    }
    for (var i = 0, end = allWaypoints.length; i < end; i++) {
      allWaypoints[i].destroy()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-refresh */
  Context.prototype.refresh = function() {
    /*eslint-disable eqeqeq */
    var isWindow = this.element == this.element.window
    /*eslint-enable eqeqeq */
    var contextOffset = isWindow ? undefined : this.adapter.offset()
    var triggeredGroups = {}
    var axes

    this.handleScroll()
    axes = {
      horizontal: {
        contextOffset: isWindow ? 0 : contextOffset.left,
        contextScroll: isWindow ? 0 : this.oldScroll.x,
        contextDimension: this.innerWidth(),
        oldScroll: this.oldScroll.x,
        forward: 'right',
        backward: 'left',
        offsetProp: 'left'
      },
      vertical: {
        contextOffset: isWindow ? 0 : contextOffset.top,
        contextScroll: isWindow ? 0 : this.oldScroll.y,
        contextDimension: this.innerHeight(),
        oldScroll: this.oldScroll.y,
        forward: 'down',
        backward: 'up',
        offsetProp: 'top'
      }
    }

    for (var axisKey in axes) {
      var axis = axes[axisKey]
      for (var waypointKey in this.waypoints[axisKey]) {
        var waypoint = this.waypoints[axisKey][waypointKey]
        var adjustment = waypoint.options.offset
        var oldTriggerPoint = waypoint.triggerPoint
        var elementOffset = 0
        var freshWaypoint = oldTriggerPoint == null
        var contextModifier, wasBeforeScroll, nowAfterScroll
        var triggeredBackward, triggeredForward

        if (waypoint.element !== waypoint.element.window) {
          elementOffset = waypoint.adapter.offset()[axis.offsetProp]
        }

        if (typeof adjustment === 'function') {
          adjustment = adjustment.apply(waypoint)
        }
        else if (typeof adjustment === 'string') {
          adjustment = parseFloat(adjustment)
          if (waypoint.options.offset.indexOf('%') > - 1) {
            adjustment = Math.ceil(axis.contextDimension * adjustment / 100)
          }
        }

        contextModifier = axis.contextScroll - axis.contextOffset
        waypoint.triggerPoint = elementOffset + contextModifier - adjustment
        wasBeforeScroll = oldTriggerPoint < axis.oldScroll
        nowAfterScroll = waypoint.triggerPoint >= axis.oldScroll
        triggeredBackward = wasBeforeScroll && nowAfterScroll
        triggeredForward = !wasBeforeScroll && !nowAfterScroll

        if (!freshWaypoint && triggeredBackward) {
          waypoint.queueTrigger(axis.backward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
        else if (!freshWaypoint && triggeredForward) {
          waypoint.queueTrigger(axis.forward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
        else if (freshWaypoint && axis.oldScroll >= waypoint.triggerPoint) {
          waypoint.queueTrigger(axis.forward)
          triggeredGroups[waypoint.group.id] = waypoint.group
        }
      }
    }

    Waypoint.requestAnimationFrame(function() {
      for (var groupKey in triggeredGroups) {
        triggeredGroups[groupKey].flushTriggers()
      }
    })

    return this
  }

  /* Private */
  Context.findOrCreateByElement = function(element) {
    return Context.findByElement(element) || new Context(element)
  }

  /* Private */
  Context.refreshAll = function() {
    for (var contextId in contexts) {
      contexts[contextId].refresh()
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/context-find-by-element */
  Context.findByElement = function(element) {
    return contexts[element.waypointContextKey]
  }

  window.onload = function() {
    if (oldWindowLoad) {
      oldWindowLoad()
    }
    Context.refreshAll()
  }

  Waypoint.requestAnimationFrame = function(callback) {
    var requestFn = window.requestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      requestAnimationFrameShim
    requestFn.call(window, callback)
  }
  Waypoint.Context = Context
}())
;(function() {
  'use strict'

  function byTriggerPoint(a, b) {
    return a.triggerPoint - b.triggerPoint
  }

  function byReverseTriggerPoint(a, b) {
    return b.triggerPoint - a.triggerPoint
  }

  var groups = {
    vertical: {},
    horizontal: {}
  }
  var Waypoint = window.Waypoint

  /* http://imakewebthings.com/waypoints/api/group */
  function Group(options) {
    this.name = options.name
    this.axis = options.axis
    this.id = this.name + '-' + this.axis
    this.waypoints = []
    this.clearTriggerQueues()
    groups[this.axis][this.name] = this
  }

  /* Private */
  Group.prototype.add = function(waypoint) {
    this.waypoints.push(waypoint)
  }

  /* Private */
  Group.prototype.clearTriggerQueues = function() {
    this.triggerQueues = {
      up: [],
      down: [],
      left: [],
      right: []
    }
  }

  /* Private */
  Group.prototype.flushTriggers = function() {
    for (var direction in this.triggerQueues) {
      var waypoints = this.triggerQueues[direction]
      var reverse = direction === 'up' || direction === 'left'
      waypoints.sort(reverse ? byReverseTriggerPoint : byTriggerPoint)
      for (var i = 0, end = waypoints.length; i < end; i += 1) {
        var waypoint = waypoints[i]
        if (waypoint.options.continuous || i === waypoints.length - 1) {
          waypoint.trigger([direction])
        }
      }
    }
    this.clearTriggerQueues()
  }

  /* Private */
  Group.prototype.next = function(waypoint) {
    this.waypoints.sort(byTriggerPoint)
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    var isLast = index === this.waypoints.length - 1
    return isLast ? null : this.waypoints[index + 1]
  }

  /* Private */
  Group.prototype.previous = function(waypoint) {
    this.waypoints.sort(byTriggerPoint)
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    return index ? this.waypoints[index - 1] : null
  }

  /* Private */
  Group.prototype.queueTrigger = function(waypoint, direction) {
    this.triggerQueues[direction].push(waypoint)
  }

  /* Private */
  Group.prototype.remove = function(waypoint) {
    var index = Waypoint.Adapter.inArray(waypoint, this.waypoints)
    if (index > -1) {
      this.waypoints.splice(index, 1)
    }
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/first */
  Group.prototype.first = function() {
    return this.waypoints[0]
  }

  /* Public */
  /* http://imakewebthings.com/waypoints/api/last */
  Group.prototype.last = function() {
    return this.waypoints[this.waypoints.length - 1]
  }

  /* Private */
  Group.findOrCreate = function(options) {
    return groups[options.axis][options.name] || new Group(options)
  }

  Waypoint.Group = Group
}())
;(function() {
  'use strict'

  var $ = window.jQuery
  var Waypoint = window.Waypoint

  function JQueryAdapter(element) {
    this.$element = $(element)
  }

  $.each([
    'innerHeight',
    'innerWidth',
    'off',
    'offset',
    'on',
    'outerHeight',
    'outerWidth',
    'scrollLeft',
    'scrollTop'
  ], function(i, method) {
    JQueryAdapter.prototype[method] = function() {
      var args = Array.prototype.slice.call(arguments)
      return this.$element[method].apply(this.$element, args)
    }
  })

  $.each([
    'extend',
    'inArray',
    'isEmptyObject'
  ], function(i, method) {
    JQueryAdapter[method] = $[method]
  })

  Waypoint.adapters.push({
    name: 'jquery',
    Adapter: JQueryAdapter
  })
  Waypoint.Adapter = JQueryAdapter
}())
;(function() {
  'use strict'

  var Waypoint = window.Waypoint

  function createExtension(framework) {
    return function() {
      var waypoints = []
      var overrides = arguments[0]

      if (framework.isFunction(arguments[0])) {
        overrides = framework.extend({}, arguments[1])
        overrides.handler = arguments[0]
      }

      this.each(function() {
        var options = framework.extend({}, overrides, {
          element: this
        })
        if (typeof options.context === 'string') {
          options.context = framework(this).closest(options.context)[0]
        }
        waypoints.push(new Waypoint(options))
      })

      return waypoints
    }
  }

  if (window.jQuery) {
    window.jQuery.fn.waypoint = createExtension(window.jQuery)
  }
  if (window.Zepto) {
    window.Zepto.fn.waypoint = createExtension(window.Zepto)
  }
}())
;

/*!
Waypoints Sticky Element Shortcut - 4.0.0
Copyright © 2011-2015 Caleb Troughton
Licensed under the MIT license.
https://github.com/imakewebthings/waypoints/blog/master/licenses.txt
*/
(function() {
  'use strict'

  var $ = window.jQuery
  var Waypoint = window.Waypoint

  /* http://imakewebthings.com/waypoints/shortcuts/sticky-elements */
  function Sticky(options) {
    this.options = $.extend({}, Waypoint.defaults, Sticky.defaults, options)
    this.element = this.options.element
    this.$element = $(this.element)
    this.createWrapper()
    this.createWaypoint()
  }

  /* Private */
  Sticky.prototype.createWaypoint = function() {
    var originalHandler = this.options.handler

    this.waypoint = new Waypoint($.extend({}, this.options, {
      element: this.wrapper,
      handler: $.proxy(function(direction) {
        var shouldBeStuck = this.options.direction.indexOf(direction) > -1
        var wrapperHeight = shouldBeStuck ? this.$element.outerHeight(true) : ''

        this.$wrapper.height(wrapperHeight)
        this.$element.toggleClass(this.options.stuckClass, shouldBeStuck)

        if (originalHandler) {
          originalHandler.call(this, direction)
        }
      }, this)
    }))
  }

  /* Private */
  Sticky.prototype.createWrapper = function() {
    if (this.options.wrapper) {
      this.$element.wrap(this.options.wrapper)
    }
    this.$wrapper = this.$element.parent()
    this.wrapper = this.$wrapper[0]
  }

  /* Public */
  Sticky.prototype.destroy = function() {
    if (this.$element.parent()[0] === this.wrapper) {
      this.waypoint.destroy()
      this.$element.removeClass(this.options.stuckClass)
      if (this.options.wrapper) {
        this.$element.unwrap()
      }
    }
  }

  Sticky.defaults = {
    wrapper: '<div class="sticky-wrapper" />',
    stuckClass: 'stuck',
    direction: 'down right'
  }

  Waypoint.Sticky = Sticky
}())
;

/*!
Waypoints Inview Shortcut - 4.0.0
Copyright © 2011-2015 Caleb Troughton
Licensed under the MIT license.
https://github.com/imakewebthings/waypoints/blob/master/licenses.txt
*/
(function() {
  'use strict'

  function noop() {}

  var Waypoint = window.Waypoint

  /* http://imakewebthings.com/waypoints/shortcuts/inview */
  function Inview(options) {
    this.options = Waypoint.Adapter.extend({}, Inview.defaults, options)
    this.axis = this.options.horizontal ? 'horizontal' : 'vertical'
    this.waypoints = []
    this.element = this.options.element
    this.createWaypoints()
  }

  /* Private */
  Inview.prototype.createWaypoints = function() {
    var configs = {
      vertical: [{
        down: 'enter',
        up: 'exited',
        offset: '100%'
      }, {
        down: 'entered',
        up: 'exit',
        offset: 'bottom-in-view'
      }, {
        down: 'exit',
        up: 'entered',
        offset: 0
      }, {
        down: 'exited',
        up: 'enter',
        offset: function() {
          return -this.adapter.outerHeight()
        }
      }],
      horizontal: [{
        right: 'enter',
        left: 'exited',
        offset: '100%'
      }, {
        right: 'entered',
        left: 'exit',
        offset: 'right-in-view'
      }, {
        right: 'exit',
        left: 'entered',
        offset: 0
      }, {
        right: 'exited',
        left: 'enter',
        offset: function() {
          return -this.adapter.outerWidth()
        }
      }]
    }

    for (var i = 0, end = configs[this.axis].length; i < end; i++) {
      var config = configs[this.axis][i]
      this.createWaypoint(config)
    }
  }

  /* Private */
  Inview.prototype.createWaypoint = function(config) {
    var self = this
    this.waypoints.push(new Waypoint({
      context: this.options.context,
      element: this.options.element,
      enabled: this.options.enabled,
      handler: (function(config) {
        return function(direction) {
          self.options[config[direction]].call(self, direction)
        }
      }(config)),
      offset: config.offset,
      horizontal: this.options.horizontal
    }))
  }

  /* Public */
  Inview.prototype.destroy = function() {
    for (var i = 0, end = this.waypoints.length; i < end; i++) {
      this.waypoints[i].destroy()
    }
    this.waypoints = []
  }

  Inview.prototype.disable = function() {
    for (var i = 0, end = this.waypoints.length; i < end; i++) {
      this.waypoints[i].disable()
    }
  }

  Inview.prototype.enable = function() {
    for (var i = 0, end = this.waypoints.length; i < end; i++) {
      this.waypoints[i].enable()
    }
  }

  Inview.defaults = {
    context: window,
    enabled: true,
    enter: noop,
    entered: noop,
    exit: noop,
    exited: noop
  }

  Waypoint.Inview = Inview
}())
;

$(document).ready(function() {
    console.log("✅ header.js loaded");
    // Basic stuff for the mobile menu
    $('.header__mobile_button--menu a').click(function(event){
        event.preventDefault();
        $('.header__mobile_button--menu').toggleClass("header__mobile_button--menu_active");
        $('.header__main_navigation').fadeToggle('fast');
    });

    // Only use the waypoint sticky javascript if we need it. (The wrapper generated interferes with the mobile menu.)
    function enableStickyIfNeeded() {
        var windowSize = $(window).width();
        var nav_header = $('nav.header');
        if (windowSize >= 1024) {
            var sticky = new Waypoint.Sticky({
                element: nav_header,
                wrapper: '<div class="header__sticky-wrapper" />',
                stuckClass: 'header--scrolled'
            });
        }
    }

    enableStickyIfNeeded();

    $(window).resize(enableStickyIfNeeded);

});

$(document).ready(function() {
    console.log("✅ project_gallery.js loaded");
    $('.project_gallery__image_link').magnificPopup({
        removalDelay: 300,
        mainClass: 'mfp-fade',
        closeBtnInside: true,
        type: 'image',
        image: {
			verticalFit: true,
            titleSrc: function(item) {
                var currentURL = window.location;
                var imgSRC = item.el.attr('href');
                return ' <div class="mfp-share-button mfp-share-button--pin"><a href="https://pinterest.com/pin/create/bookmarklet/?media='+imgSRC+'&url='+currentURL+'">Pin</a></div> <div class="mfp-share-button mfp-share-button--tweet"><a href="https://twitter.com/intent/tweet?url='+currentURL+'" target="_blank">Tweet</a></div> <div class="mfp-share-button mfp-share-button--fb-post"><a href="https://www.facebook.com/sharer.php?u='+currentURL+'" target="_blank">FB Post</a></div>';
			}
		},
        gallery: {
            enabled: true,
            arrows: false,
            tCounter: ''
        }
    });

    // projcet pricing
    $('.project_gallery a[data-products]').click(function(event){
       event.preventDefault();
       var project_pieces = $(this).attr('data-products');
       localStorage.setItem("selected_products", project_pieces);
       window.location.assign($(this).attr('href'));
    });

});

$(document).ready(function() {
    console.log("✅ gallery_lightbox.js loaded");
    $('.product_gallery, .gallery, .product_block_gallery').magnificPopup({
        removalDelay: 300,
        mainClass: 'mfp-fade',
        closeBtnInside: true,
        type: 'image',
        delegate: 'a.gallery_lightbox__link, a.product_block_gallery__link',
        gallery: {
            enabled:true
        },
          image: {

            verticalFit: true,

            titleSrc: function(item) {

                var currentURL = window.location;

                var imgSRC = item.el.attr('href');

                var projectSRC = item.el.attr('data-project');

                var photo_pieces = item.el.attr('data-products');

                localStorage.setItem("photo_pieces", photo_pieces);

                if(projectSRC.length > 3){
                    var projectButton = '<div class="mfp-detail-button"><a href="'+projectSRC+'"><span class="mfp-detail-button--optional-copy">More From This</span> Project</a></div>';
                }
                else {
                    var projectButton = "";
                }

                if(photo_pieces.length > 3){
                    var pricingButton = '<div class="mfp-detail-button mfp-detail-button--pricing"><a href="javascript:void(0)" onclick="save_photo_pieces()"><span class="mfp-detail-button--optional-copy">Get</span> Pricing</a></div>';
                }
                else {
                    var pricingButton = "";
                }

                return ' <div class="mfp-share-button mfp-share-button--pin"><a href="https://pinterest.com/pin/create/bookmarklet/?media='+imgSRC+'&url='+currentURL+'">Pin</a></div> <div class="mfp-share-button mfp-share-button--tweet"><a href="https://twitter.com/intent/tweet?url='+currentURL+'" target="_blank">Tweet</a></div> <div class="mfp-share-button mfp-share-button--fb-post"><a href="https://www.facebook.com/sharer.php?u='+currentURL+'" target="_blank">FB <span class="mfp-detail-button--optional-copy">Post</span></a></div>'+projectButton+' '+pricingButton+'';

            }

        }

    });

});

function save_photo_pieces(){
   var photo_pieces = localStorage.getItem("photo_pieces");
   localStorage.setItem("selected_products", photo_pieces);
   window.location.assign("/pricing");
}

$(document).keyup(function(e) {
    if (e.keyCode == 27) {
        $.magnificPopup.close();
    }
});

$(document).ready(function() {
    $('.image_lightbox').magnificPopup({
        removalDelay: 300,
        mainClass: 'mfp-fade',
        closeBtnInside: true,
        type: 'image'
    });

    $(document).keyup(function(e) {
        if (e.keyCode == 27) {
            $.magnificPopup.close();
        }
    });
});

$(document).ready(function() {
    console.log("✅ pricing.js loaded");
    $('.quote_total__amount').html('$0');
    $('.product_piece__content--small, .product_piece__content--large').hide();

    // hide extra empty pieces on small screens
    if( window.innerWidth < 415) {
        $('.product_grid--estimate .product_piece--empty:not(:first)').css({
            width: "1px",
            height: "1px",
            opacity: "0"
        });
    }

    // store default seletion data in product_piece
    $('.product_piece__option--selected').each(function(){

        var variant = $(this).attr('data-product_variant');
        var min_price = $(this).attr('data-product_min_price');
        var max_price = $(this).attr('data-product_max_price');

        $(this).parents('.product_piece').attr({
            'data-product_variant': variant,
            'data-product_min_price': min_price,
            'data-product_max_price': max_price
        });

    });

    get_stored_items();
    save_form_data();

    // move products into estimate
    $('.product_piece__add_to_estimate').click(function(event){
        event.preventDefault();

        $(this).hide();
        $(this).siblings('.product_piece__remove_from_estimate').show();
        $(this).parent().clone(true).prependTo('.product_grid--estimate > .product_grid__wrapper');

        save_form_data();
        count_empty();
        calculate_estimates();
        Waypoint.refreshAll();

        // if the initial add_piece button is still visible, hide it and instead show the floating one
        $('.product_grid__button--add_piece:visible').hide(function(){
            $('.quote_total__button--add_piece:hidden, .print_quote:hidden').show();
            $('.help_choosing:visible').hide();
            $('.pricing_footer').addClass('pricing_footer--split');
            $('.pricing_footer .contact_form').hide();
            $('.pricing_footer .contact_form--pricing_page').show();

        });

        // show the estimate total
        $('.quote_total__wrapper').show();

        // close the piece overlay
        $('.piece_grid').fadeOut('fast', function(){
            $('.piece_grid').detach().appendTo('body');
        });

    });

    // remove products from estimate
    $('.product_piece__remove_from_estimate').click(function(event){
        event.preventDefault();

        var id = $(this).parent().attr('data-product_id');

        $('.product_grid--estimate .product_piece[data-product_id='+id+']').remove();

        $('.product_grid--backyard .product_piece[data-product_id='+id+'] .product_piece__add_to_estimate, .product_grid--front_yard .product_piece[data-product_id='+id+'] .product_piece__add_to_estimate').show();

        $('.product_grid--backyard .product_piece[data-product_id='+id+'] .product_piece__remove_from_estimate, .product_grid--front_yard .product_piece[data-product_id='+id+'] .product_piece__remove_from_estimate').hide();

        save_form_data();
        count_empty();
        calculate_estimates();
        revert_to_original_state();
        Waypoint.refreshAll();

    });


    // select variant
    $('.product_piece__option').click(function(event){
        event.preventDefault();

        var id = $(this).attr('data-product_id');
        var variant = $(this).attr('data-product_variant');
        var min_price = $(this).attr('data-product_min_price');
        var max_price = $(this).attr('data-product_max_price');
        var parent = $('.product_piece[data-product_id='+id+']');
        var selected_variant = $('.product_piece[data-product_id='+id+'] .product_piece__option[data-product_variant='+variant+']');

        parent.attr({
            'data-product_variant': variant,
            'data-product_min_price': min_price,
            'data-product_max_price': max_price
        });
        selected_variant.siblings().removeClass("product_piece__option--selected");
        selected_variant.addClass("product_piece__option--selected");
        parent.children('.product_piece__content').fadeOut();
        parent.children('.product_piece__content--'+variant+'').fadeIn();

        calculate_estimates();
        save_form_data();
    });

    // open piece grid
    $('.product_grid__button--add_piece, .quote_total__button--add_piece').click(function(event){
        event.preventDefault();
        $('.piece_grid').detach().prependTo('body');
        $('.piece_grid').fadeIn('fast');
    });

    // close piece grid
    $('.piece_grid__button--close a, .piece_grid__wrapper, .piece_grid__wrapper .center').click(function(event){
        event.preventDefault();
        $('.piece_grid').fadeOut('fast');
        $('.piece_grid').detach().appendTo('body');
    }).children().click(function(e) {
        return false;
    });

    // show front yard pieces
    $('.piece_grid__button--front_yard a').click(function(event){
        event.preventDefault();
        $('.piece_grid__button--front_yard').addClass("piece_grid__button--active");
        $('.piece_grid__button--backyard').removeClass('piece_grid__button--active');
        $('.product_grid--backyard').fadeOut('fast');
        $('.product_grid--front_yard').delay('200').fadeIn('fast');
    });

    // show backyard pieces
    $('.piece_grid__button--backyard a').click(function(event){
        event.preventDefault();
        $('.piece_grid__button--backyard').addClass("piece_grid__button--active");
        $('.piece_grid__button--front_yard').removeClass('piece_grid__button--active');
        $('.product_grid--front_yard').fadeOut('fast');
        $('.product_grid--backyard').delay('200').fadeIn('fast');
    });

    $('input, textarea').keyup(function() {
        value = $(this).val();
        key = $(this).attr('name');
        localStorage.setItem(key, value);
    });

    // print button
    $('.print_quote__button').click(function() {
        window.print();
    });

    // on product page, make the get pricing button do what we want
    $('.product_block_1__button a').click(function(event) {
        event.preventDefault();
        value_selected_products = $(this).attr('data-products');
        localStorage.setItem("selected_products", value_selected_products);
        window.location.assign("/pricing");
    });

    // remove all selected items from the estimate
    $('.product_grid__remove_all').click(function(event) {
        event.preventDefault();

        $('.product_grid--estimate .product_piece[data-product_id]').remove();
        $('.product_grid--backyard .product_piece .product_piece__add_to_estimate, .product_grid--front_yard .product_piece .product_piece__add_to_estimate').show();
        $('.product_grid--backyard .product_piece .product_piece__remove_from_estimate, .product_grid--front_yard .product_piece .product_piece__remove_from_estimate').hide();
        $('.product_grid--estimate .product_piece--empty').show();

        save_form_data();
        count_empty();
        calculate_estimates();
        revert_to_original_state();
        Waypoint.refreshAll();
    });

});

// escape key closes overlay

$(document).keyup(function(e) {
    if (e.keyCode == 27) {
        $('.piece_grid').fadeOut('fast');
        $('.piece_grid').detach().appendTo('body');
    }
});

// calculate estimate total
function calculate_estimates(){

    var estimate_min_total = 0;
    var estimate_max_total = 0;

    $('.product_grid--estimate .product_piece').each(function(){
        var this_min = $(this).attr('data-product_min_price');
        estimate_min_total += parseFloat(this_min);
        var this_max = $(this).attr('data-product_max_price');
        estimate_max_total += parseFloat(this_max);
    });

    if(estimate_min_total > 0){
        $('.quote_total__amount').html('$'+estimate_min_total+'-'+estimate_max_total+'K');
    }
    else {
        $('.quote_total__amount').html('$0');
    }

}

// make sure the grid has at least 8 places, if there are more show the remove all button
function count_empty(){

    var empty_pieces = $('.product_grid--estimate .product_piece--empty').length;
    var empty_pieces_hidden = $('.product_grid--estimate .product_piece--empty').filter(":hidden").length;
    var all_pieces = $('.product_grid--estimate .product_piece').length;
    var total_pieces = all_pieces - empty_pieces_hidden;

    if(total_pieces > 8){ // hide empty pieces
        $('.product_grid--estimate .product_piece--empty').filter(":visible").last().hide();
    }
    else if (total_pieces < 8) { // show empty piees
        $('.product_grid--estimate .product_piece--empty').filter(":hidden").first().show();
    }

    // show and hide the remove all button when necessary
    if(empty_pieces_hidden == 8 && total_pieces > 8) { // if there are 9 or more items, show the button
        $('.product_grid__remove_all').show();
    }
    else if (total_pieces <= 8) { // otherwise, if there are 8 or fewer items hide the button
        $('.product_grid__remove_all').hide();
    }

}
// revert to original state if all pieces are empty
function revert_to_original_state(){
    var empty_pieces = $('.product_grid--estimate .product_piece--empty').length;
    var empty_pieces_hidden = $('.product_grid--estimate .product_piece--empty').filter(":hidden").length;
    var total_empty_pieces = 8 - empty_pieces_hidden;

    if(total_empty_pieces === 8) {
        $('.product_grid__button--add_piece').show();
        $('.help_choosing:hidden').show();
        $('.pricing_footer--split').removeClass('pricing_footer--split');
        $('.quote_total__wrapper').hide();
        $('.print_quote').hide();
        $('.pricing_footer .contact_form').show();
        $('.pricing_footer .contact_form--pricing_page').hide();
    }
}

// save estimate items to storage

function save_form_data() {

    $('textarea[name=estimate]').val('');

    $('.product_grid--estimate .product_piece').not('.product_piece--empty').each(function(){

        var name = $(this).attr('data-product_name');
        var category = $(this).attr('data-product_category');
        var min_price = $(this).attr('data-product_min_price');
        var max_price = $(this).attr('data-product_max_price');
        var estimate_item = ''+name +' ('+category+'): $'+min_price+'-'+max_price+' K';
        var estimate_products = $('textarea[name=estimate]').val()+'\n'+estimate_item;
        $('textarea[name=estimate]').val(estimate_products);
    });

    var value_selected_products = [];

    $('.product_grid--estimate .product_piece').not('.product_piece--empty').each(function(){

        var id = $(this).attr('data-product_id');
        var variant = $(this).attr('data-product_variant');
        var product = {};
        product[id] = variant;
        value_selected_products.push(product);
    });

    value_selected_products = JSON.stringify(value_selected_products);

    // only save these thigns if the quote_grid is on the page
    if ($('.product_grid--estimate').length > 0) {
        localStorage.setItem("selected_products", value_selected_products);
    }

    console.log("💾 form data saved");
}

// retrieve estimate items from storage

function get_stored_items() {

    var value_name          = localStorage.getItem("name");
    var value_email         = localStorage.getItem("email");
    var value_phone         = localStorage.getItem("phone");
    var value_address       = localStorage.getItem("address");
    var value_message       = localStorage.getItem("message");

    if (value_name !== undefined) {
        $('input#name').val(value_name);
    }

    if (value_email !== undefined) {
        $('input#email').val(value_email);
    }

    if (value_phone !== undefined) {
        $('input#phone').val(value_phone);
    }

    if (value_phone !== undefined) {
        $('input#address').val(value_address);
    }

    if (value_message !== undefined) {
        $('textarea#message').val(value_message);
    }

    if(localStorage.getItem('selected_products')) {
        var stored_selected_items = localStorage.getItem('selected_products');

        parsed = JSON.parse(stored_selected_items).reverse();

        $.each(parsed, function(index, product){
            $.each(product, function(id, variant){
                //console.log(id);
                //console.log(variant);

                var selected_product = $('.product_piece[data-product_id='+id+']');

                var selected_variant = $('.product_piece[data-product_id='+id+'] .product_piece__option[data-product_variant='+variant+']');

                var min_price = selected_variant.attr('data-product_min_price');
                var max_price = selected_variant.attr('data-product_max_price');

                selected_product.attr({
                    'data-product_variant': variant,
                    'data-product_min_price': min_price,
                    'data-product_max_price': max_price
                });

                selected_variant.siblings().removeClass("product_piece__option--selected");
                selected_variant.addClass("product_piece__option--selected");
                selected_product.children('.product_piece__content').hide();
                selected_product.children('.product_piece__content--'+variant+'').show();
                selected_product.children(".product_piece__add_to_estimate").hide();
                selected_product.children(".product_piece__remove_from_estimate").show();
                selected_product.clone(true).prependTo('.product_grid--estimate > .product_grid__wrapper');

                    count_empty();
                    calculate_estimates();
                    Waypoint.refreshAll();

                    // if the initial add_piece button is still visible, hide it and instead show the floating one
                    $('.product_grid__button--add_piece:visible').hide(function(){
                        $('.quote_total__button--add_piece:hidden, .print_quote:hidden').show();
                        $('.help_choosing:visible').hide();
                        $('.pricing_footer').addClass('pricing_footer--split');
                    });

                    // show the estimate total
                    $('.quote_total__wrapper').show();
                    $('.pricing_footer .contact_form').hide();
                    $('.pricing_footer .contact_form--pricing_page').show();

            });
        });
    }

}

$(function() {
    console.log("✅ product_block_1.js loaded");
    $('.product_block_1:odd').addClass("product_block_1--even");

});

$(document).ready(function() {
    console.log("✅ ready_to_help.js loaded");
    $('.ready_to_help__video_link').magnificPopup({
        disableOn: 700,
        type: 'iframe',
        mainClass: 'mfp-fade',
        removalDelay: 160,
        preloader: false,

        fixedContentPos: false
    });
});

//= include blocks/_quote_total.js

$(function() {

    $('.product_block_gallery__link_more--more').click(function(){
        $(this).parent('.product_block_gallery__item').hide();
        $(this).parent('.product_block_gallery__item').siblings('.product_block_gallery__item--extra').fadeIn(400);
        $(this).parent('.product_block_gallery__item').siblings('.product_block_gallery__item--less').delay(150).fadeIn(100);
        return false;
    });

    $('.product_block_gallery__link_more--less').click(function(){
        $(this).parent('.product_block_gallery__item').hide();
        $(this).parent('.product_block_gallery__item').siblings('.product_block_gallery__item--extra').fadeOut(400);
        $(this).parent('.product_block_gallery__item').siblings('.product_block_gallery__item--more').delay(150).fadeIn(100);
        return false;
    });

});

