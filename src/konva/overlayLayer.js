import Konva from 'konva';

export class OverlayLayer {
  constructor(store) {
    this.store = store;
    this.layer = new Konva.Layer({ name: 'overlayLayer' });
    this._imageNode = null;
    this._unsubscribe = store.subscribe((path) => this._onStoreChange(path));
  }

  mount(stage) {
    stage.add(this.layer);
    this._render();
  }

  destroy() {
    this._unsubscribe();
    this.layer.destroy();
  }

  _onStoreChange(path) {
    if (
      path === 'overlayImageSrc' ||
      path === 'overlayOpacity' ||
      path === 'overlayVisible'
    ) {
      this._render();
    }
  }

  _render() {
    const src = this.store.get('overlayImageSrc');
    const visible = this.store.get('overlayVisible');
    const opacity = this.store.get('overlayOpacity') ?? 0.5;

    if (!visible || !src) {
      this.layer.visible(false);
      this.layer.batchDraw();
      return;
    }

    this.layer.visible(true);

    if (this._imageNode && this._imageNode.getAttr('srcRef') === src) {
      this._imageNode.opacity(opacity);
      this.layer.batchDraw();
      return;
    }

    this.layer.destroyChildren();
    this._imageNode = null;

    const img = new Image();
    img.onload = () => {
      if (this._imageNode) return; // Already created
      const stage = this.layer.getStage();
      const sw = stage ? stage.width() : img.width;
      const sh = stage ? stage.height() : img.height;
      const scale = Math.min(sw / img.width, sh / img.height, 1);

      this._imageNode = new Konva.Image({
        image: img,
        x: (sw - img.width * scale) / 2,
        y: (sh - img.height * scale) / 2,
        width: img.width * scale,
        height: img.height * scale,
        opacity: opacity,
        listening: false,
        srcRef: src,
      });
      this.layer.add(this._imageNode);
      this.layer.batchDraw();
    };
    img.src = src;
  }
}
