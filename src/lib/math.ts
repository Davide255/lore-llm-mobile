import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/braket/BraketConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

/**
 * TeX → SVG with MathJax, in plain JS (its lite DOM, no WebView), for
 * react-native-svg to draw. Glyphs are inlined as paths (`fontCache: 'none'`)
 * and painted with `currentColor`, so the caller picks the color.
 */

export interface MathSvg {
  /** `<svg>` markup without its own size: the caller sizes it from the fields below. */
  svg: string;
  /** Size in em of the surrounding text: width, height above the baseline, depth below it. */
  width: number;
  ascent: number;
  depth: number;
}

const PACKAGES = ['base', 'ams', 'newcommand', 'noundefined', 'boldsymbol', 'braket', 'cancel', 'color'];

let convert: ((tex: string, display: boolean) => string) | null = null;

function converter() {
  if (convert) return convert;
  const adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);
  const doc = mathjax.document('', {
    InputJax: new TeX({ packages: PACKAGES }),
    OutputJax: new SVG({ fontCache: 'none' }),
  });
  convert = (tex, display) => adaptor.innerHTML(doc.convert(tex, { display }));
  return convert;
}

const cache = new Map<string, MathSvg | null>();

/** Null when the TeX doesn't parse: show the source instead. */
export function texToSvg(tex: string, display: boolean): MathSvg | null {
  const key = `${display ? 'D' : 'I'}${tex}`;
  if (cache.has(key)) return cache.get(key)!;
  let result: MathSvg | null = null;
  try {
    const svg = converter()(tex, display);
    const box = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/);
    if (box && !svg.includes('data-mjx-error')) {
      const [, , minY, width, height] = box.map(Number);
      // MathJax works in thousandths of an em; the baseline is y = 0.
      result = {
        svg: svg.replace(/^<svg[^>]*?>/, (open) => open.replace(/\s(width|height|style)="[^"]*"/g, '')),
        width: width / 1000,
        ascent: -minY / 1000,
        depth: (height + minY) / 1000,
      };
    }
  } catch {
    result = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, result);
  return result;
}
