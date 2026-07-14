// SketchDimension.js — Linear dimension between two SketchPoints.
// Ported from Legacy/Models/Sketch/SketchDimension.cs

const DIM_OFFSET       = 30;
const WITNESS_OVERHANG =  5;
const ARROW_LEN        =  8;
const ARROW_HW         =  3.5;
const SNAP_ANGLE_DEG   = 10;

export const DimensionKind = { Horizontal: 'Horizontal', Vertical: 'Vertical', Aligned: 'Aligned' };

export class SketchDimension {
  constructor(id, a, b, offsetSign = 1) {
    this.id          = id;
    this.a           = a;
    this.b           = b;
    this.offsetSign  = offsetSign;
    this.drivenValue = null;
    this.isSelected  = false;

    // Optional display override: when set, the label shows these instead of
    // the raw pixel value. Used by templates to show inches.
    this.displayValue  = null;  // e.g. 8.5
    this.displaySuffix = null;  // e.g. ' in'

    // Rendering geometry — all updated by recompute()
    this.kind          = DimensionKind.Aligned;
    this.labelText     = '';
    this.dimLine1      = { x: 0, y: 0 };
    this.dimLine2      = { x: 0, y: 0 };
    this.witnessA1     = { x: 0, y: 0 };
    this.witnessA2     = { x: 0, y: 0 };
    this.witnessB1     = { x: 0, y: 0 };
    this.witnessB2     = { x: 0, y: 0 };
    this.labelPos      = { x: 0, y: 0 };
    this.labelAngle    = 0;
    this.arrowAPoints  = [];
    this.arrowBPoints  = [];

    this.recompute();
  }

  get isConstrained() { return this.drivenValue !== null; }

  setDrivenValue(value) {
    this.drivenValue = value;
    this.recompute();
  }

  /**
   * Sets both the pixel driven value (for constraint math) and the display
   * value/suffix (for the label). Used by templates that work in real units.
   */
  setDrivenDisplay(pixelValue, displayValue, displaySuffix) {
    this.drivenValue   = pixelValue;
    this.displayValue  = displayValue;
    this.displaySuffix = displaySuffix;
    this.recompute();
  }

  recompute(preserveKind = false) {
    const dx       = this.b.x - this.a.x;
    const dy       = this.b.y - this.a.y;
    const angleDeg = Math.abs(Math.atan2(Math.abs(dy), Math.abs(dx)) * 180 / Math.PI);

    if (!preserveKind) {
      this.kind = angleDeg <= SNAP_ANGLE_DEG          ? DimensionKind.Horizontal
                : angleDeg >= 90 - SNAP_ANGLE_DEG     ? DimensionKind.Vertical
                : DimensionKind.Aligned;
    }

    const measured = this.kind === DimensionKind.Horizontal ? Math.abs(dx)
                   : this.kind === DimensionKind.Vertical   ? Math.abs(dy)
                   : Math.sqrt(dx * dx + dy * dy);

    if (this.displayValue !== null && this.displaySuffix !== null) {
      this.labelText = this.isConstrained
        ? `\uD83D\uDD12 ${this.displayValue.toFixed(2)}${this.displaySuffix}`
        : `${this.displayValue.toFixed(2)}${this.displaySuffix}`;
    } else {
      const display = this.drivenValue ?? measured;
      this.labelText = this.isConstrained
        ? `\uD83D\uDD12 ${display.toFixed(1)}`
        : `${measured.toFixed(1)}`;
    }

    if      (this.kind === DimensionKind.Horizontal) this._computeHorizontal();
    else if (this.kind === DimensionKind.Vertical)   this._computeVertical();
    else                                              this._computeAligned();
  }

  _computeHorizontal() {
    const s = this.offsetSign;
    const dimY = s > 0
      ? Math.max(this.a.y, this.b.y) + DIM_OFFSET
      : Math.min(this.a.y, this.b.y) - DIM_OFFSET;

    this.dimLine1 = { x: this.a.x, y: dimY };
    this.dimLine2 = { x: this.b.x, y: dimY };

    this.witnessA1 = { x: this.a.x, y: this.a.y };
    this.witnessA2 = { x: this.a.x, y: dimY + s * WITNESS_OVERHANG };
    this.witnessB1 = { x: this.b.x, y: this.b.y };
    this.witnessB2 = { x: this.b.x, y: dimY + s * WITNESS_OVERHANG };

    this.labelAngle = 0;
    this.labelPos   = { x: (this.a.x + this.b.x) / 2, y: dimY };
    this._computeArrows(this.dimLine1, this.dimLine2);
  }

  _computeVertical() {
    const s = this.offsetSign;
    const dimX = s > 0
      ? Math.max(this.a.x, this.b.x) + DIM_OFFSET
      : Math.min(this.a.x, this.b.x) - DIM_OFFSET;

    this.dimLine1 = { x: dimX, y: this.a.y };
    this.dimLine2 = { x: dimX, y: this.b.y };

    this.witnessA1 = { x: this.a.x, y: this.a.y };
    this.witnessA2 = { x: dimX + s * WITNESS_OVERHANG, y: this.a.y };
    this.witnessB1 = { x: this.b.x, y: this.b.y };
    this.witnessB2 = { x: dimX + s * WITNESS_OVERHANG, y: this.b.y };

    this.labelAngle = -90;
    this.labelPos   = { x: dimX, y: (this.a.y + this.b.y) / 2 };
    this._computeArrows(this.dimLine1, this.dimLine2);
  }

  _computeAligned() {
    const dx  = this.b.x - this.a.x;
    const dy  = this.b.y - this.a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      this.dimLine1 = { x: this.a.x, y: this.a.y };
      this.dimLine2 = { x: this.b.x, y: this.b.y };
      return;
    }
    const s   = this.offsetSign;
    const ux  = dx / len;
    const uy  = dy / len;
    const offX = -uy * s * DIM_OFFSET;
    const offY =  ux * s * DIM_OFFSET;

    this.dimLine1 = { x: this.a.x + offX, y: this.a.y + offY };
    this.dimLine2 = { x: this.b.x + offX, y: this.b.y + offY };

    const ovhX = -uy * s * WITNESS_OVERHANG;
    const ovhY =  ux * s * WITNESS_OVERHANG;
    this.witnessA1 = { x: this.a.x, y: this.a.y };
    this.witnessA2 = { x: this.dimLine1.x + ovhX, y: this.dimLine1.y + ovhY };
    this.witnessB1 = { x: this.b.x, y: this.b.y };
    this.witnessB2 = { x: this.dimLine2.x + ovhX, y: this.dimLine2.y + ovhY };

    this.labelAngle = Math.atan2(dy, dx) * 180 / Math.PI;
    this.labelPos   = {
      x: (this.dimLine1.x + this.dimLine2.x) / 2,
      y: (this.dimLine1.y + this.dimLine2.y) / 2,
    };
    this._computeArrows(this.dimLine1, this.dimLine2);
  }

  _computeArrows(p1, p2) {
    const dx  = p2.x - p1.x;
    const dy  = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) { this.arrowAPoints = []; this.arrowBPoints = []; return; }
    const ux = dx / len;
    const uy = dy / len;
    const px = -uy;
    const py =  ux;

    this.arrowAPoints = [
      p1,
      { x: p1.x + ux * ARROW_LEN + px * ARROW_HW, y: p1.y + uy * ARROW_LEN + py * ARROW_HW },
      { x: p1.x + ux * ARROW_LEN - px * ARROW_HW, y: p1.y + uy * ARROW_LEN - py * ARROW_HW },
    ];
    this.arrowBPoints = [
      p2,
      { x: p2.x - ux * ARROW_LEN + px * ARROW_HW, y: p2.y - uy * ARROW_LEN + py * ARROW_HW },
      { x: p2.x - ux * ARROW_LEN - px * ARROW_HW, y: p2.y - uy * ARROW_LEN - py * ARROW_HW },
    ];
  }
}
