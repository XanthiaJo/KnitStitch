// GaugeSettings.js - Port of gauge settings

export class GaugeSettings {
  constructor(stitchesPer4Inches = 20, rowsPer4Inches = 28) {
    this.stitchesPer4Inches = stitchesPer4Inches;
    this.rowsPer4Inches = rowsPer4Inches;
  }

  get stitchesPerInch() {
    return this.stitchesPer4Inches / 4.0;
  }

  get rowsPerInch() {
    return this.rowsPer4Inches / 4.0;
  }
}
