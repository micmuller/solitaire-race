// js/touch.js
// Universelles Input-Handling für Maus + Touch (optimiert für iPad)

(function (global) {
  'use strict';

  function noop() {}

  const DEFAULT_OPTIONS = {
    dragThreshold: 10,       // Pixel, ab wann ein Drag erkannt wird
    doubleTapDelay: 300,     // ms zwischen zwei Taps für Double-Tap
    doubleTapDistance: 25,   // max. Abstand (px) zwischen zwei Taps
    onTap: noop,
    onDoubleTap: noop,
    onDragStart: noop,
    onDragMove: noop,
    onDragEnd: noop
  };

  function TouchInput(element, options) {
    if (!element) {
      throw new Error('TouchInput: element is required');
    }

    this.element = element;
    this.options = Object.assign({}, DEFAULT_OPTIONS, options || {});

    // State
    this._isPointerDown = false;
    this._isDragging = false;
    this._startPos = null;
    this._lastPos = null;
    this._pointerId = null;

    this._lastTapTime = 0;
    this._lastTapPos = null;

    // Bound handler
    this._handlePointerDown = this._handlePointerDown.bind(this);
    this._handlePointerMove = this._handlePointerMove.bind(this);
    this._handlePointerUp = this._handlePointerUp.bind(this);
    this._handlePointerCancel = this._handlePointerCancel.bind(this);

    this._handleTouchStart = this._handleTouchStart.bind(this);
    this._handleTouchMove = this._handleTouchMove.bind(this);
    this._handleTouchEnd = this._handleTouchEnd.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseUp = this._handleMouseUp.bind(this);

    this._usePointerEvents = !!window.PointerEvent;

    this._attach();
  }

  // --- Public API ----------------------------------------------------------

  TouchInput.prototype.destroy = function () {
    this._detach();
  };

  TouchInput.prototype.setOptions = function (options) {
    Object.assign(this.options, options || {});
  };

  TouchInput.prototype.getLastPosition = function () {
    return this._lastPos ? { x: this._lastPos.x, y: this._lastPos.y } : null;
  };

  // --- Internals: Event Handling -------------------------------------------

  TouchInput.prototype._attach = function () {
    if (this._usePointerEvents) {
      this.element.addEventListener('pointerdown', this._handlePointerDown, { passive: false });
      this.element.addEventListener('pointermove', this._handlePointerMove, { passive: false });
      this.element.addEventListener('pointerup', this._handlePointerUp, { passive: false });
      this.element.addEventListener('pointercancel', this._handlePointerCancel, { passive: false });
    } else {
      // Fallback: Touch + Mouse
      this.element.addEventListener('touchstart', this._handleTouchStart, { passive: false });
      this.element.addEventListener('touchmove', this._handleTouchMove, { passive: false });
      this.element.addEventListener('touchend', this._handleTouchEnd, { passive: false });
      this.element.addEventListener('touchcancel', this._handleTouchEnd, { passive: false });

      this.element.addEventListener('mousedown', this._handleMouseDown, false);
      window.addEventListener('mousemove', this._handleMouseMove, false);
      window.addEventListener('mouseup', this._handleMouseUp, false);
    }
  };

  TouchInput.prototype._detach = function () {
    if (this._usePointerEvents) {
      this.element.removeEventListener('pointerdown', this._handlePointerDown);
      this.element.removeEventListener('pointermove', this._handlePointerMove);
      this.element.removeEventListener('pointerup', this._handlePointerUp);
      this.element.removeEventListener('pointercancel', this._handlePointerCancel);
    } else {
      this.element.removeEventListener('touchstart', this._handleTouchStart);
      this.element.removeEventListener('touchmove', this._handleTouchMove);
      this.element.removeEventListener('touchend', this._handleTouchEnd);
      this.element.removeEventListener('touchcancel', this._handleTouchEnd);

      this.element.removeEventListener('mousedown', this._handleMouseDown);
      window.removeEventListener('mousemove', this._handleMouseMove);
      window.removeEventListener('mouseup', this._handleMouseUp);
    }
  };

  // --- Pointer Events Variante ---------------------------------------------

  TouchInput.prototype._handlePointerDown = function (e) {
    // Nur primären Pointer nehmen
    if (this._isPointerDown && this._pointerId !== e.pointerId) return;

    this._pointerId = e.pointerId;
    this._isPointerDown = true;
    this._isDragging = false;

    const pos = this._getRelativePos(e);
    this._startPos = pos;
    this._lastPos = pos;

    if (e.pointerType === 'touch') {
      e.preventDefault();
    }
  };

  TouchInput.prototype._handlePointerMove = function (e) {
    if (!this._isPointerDown || e.pointerId !== this._pointerId) return;

    const pos = this._getRelativePos(e);
    const dx = pos.x - this._startPos.x;
    const dy = pos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging && dist >= this.options.dragThreshold) {
      this._isDragging = true;
      this.options.onDragStart(this._startPos, e);
    }

    if (this._isDragging) {
      this.options.onDragMove(pos, e);
    }

    this._lastPos = pos;

    if (e.pointerType === 'touch') {
      e.preventDefault();
    }
  };

  TouchInput.prototype._handlePointerUp = function (e) {
    if (!this._isPointerDown || e.pointerId !== this._pointerId) return;

    const pos = this._getRelativePos(e);
    this._finishInteraction(pos, e, e.pointerType === 'touch');

    this._pointerId = null;
  };

  TouchInput.prototype._handlePointerCancel = function (e) {
    if (!this._isPointerDown || e.pointerId !== this._pointerId) return;

    const pos = this._lastPos || this._getRelativePos(e);
    if (this._isDragging) {
      this.options.onDragEnd(pos, e);
    }

    this._resetState();
  };

  // --- Touch + Mouse Fallback ----------------------------------------------

  TouchInput.prototype._handleTouchStart = function (e) {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    this._isPointerDown = true;
    this._isDragging = false;

    const pos = this._getRelativePos(touch);
    this._startPos = pos;
    this._lastPos = pos;

    e.preventDefault();
  };

  TouchInput.prototype._handleTouchMove = function (e) {
    if (!this._isPointerDown || e.touches.length === 0) return;
    const touch = e.touches[0];
    const pos = this._getRelativePos(touch);

    const dx = pos.x - this._startPos.x;
    const dy = pos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging && dist >= this.options.dragThreshold) {
      this._isDragging = true;
      this.options.onDragStart(this._startPos, e);
    }

    if (this._isDragging) {
      this.options.onDragMove(pos, e);
    }

    this._lastPos = pos;
    e.preventDefault();
  };

  TouchInput.prototype._handleTouchEnd = function (e) {
    if (!this._isPointerDown) return;

    const pos = this._lastPos;
    this._finishInteraction(pos, e, true);
  };

  TouchInput.prototype._handleMouseDown = function (e) {
    if (e.button !== 0) return;

    this._isPointerDown = true;
    this._isDragging = false;

    const pos = this._getRelativePos(e);
    this._startPos = pos;
    this._lastPos = pos;
  };

  TouchInput.prototype._handleMouseMove = function (e) {
    if (!this._isPointerDown) return;

    const pos = this._getRelativePos(e);
    const dx = pos.x - this._startPos.x;
    const dy = pos.y - this._startPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this._isDragging && dist >= this.options.dragThreshold) {
      this._isDragging = true;
      this.options.onDragStart(this._startPos, e);
    }

    if (this._isDragging) {
      this.options.onDragMove(pos, e);
    }

    this._lastPos = pos;
  };

  TouchInput.prototype._handleMouseUp = function (e) {
    if (!this._isPointerDown) return;

    const pos = this._getRelativePos(e);
    this._finishInteraction(pos, e, false);
  };

  // --- Gemeinsame Abschluss-Logik ------------------------------------------

  TouchInput.prototype._finishInteraction = function (pos, e, isTouchLike) {
    if (!pos) {
      this._resetState();
      return;
    }

    if (this._isDragging) {
      this.options.onDragEnd(pos, e);
    } else {
      const now = Date.now();
      const lastTapTime = this._lastTapTime;
      const lastTapPos = this._lastTapPos;

      const isDoubleTap =
        lastTapTime &&
        (now - lastTapTime) <= this.options.doubleTapDelay &&
        lastTapPos &&
        distance(pos, lastTapPos) <= this.options.doubleTapDistance;

      if (isDoubleTap) {
        this.options.onDoubleTap(pos, e);
        this._lastTapTime = 0;
        this._lastTapPos = null;
      } else {
        this.options.onTap(pos, e);
        this._lastTapTime = now;
        this._lastTapPos = { x: pos.x, y: pos.y };
      }
    }

    this._resetState();

    if (isTouchLike && e && e.preventDefault) {
      e.preventDefault();
    }
  };

  TouchInput.prototype._resetState = function () {
    this._isPointerDown = false;
    this._isDragging = false;
    this._startPos = null;
    this._lastPos = null;
    this._pointerId = null;
  };

  // --- Hilfsfunktionen -----------------------------------------------------

  TouchInput.prototype._getRelativePos = function (e) {
    const rect = this.element.getBoundingClientRect();
    const clientX = e.clientX != null ? e.clientX : (e.pageX || 0);
    const clientY = e.clientY != null ? e.clientY : (e.pageY || 0);

    const scaleX = this.element.clientWidth ? this.element.clientWidth / rect.width : 1;
    const scaleY = this.element.clientHeight ? this.element.clientHeight / rect.height : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  global.TouchInput = TouchInput;

})(window);