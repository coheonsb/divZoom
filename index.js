  var ZoomContent = function(el, options) {
    const rAF =
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      function(callback) {
        window.setTimeout(callback, 1000 / 60);
      };

    const utils = ZoomContent.utils
    this.wrapper = typeof el === "string" ? document.querySelector(el) : el;
    // script tag가 포함될 수 있으므로 제외하는 로직 추가
    for (i = 0; i < this.wrapper.children.length; i++) {
      if (this.wrapper.children[i].tagName === "SCRIPT") {
        continue;
      }
      this.scroller = this.wrapper.children[i];
    }
    this.scrollerStyle = this.scroller.style;

    const innerH = window.innerHeight || document.body.clientHeight;
    this.options = {
      zoom: true,
      zoomMin: 1,
      zoomMax: 3,
      startZoom: 1,

      // 더블탭 코드 추가 수정
      doubleTapZoom: 2,
      handleClick: true,

      resizeScrollbars: true,

      mouseWheelSpeed: 20,

      snapThreshold: 0.334,

      startX: 0,
      startY: 0,
      scrollX: true,
      scrollY: true,
      directionLockThreshold: 5,
      momentum: true,

      bounce: false,
      bounceTime: 600,
      bounceEasing: "",

      preventDefault: true,
      preventDefaultException: {
        tagName: /^(INPUT|TEXTAREA|BUTTON|SELECT)$/
      },

      HWCompositing: true,
      useTransition: true,
      useTransform: true,
      useFixHeight: false,
      useWindowScroll: true,
      useTapAction: false,
      fixHeightValue: innerH,

      // [SHOPPINGW-2209] 크롬 55버전 이상에서 zoom 동작하지 않는 이슈
      disablePointer: true
    };

    for (var i in options) {
      this.options[i] = options[i];
    }

    this.wrapper.style.overflow = "hidden";
    if (this.options.useFixHeight) {
      this.wrapper.style.height = `${this.options.fixHeightValue}px`;
    }

    this.translateZ =
      this.options.HWCompositing && utils.hasPerspective
        ? " translateZ(0)"
        : "";

    this.options.useTransition =
      utils.hasTransition && this.options.useTransition;
    this.options.useTransform = utils.hasTransform && this.options.useTransform;

    this.options.eventPassthrough =
      this.options.eventPassthrough === true
        ? "vertical"
        : this.options.eventPassthrough;
    this.options.preventDefault =
      !this.options.eventPassthrough && this.options.preventDefault;

    this.options.scrollY =
      this.options.eventPassthrough == "vertical"
        ? false
        : this.options.scrollY;
    this.options.scrollX =
      this.options.eventPassthrough == "horizontal"
        ? false
        : this.options.scrollX;

    this.options.freeScroll =
      this.options.freeScroll && !this.options.eventPassthrough;
    this.options.directionLockThreshold = this.options.eventPassthrough
      ? 0
      : this.options.directionLockThreshold;

    this.options.bounceEasing =
      typeof this.options.bounceEasing === "string"
        ? utils.ease[this.options.bounceEasing] || utils.ease.circular
        : this.options.bounceEasing;

    this.options.resizePolling =
      this.options.resizePolling === undefined
        ? 60
        : this.options.resizePolling;

    if (this.options.tap === true) {
      this.options.tap = "tap";
    }

    if (this.options.shrinkScrollbars == "scale") {
      this.options.useTransition = false;
    }

    this.options.invertWheelDirection = this.options.invertWheelDirection
      ? -1
      : 1;

    this.x = 0;
    this.y = 0;
    this.directionX = 0;
    this.directionY = 0;
    this._events = {};
    this.bZoomAction = false;
    this.scale = Math.min(
      Math.max(this.options.startZoom, this.options.zoomMin),
      this.options.zoomMax
    );
    this.beforeScale = this.scale;
    this.prototype = ZoomContent.prototype
  
    this._init();
    this.refresh();

    this.scrollTo(this.options.startX, this.options.startY);
    this.enable();

    this.elCurrent = null;

    this.bZoomStart = false;
    this.bZoomEnd = false;
    this.clientY = 0;
  };

  /*******************************************************************************************************/
  ZoomContent.prototype = {
    _init: function() {
      this._initEvents();

      if (this.options.zoom) {
        this._initZoom();
      }
    },

    destroy: function() {
      this._initEvents(true);

      this._execEvent("destroy");
    },

    _transitionEnd: function(e) {
      if (e.target != this.scroller || !this.isInTransition) {
        return;
      }

      this._transitionTime();
      if (!this.resetPosition(this.options.bounceTime)) {
        this.isInTransition = false;
        this._execEvent("scrollEnd");
      }
    },

    _start: function(e) {
      if (ZoomContent.utils.eventType[e.type] != 1) {
        if (e.button !== 0) {
          return;
        }
      }

      if (
        !this.enabled ||
        (this.initiated &&
          ZoomContent.utils.eventType[e.type] !== this.initiated)
      ) {
        return;
      }

      /* 수정 */
      if (this.bZoomAction) {
        e.preventDefault();
      }
      //			if ( this.options.preventDefault && !utils.isBadAndroid && !utils.preventDefaultException(e.target, this.options.preventDefaultException) ) {
      /// /				e.preventDefault();
      //			}

      const point = e.touches ? e.touches[0] : e;
      let pos;

      this.initiated = ZoomContent.utils.eventType[e.type];
      this.moved = false;
      this.distX = 0;
      this.distY = 0;
      this.directionX = 0;
      this.directionY = 0;
      this.directionLocked = 0;

      this._transitionTime();

      this.startTime = ZoomContent.utils.getTime();

      if (this.options.useTransition && this.isInTransition) {
        this.isInTransition = false;
        pos = this.getComputedPosition();
        this._translate(Math.round(pos.x), Math.round(pos.y));
        this._execEvent("scrollEnd");
      } else if (!this.options.useTransition && this.isAnimating) {
        this.isAnimating = false;
        this._execEvent("scrollEnd");
      }

      this.startX = this.x;
      this.startY = this.y;
      this.absStartX = this.x;
      this.absStartY = this.y;
      this.pointX = point.pageX;
      this.pointY = point.pageY;
      this.clientY = point.clientY;

      this.startPointY = point.pageY;
      this.isUp = false;

      this._execEvent("beforeScrollStart");
    },

    _move: function(e) {
      if (
        !this.enabled ||
        ZoomContent.utils.eventType[e.type] !== this.initiated
      ) {
        return;
      }

      const point = e.touches ? e.touches[0] : e;
      let deltaX = point.pageX - this.pointX;
      let deltaY = point.pageY - this.pointY;
      const timestamp = ZoomContent.utils.getTime();
      let newX;
      let newY;
      let absDistX;
      let absDistY;

      this.pointX = point.pageX;
      this.pointY = point.pageY;

      this.distX += deltaX;
      this.distY += deltaY;
      absDistX = Math.abs(this.distX);
      absDistY = Math.abs(this.distY);

      // if ( timestamp - this.endTime > 300 && (absDistX < 10 && absDistY < 10) ) {
      //	return;
      // }

      if (!this.directionLocked && !this.options.freeScroll) {
        if (absDistX > absDistY + this.options.directionLockThreshold) {
          this.directionLocked = "h";
        } else if (absDistY >= absDistX + this.options.directionLockThreshold) {
          this.directionLocked = "v";
        } else {
          this.directionLocked = "n";
        }
      }

      if (this.directionLocked == "h") {
        if (this.options.eventPassthrough == "vertical") {
          e.preventDefault();
        } else if (this.options.eventPassthrough == "horizontal") {
          this.initiated = false;
          return;
        }

        deltaY = 0;
      } else if (this.directionLocked == "v") {
        if (this.options.eventPassthrough == "horizontal") {
          e.preventDefault();
        } else if (this.options.eventPassthrough == "vertical") {
          this.initiated = false;
          return;
        }

        deltaX = 0;
      }

      deltaX = this.hasHorizontalScroll ? deltaX : 0;
      deltaY = this.hasVerticalScroll ? deltaY : 0;

      newX = this.x + deltaX;
      newY = this.y + deltaY;
      // Slow down if outsid!
      if (newX > 0 || newX < this.maxScrollX) {
        newX = this.options.bounce
          ? this.x + deltaX / 3
          : newX > 0
          ? 0
          : this.maxScrollX;
      }
      if (newY > 0 || newY < this.maxScrollY) {
        newY = this.options.bounce
          ? this.y + deltaY / 3
          : newY > 0
          ? 0
          : this.maxScrollY;
      }

      this.directionX = deltaX > 0 ? -1 : deltaX < 0 ? 1 : 0;
      this.directionY = deltaY > 0 ? -1 : deltaY < 0 ? 1 : 0;

      if (!this.moved) {
        this._execEvent("scrollStart");
      }

      this.moved = true;

      this.isUp = Math.abs(newY) > Math.abs(this.y); // 아래로 이동하는지
      if (this.options.useWindowScroll && this.x == newX) {
        if (
          (this.isUp &&
            Math.abs(this.wrapperOffset.top) > document.body.scrollTop) ||
          (!this.isUp &&
            Math.abs(this.wrapperOffset.top) + this.wrapperHeight <
              document.body.scrollTop +
                (window.innerHeight || document.body.clientHeight))
        ) {
          return;
        }
      }

      if (this.x != newX || this.y != newY) {
        e.preventDefault();
      }

      this._translate(newX, newY);

      if (timestamp - this.startTime > 300) {
        this.startTime = timestamp;
        this.startX = this.x;
        this.startY = this.y;
      }
    },

    _end: function(e) {
      if (
        !this.enabled ||
        ZoomContent.utils.eventType[e.type] !== this.initiated
      ) {
        return;
      }

      if (
        this.options.preventDefault &&
        !ZoomContent.utils.preventDefaultException(
          e.target,
          this.options.preventDefaultException
        )
      ) {
        //				e.preventDefault();
      }

      const point = e.changedTouches ? e.changedTouches[0] : e;
      let momentumX;
      let momentumY;
      const duration = ZoomContent.utils.getTime() - this.startTime;
      let newX = Math.round(this.x);
      let newY = Math.round(this.y);
      const distanceX = Math.abs(newX - this.startX);
      const distanceY = Math.abs(newY - this.startY);
      let time = 0;
      let easing = "";

      this.isInTransition = 0;
      this.initiated = 0;
      this.endTime = ZoomContent.utils.getTime();

      if (this.resetPosition(this.options.bounceTime)) {
        return;
      }
      this.scrollTo(newX, newY);

      if (!this.moved) {
        if (this.options.tap && ZoomContent.utils.hasTouch) {
          const _self = this;
          // 더블탭
          if (this.doubleTapTimer && this.options.zoom) {
            clearTimeout(this.doubleTapTimer);
            this.doubleTapTimer = null;
            this.zoom(this.scale == 1 ? 2 : 1, this.pointX, this.pointY);
            this.resetPosition(200);
            this._execEvent("scrollCancel");
          } else {
            this.doubleTapTimer = setTimeout(
              function() {
                clearTimeout(_self.doubleTapTimer);
                _self.doubleTapTimer = null;
              },
              this.options.zoom ? 500 : 0
            );
          }

          return;
        }
        if (this.options.tap) {
          ZoomContent.utils.tap(e, this.options.tap);
        }

        if (this.options.click) {
          ZoomContent.utils.click(e);
        }

        this._execEvent("scrollCancel");
        return;
      }

      if (this.options.momentum && duration < 300) {
        momentumX = this.hasHorizontalScroll
          ? ZoomContent.utils.momentum(
              this.x,
              this.startX,
              duration,
              this.maxScrollX,
              this.options.bounce ? this.wrapperWidth : 0,
              this.options.deceleration
            )
          : {
              destination: newX,
              duration: 0
            };
        momentumY = this.hasVerticalScroll
          ? ZoomContent.utils.momentum(
              this.y,
              this.startY,
              duration,
              this.maxScrollY,
              this.options.bounce ? this.wrapperHeight : 0,
              this.options.deceleration
            )
          : {
              destination: newY,
              duration: 0
            };
        newX = momentumX.destination;
        newY = momentumY.destination;
        time = Math.max(momentumX.duration, momentumY.duration);
        this.isInTransition = 1;
      }

      if (this.options.snap) {
        const snap = this._nearestSnap(newX, newY);
        this.currentPage = snap;
        time =
          this.options.snapSpeed ||
          Math.max(
            Math.max(
              Math.min(Math.abs(newX - snap.x), 1000),
              Math.min(Math.abs(newY - snap.y), 1000)
            ),
            300
          );
        newX = snap.x;
        newY = snap.y;

        this.directionX = 0;
        this.directionY = 0;
        easing = this.options.bounceEasing;
      }

      if (newX != this.x || newY != this.y) {
        if (
          newX > 0 ||
          newX < this.maxScrollX ||
          newY > 0 ||
          newY < this.maxScrollY
        ) {
          easing = ZoomContent.utils.ease.quadratic;
        }

        this.scrollTo(newX, newY, time, easing);
        return;
      }

      this._execEvent("scrollEnd");
    },

    _resize: function() {
      const that = this;

      clearTimeout(this.resizeTimeout);

      this.resizeTimeout = setTimeout(function() {
        that.refresh();
      }, this.options.resizePolling);
    },

    resetPosition: function(time) {
      let x = this.x;
      let y = this.y;

      time = time || 0;

      if (!this.hasHorizontalScroll || this.x > 0) {
        x = 0;
      } else if (this.x < this.maxScrollX) {
        x = this.maxScrollX;
      }

      if (!this.hasVerticalScroll || this.y > 0) {
        y = 0;
      } else if (this.y < this.maxScrollY) {
        y = this.maxScrollY;
      }

      if (x == this.x && y == this.y) {
        return false;
      }

      this.scrollTo(x, y, time, this.options.bounceEasing);

      return true;
    },

    disable: function() {
      this.enabled = false;
    },

    enable: function() {
      this.enabled = true;
    },

    _setWrapperCustomStyle: function() {
      // if (this.scale == 1) {
      //	this.wrapper.style.overflow = null;
      //	//this.originWrapperHeight = "hidden";
      //	this.wrapper.style.height = "";
      // } else {
      //	this.wrapper.style.overflow = "hidden";
      //	this.wrapper.style.height = this.options["fixHeightValue"]  + "px";
      // }
    },
    refresh: function(nScale) {
      // 테스트 코드
      this.scale = nScale || this.scale;
      // 테스트 코드
      const rf = this.wrapper.offsetHeight;

      this.wrapperWidth = this.wrapper.clientWidth;
      this.wrapperHeight = this.wrapper.clientHeight;

      this.scrollerWidth = Math.round(this.scroller.offsetWidth * this.scale);
      this.scrollerHeight = Math.round(this.scroller.offsetHeight * this.scale);

      this.maxScrollX = this.wrapperWidth - this.scrollerWidth;
      this.maxScrollY = this.wrapperHeight - this.scrollerHeight;

      this.hasHorizontalScroll = this.options.scrollX && this.maxScrollX < 0;
      this.hasVerticalScroll = this.options.scrollY && this.maxScrollY < 0;

      if (!this.hasHorizontalScroll) {
        this.maxScrollX = 0;
        this.scrollerWidth = this.wrapperWidth;
      }

      if (!this.hasVerticalScroll) {
        this.maxScrollY = 0;
        this.scrollerHeight = this.wrapperHeight;
      }

      this.endTime = 0;
      this.directionX = 0;
      this.directionY = 0;

      this.wrapperOffset = ZoomContent.utils.offset(this.wrapper);
      this._execEvent("refresh");

      // if (nScale) {
      //	this.x = 0;
      //	this.y = 0;
      // }
      this.resetPosition();
    },

    on: function(type, fn) {
      if (!this._events[type]) {
        this._events[type] = [];
      }

      this._events[type].push(fn);
    },

    off: function(type, fn) {
      if (!this._events[type]) {
        return;
      }

      const index = this._events[type].indexOf(fn);

      if (index > -1) {
        this._events[type].splice(index, 1);
      }
    },

    _execEvent: function(type) {
      if (!this._events[type]) {
        return;
      }

      let i = 0;
      const l = this._events[type].length;

      if (!l) {
        return;
      }

      for (; i < l; i++) {
        this._events[type][i].apply(this, [].slice.call(arguments, 1));
      }
    },

    scrollBy: function(x, y, time, easing) {
      x = this.x + x;
      y = this.y + y;
      time = time || 0;
      this.scrollTo(x, y, time, easing);
    },

    scrollTo: function(x, y, time, easing) {
      easing = easing || ZoomContent.utils.ease.circular;

      this.isInTransition = this.options.useTransition && time > 0;

      if (!time || (this.options.useTransition && easing.style)) {
        this._transitionTimingFunction(easing.style);
        this._transitionTime(time);
        this._translate(x, y);
      } else {
        this._animate(x, y, time, easing.fn);
      }
    },

    scrollToElement: function(el, time, offsetX, offsetY, easing) {
      el = el.nodeType ? el : this.scroller.querySelector(el);

      if (!el) {
        return;
      }

      const pos = ZoomContent.utils.offset(el);

      pos.left -= this.wrapperOffset.left;
      pos.top -= this.wrapperOffset.top;

      if (offsetX === true) {
        offsetX = Math.round(el.offsetWidth / 2 - this.wrapper.offsetWidth / 2);
      }
      if (offsetY === true) {
        offsetY = Math.round(
          el.offsetHeight / 2 - this.wrapper.offsetHeight / 2
        );
      }

      pos.left -= offsetX || 0;
      pos.top -= offsetY || 0;

      pos.left =
        pos.left > 0
          ? 0
          : pos.left < this.maxScrollX
          ? this.maxScrollX
          : pos.left;
      pos.top =
        pos.top > 0 ? 0 : pos.top < this.maxScrollY ? this.maxScrollY : pos.top;

      time =
        time === undefined || time === null || time === "auto"
          ? Math.max(Math.abs(this.x - pos.left), Math.abs(this.y - pos.top))
          : time;
      this.scrollTo(pos.left, pos.top, time, easing);
    },

    _transitionTime: function(time) {
      time = time || 0;

      this.scrollerStyle[
        ZoomContent.utils.style.transitionDuration
      ] = `${time}ms`;

      if (!time && ZoomContent.utils.isBadAndroid) {
        this.scrollerStyle[ZoomContent.utils.style.transitionDuration] =
          "0.001s";
      }

      if (this.indicators) {
        for (let i = this.indicators.length; i--; ) {
          this.indicators[i].transitionTime(time);
        }
      }
    },

    _transitionTimingFunction: function(easing) {
      this.scrollerStyle[
        ZoomContent.utils.style.transitionTimingFunction
      ] = easing;

      if (this.indicators) {
        for (let i = this.indicators.length; i--; ) {
          this.indicators[i].transitionTimingFunction(easing);
        }
      }
    },

    _translate: function(x, y) {
      if (this.options.useTransform) {
        if (
          ((!this.bZoomStart && this.beforeScale > 1) ||
            (this.bZoomStart && this.bZoomEnd)) &&
          this.scale == 1 &&
          this.beforeScale != this.scale &&
          this.elCurrent != null
        ) {
          const elOffset = ZoomContent.utils.offset(this.elCurrent);
          const nY = Math.abs(elOffset.top);
          const nGap = 55; // 상단 플로팅 영역
          const nRealY = nY - nGap;
          const isCenter = true;
          const nCurrentY = isCenter
            ? nY -
              ((window.innerHeight || document.body.clientHeight) / 2 -
                this.elCurrent.offsetHeight / 2)
            : nY;

          window.scrollTo(0, nCurrentY);
          this.bZoomStart = this.bZoomEnd = false;
        }
        this.beforeScale = this.scale;
        this.scrollerStyle[
          ZoomContent.utils.style.transform
        ] = `translate(${x}px,${y}px) scale(${this.scale}) ${this.translateZ}`; /* REPLACE END: _translate */
      } else {
        x = Math.round(x);
        y = Math.round(y);
        this.scrollerStyle.left = `${x}px`;
        this.scrollerStyle.top = `${y}px`;
      }

      this.x = x;
      this.y = y;

      if (this.indicators) {
        for (let i = this.indicators.length; i--; ) {
          this.indicators[i].updatePosition();
        }
      }
    },

    _initEvents: function(remove) {
      const eventType = remove
        ? ZoomContent.utils.removeEvent
        : ZoomContent.utils.addEvent;
      const target = this.options.bindToWrapper ? this.wrapper : window;

      eventType(window, "orientationchange", this);
      eventType(window, "resize", this);

      if (ZoomContent.utils.hasPointer && !this.options.disablePointer) {
        eventType(
          this.wrapper,
          ZoomContent.utils.prefixPointerEvent("pointerdown"),
          this
        );
        eventType(
          target,
          ZoomContent.utils.prefixPointerEvent("pointermove"),
          this
        );
        eventType(
          target,
          ZoomContent.utils.prefixPointerEvent("pointercancel"),
          this
        );
        eventType(
          target,
          ZoomContent.utils.prefixPointerEvent("pointerup"),
          this
        );
      }

      if (ZoomContent.utils.hasTouch && !this.options.disableTouch) {
        eventType(this.wrapper, "touchstart", this);
        eventType(target, "touchmove", this);
        eventType(target, "touchcancel", this);
        eventType(target, "touchend", this);
      }

      eventType(this.scroller, "transitionend", this);
      eventType(this.scroller, "webkitTransitionEnd", this);
      eventType(this.scroller, "oTransitionEnd", this);
      eventType(this.scroller, "MSTransitionEnd", this);
    },

    isZoomUp: function() {
      return this.scale > 1;
    },
    getComputedPosition: function() {
      let matrix = window.getComputedStyle(this.scroller, null);
      let x;
      let y;

      if (this.options.useTransform) {
        matrix = matrix[ZoomContent.utils.style.transform]
          .split(")")[0]
          .split(", ");
        x = +(matrix[12] || matrix[4]);
        y = +(matrix[13] || matrix[5]);
      } else {
        x = +matrix.left.replace(/[^-\d.]/g, "");
        y = +matrix.top.replace(/[^-\d.]/g, "");
      }

      return {
        x: x,
        y: y
      };
    },

    _initZoom: function() {
      this.scrollerStyle[ZoomContent.utils.style.transformOrigin] = "0 0";
    },

    _zoomStart: function(e) {
      const c1 = Math.abs(e.touches[0].pageX - e.touches[1].pageX);
      const c2 = Math.abs(e.touches[0].pageY - e.touches[1].pageY);

      this.touchesDistanceStart = Math.sqrt(c1 * c1 + c2 * c2);
      this.startScale = this.scale;

      this.originX =
        Math.abs(e.touches[0].pageX + e.touches[1].pageX) / 2 +
        this.wrapperOffset.left -
        this.x;
      this.originY =
        Math.abs(e.touches[0].pageY + e.touches[1].pageY) / 2 +
        this.wrapperOffset.top -
        this.y;

      this._execEvent("zoomStart");
    },

    _zoom: function(e) {
      if (
        !this.enabled ||
        ZoomContent.utils.eventType[e.type] !== this.initiated
      ) {
        return;
      }

      if (this.options.preventDefault) {
        e.preventDefault();
      }

      const c1 = Math.abs(e.touches[0].pageX - e.touches[1].pageX);
      const c2 = Math.abs(e.touches[0].pageY - e.touches[1].pageY);
      const distance = Math.sqrt(c1 * c1 + c2 * c2);
      let scale = (1 / this.touchesDistanceStart) * distance * this.startScale;
      let lastScale;
      let x;
      let y;

      this.scaled = true;

      if (scale < this.options.zoomMin) {
        scale =
          0.5 *
          this.options.zoomMin *
          Math.pow(2.0, scale / this.options.zoomMin);
      } else if (scale > this.options.zoomMax) {
        scale =
          2.0 *
          this.options.zoomMax *
          Math.pow(0.5, this.options.zoomMax / scale);
      }

      lastScale = scale / this.startScale;
      x = this.originX - this.originX * lastScale + this.startX;
      y = this.originY - this.originY * lastScale + this.startY;

      this.scale = scale;
      this.scrollTo(x, y, 0);
    },

    _zoomEnd: function(e) {
      if (
        !this.enabled ||
        ZoomContent.utils.eventType[e.type] !== this.initiated
      ) {
        return;
      }

      if (this.options.preventDefault) {
        //				e.preventDefault();
      }

      let newX, newY, lastScale;

      this.isInTransition = 0;
      this.initiated = 0;

      if (this.scale > this.options.zoomMax) {
        this.scale = this.options.zoomMax;
      } else if (this.scale < this.options.zoomMin) {
        this.scale = this.options.zoomMin;
      }

      this.refresh();

      lastScale = this.scale / this.startScale;

      newX = this.originX - this.originX * lastScale + this.startX;
      newY = this.originY - this.originY * lastScale + this.startY;

      if (newX > 0) {
        newX = 0;
      } else if (newX < this.maxScrollX) {
        newX = this.maxScrollX;
      }

      if (newY > 0) {
        newY = 0;
      } else if (newY < this.maxScrollY) {
        newY = this.maxScrollY;
      }

      if (this.x != newX || this.y != newY) {
        this.scrollTo(newX, newY, this.options.bounceTime);
      }

      this.scaled = false;

      this._execEvent("zoomEnd");
    },

    zoom: function(scale, x, y, time) {
      if (scale < this.options.zoomMin) {
        scale = this.options.zoomMin;
      } else if (scale > this.options.zoomMax) {
        scale = this.options.zoomMax;
      }

      if (scale == this.scale) {
        return;
      }

      const relScale = scale / this.scale;

      x = x === undefined ? this.wrapperWidth / 2 : x;
      y = y === undefined ? this.wrapperHeight / 2 : y;
      time = time === undefined ? 300 : time;
      x = x + this.wrapperOffset.left - this.x;
      y = y + this.wrapperOffset.top - this.y;
      x = x - x * relScale + this.x;
      y = y - y * relScale + this.y;
      this.scale = scale;

      this.refresh(); // update boundaries

      if (x > 0) {
        x = 0;
      } else if (x < this.maxScrollX) {
        x = this.maxScrollX;
      }

      if (y > 0) {
        y = 0;
      } else if (y < this.maxScrollY) {
        y = this.maxScrollY;
      }
      this.scrollTo(x, y, time);
    },

    _animate: function(destX, destY, duration, easingFn) {
      const that = this;
      const startX = this.x;
      const startY = this.y;
      const startTime = ZoomContent.utils.getTime();
      const destTime = startTime + duration;

      function step() {
        let now = ZoomContent.utils.getTime();
        let newX;
        let newY;
        let easing;

        if (now >= destTime) {
          that.isAnimating = false;
          that._translate(destX, destY);

          if (!that.resetPosition(that.options.bounceTime)) {
            that._execEvent("scrollEnd");
          }

          return;
        }

        now = (now - startTime) / duration;
        easing = easingFn(now);
        newX = (destX - startX) * easing + startX;
        newY = (destY - startY) * easing + startY;
        that._translate(newX, newY);

        if (that.isAnimating) {
          rAF(step);
        }
      }

      this.isAnimating = true;
      step();
    },
    handleEvent: function(e) {
      switch (e.type) {
        case "touchstart":
        case "pointerdown":
        case "MSPointerDown":
        case "mousedown":
          this.elCurrent = e.target;
          this.bZoomStart = false;
          this.bZoomEnd = false;
          this.bZoomAction =
            this.options.zoom && e.touches && e.touches.length > 1;
          this._start(e);
          if (this.options.zoom && e.touches && e.touches.length > 1) {
            this.bZoomStart = true;
            this._zoomStart(e);
          }
          break;
        case "touchmove":
        case "pointermove":
        case "MSPointerMove":
        case "mousemove":
          if (this.options.zoom && e.touches && e.touches[1]) {
            this.bZoomStart = true;
            this._zoom(e);
            return;
          }
          this._move(e);
          break;
        case "touchend":
        case "pointerup":
        case "MSPointerUp":
        case "mouseup":
        case "touchcancel":
        case "pointercancel":
        case "MSPointerCancel":
        case "mousecancel":
          if (this.scaled) {
            this.bZoomStart = true;
            this.bZoomEnd = true;
            this._zoomEnd(e);
            return;
          }
          this._end(e);
          break;
        case "orientationchange":
        case "resize":
          this._resize();
          break;
        case "transitionend":
        case "webkitTransitionEnd":
        case "oTransitionEnd":
        case "MSTransitionEnd":
          this._transitionEnd(e);
          break;
        case "wheel":
        case "DOMMouseScroll":
        case "mousewheel":
          if (this.options.wheelAction == "zoom") {
            this._wheelZoom(e);
            return;
          }
          this._wheel(e);
          break;
        case "keydown":
          this._key(e);
          break;
      }
    }
  };

  /*******************************************************************************************************/
  ZoomContent.utils = (function() {
    const me = {};

    const _elementStyle = document.createElement("div").style;
    const _vendor = (function() {
      const vendors = ["t", "webkitT", "MozT", "msT", "OT"];
      let transform;
      let i = 0;
      const l = vendors.length;

      for (; i < l; i++) {
        transform = `${vendors[i]}ransform`;
        if (transform in _elementStyle) {
          return vendors[i].substr(0, vendors[i].length - 1);
        }
      }

      return false;
    })();

    function _prefixStyle(style) {
      if (_vendor === false) return false;
      if (_vendor === "") return style;
      return _vendor + style.charAt(0).toUpperCase() + style.substr(1);
    }

    me.getTime =
      Date.now ||
      function getTime() {
        return new Date().getTime();
      };

    me.extend = function(target, obj) {
      for (const i in obj) {
        target[i] = obj[i];
      }
    };

    me.addEvent = function(el, type, fn, capture) {
      el.addEventListener(type, fn, !!capture);
    };

    me.removeEvent = function(el, type, fn, capture) {
      el.removeEventListener(type, fn, !!capture);
    };

    me.prefixPointerEvent = function(pointerEvent) {
      return window.MSPointerEvent
        ? `MSPointer${pointerEvent
            .charAt(9)
            .toUpperCase()}${pointerEvent.substr(10)}`
        : pointerEvent;
    };

    me.momentum = function(
      current,
      start,
      time,
      lowerMargin,
      wrapperSize,
      deceleration
    ) {
      let distance = current - start;
      const speed = Math.abs(distance) / time;
      let destination;
      let duration;

      deceleration = deceleration === undefined ? 0.0006 : deceleration;

      destination =
        current +
        ((speed * speed) / (2 * deceleration)) * (distance < 0 ? -1 : 1);
      duration = speed / deceleration;

      if (destination < lowerMargin) {
        destination = wrapperSize
          ? lowerMargin - (wrapperSize / 2.5) * (speed / 8)
          : lowerMargin;
        distance = Math.abs(destination - current);
        duration = distance / speed;
      } else if (destination > 0) {
        destination = wrapperSize ? (wrapperSize / 2.5) * (speed / 8) : 0;
        distance = Math.abs(current) + destination;
        duration = distance / speed;
      }

      return {
        destination: Math.round(destination),
        duration: duration
      };
    };

    const _transform = _prefixStyle("transform");

    me.extend(me, {
      hasTransform: _transform !== false,
      hasPerspective: _prefixStyle("perspective") in _elementStyle,
      hasTouch: "ontouchstart" in window,
      hasPointer: window.PointerEvent || window.MSPointerEvent, // IE10 is prefixed
      hasTransition: _prefixStyle("transition") in _elementStyle
    });

    me.isBadAndroid =
      /Android /.test(window.navigator.appVersion) &&
      !/Chrome\/\d/.test(window.navigator.appVersion);

    me.extend((me.style = {}), {
      transform: _transform,
      transitionTimingFunction: _prefixStyle("transitionTimingFunction"),
      transitionDuration: _prefixStyle("transitionDuration"),
      transitionDelay: _prefixStyle("transitionDelay"),
      transformOrigin: _prefixStyle("transformOrigin")
    });

    me.hasClass = function(e, c) {
      const re = new RegExp(`(^|\\s)${c}(\\s|$)`);
      return re.test(e.className);
    };

    me.addClass = function(e, c) {
      if (me.hasClass(e, c)) {
        return;
      }

      const newclass = e.className.split(" ");
      newclass.push(c);
      e.className = newclass.join(" ");
    };

    me.removeClass = function(e, c) {
      if (!me.hasClass(e, c)) {
        return;
      }

      const re = new RegExp(`(^|\\s)${c}(\\s|$)`, "g");
      e.className = e.className.replace(re, " ");
    };

    me.offset = function(el) {
      let left = -el.offsetLeft;
      let top = -el.offsetTop;

      while ((el = el.offsetParent)) {
        left -= el.offsetLeft;
        top -= el.offsetTop;
      }
      return {
        left: left,
        top: top
      };
    };

    me.preventDefaultException = function(el, exceptions) {
      for (const i in exceptions) {
        if (exceptions[i].test(el[i])) {
          return true;
        }
      }

      return false;
    };

    me.extend((me.eventType = {}), {
      touchstart: 1,
      touchmove: 1,
      touchend: 1,

      mousedown: 2,
      mousemove: 2,
      mouseup: 2,

      pointerdown: 3,
      pointermove: 3,
      pointerup: 3,

      MSPointerDown: 3,
      MSPointerMove: 3,
      MSPointerUp: 3
    });

    me.extend((me.ease = {}), {
      quadratic: {
        style: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        fn: function(k) {
          return k * (2 - k);
        }
      },
      circular: {
        style: "cubic-bezier(0.1, 0.57, 0.1, 1)",
        fn: function(k) {
          return Math.sqrt(1 - --k * k);
        }
      },
      back: {
        style: "cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        fn: function(k) {
          const b = 4;
          return (k = k - 1) * k * ((b + 1) * k + b) + 1;
        }
      },
      bounce: {
        style: "",
        fn: function(k) {
          if ((k /= 1) < 1 / 2.75) {
            return 7.5625 * k * k;
          } else if (k < 2 / 2.75) {
            return 7.5625 * (k -= 1.5 / 2.75) * k + 0.75;
          } else if (k < 2.5 / 2.75) {
            return 7.5625 * (k -= 2.25 / 2.75) * k + 0.9375;
          } else {
            return 7.5625 * (k -= 2.625 / 2.75) * k + 0.984375;
          }
        }
      },
      elastic: {
        style: "",
        fn: function(k) {
          const f = 0.22;
          const e = 0.4;

          if (k === 0) {
            return 0;
          }
          if (k == 1) {
            return 1;
          }

          return (
            e *
              Math.pow(2, -10 * k) *
              Math.sin(((k - f / 4) * (2 * Math.PI)) / f) +
            1
          );
        }
      }
    });

    me.tap = function(e, eventName) {
      const ev = document.createEvent("Event");
      ev.initEvent(eventName, true, true);
      ev.pageX = e.pageX;
      ev.pageY = e.pageY;
      e.target.dispatchEvent(ev);
    };

    me.click = function(e) {
      const target = e.target;
      let ev;

      if (!/(SELECT|INPUT|TEXTAREA)/i.test(target.tagName)) {
        ev = document.createEvent("MouseEvents");
        ev.initMouseEvent(
          "click",
          true,
          true,
          e.view,
          1,
          target.screenX,
          target.screenY,
          target.clientX,
          target.clientY,
          e.ctrlKey,
          e.altKey,
          e.shiftKey,
          e.metaKey,
          0,
          null
        );

        ev._constructed = true;
        target.dispatchEvent(ev);
      }
    };

    return me;
  })();

  const ZoomContentOnlyImage = function(el) {
    const elTarget = typeof el === "string" ? document.querySelector(el) : el;
    const arr = elTarget.getElementsByTagName("img");
    for (let i = 0; i < arr.length; i++) {
      new ZoomContent(arr[i].parentNode);
    }
  };
  const ZoomContentDiv = function(el) {
       new ZoomContent(el);
   };
export default {
  ZoomContent,
  ZoomContentDiv,
  ZoomContentOnlyImage
}