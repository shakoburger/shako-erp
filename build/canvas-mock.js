export const DOMMatrix = typeof globalThis.DOMMatrix !== 'undefined' ? globalThis.DOMMatrix : class DOMMatrix {};
export const ImageData = typeof globalThis.ImageData !== 'undefined' ? globalThis.ImageData : class ImageData {};
export const Path2D = typeof globalThis.Path2D !== 'undefined' ? globalThis.Path2D : class Path2D {};
export default {
  DOMMatrix,
  ImageData,
  Path2D,
};
