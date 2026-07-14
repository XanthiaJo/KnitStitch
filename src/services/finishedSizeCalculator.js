// FinishedSizeCalculator.js - Port of FinishedSizeCalculator.cs

export class FinishedSizeCalculator {
  calculate(gauge, dimensions) {
    const stitchesPerInch = gauge.stitchesPer4Inches / 4.0;
    const rowsPerInch = gauge.rowsPer4Inches / 4.0;
    const width = stitchesPerInch <= 0 ? 0 : dimensions.stitchCount / stitchesPerInch;
    const height = rowsPerInch <= 0 ? 0 : dimensions.rowCount / rowsPerInch;
    return { widthInches: width, heightInches: height };
  }
}
