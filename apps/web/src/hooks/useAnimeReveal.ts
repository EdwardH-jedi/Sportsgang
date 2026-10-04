import { useEffect, useRef } from 'react';
import anime from 'animejs';
import { useReducedMotion } from './useReducedMotion';

type RevealOptions = {
  /** ms between siblings — default 90ms */
  stagger?: number;
  /** ms per element — default 700 */
  duration?: number;
  /** vertical offset to translate up from — default 24px */
  translateY?: number;
  /** delay before the whole reveal starts — default 0 */
  delay?: number;
  /** CSS selector for child elements that should reveal individually.
   *  When omitted, the container itself is revealed. */
  childSelector?: string;
  /** IntersectionObserver threshold — default 0. The observer also trims the
   *  bottom 12% of the viewport, so a reveal starts once the container's top
   *  is a little way into view. A non-zero threshold must stay reachable for
   *  a container taller than the viewport (ratio ≤ viewport / height). */
  threshold?: number;
};

/**
 * Returns a ref. Attach it to a container, optionally pass a `childSelector`
 * to stagger the reveal across that container's children, and the hook will:
 *
 *  - leave reveal targets hidden (the global `[data-reveal]` rule does that)
 *  - watch the container with IntersectionObserver
 *  - on first intersection, animate opacity 0→1 + translateY 24→0 with the
 *    requested stagger
 *  - if the user prefers reduced motion, instantly mark targets visible
 *    without ever calling anime.js
 *  - if an animation has not finished when it should have, snap targets
 *    visible (content never stays hidden because an animation failed)
 *
 * Animations only target `opacity` and `transform`, so they never trigger
 * layout. Each target is animated exactly once.
 */
export function useAnimeReveal<T extends HTMLElement = HTMLElement>(
  opts: RevealOptions = {}
) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    const targets: HTMLElement[] = opts.childSelector
      ? Array.from(container.querySelectorAll<HTMLElement>(opts.childSelector))
      : [container];

    if (targets.length === 0) return;

    // Make sure each target carries the data-reveal initial-state attribute,
    // so even targets defined after the CSS pass start hidden consistently.
    targets.forEach((el) => el.setAttribute('data-reveal', ''));

    if (reduced) {
      // Reduced motion: skip anime.js entirely, just snap to visible.
      targets.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
      return;
    }

    const snapVisible = () => {
      targets.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
        el.removeAttribute('data-reveal');
      });
    };

    let played = false;
    let instance: anime.AnimeInstance | null = null;
    let safety: number | undefined;
    const play = () => {
      if (played) return;
      played = true;
      // If the animation never completes (throttled tab, anime.js failure),
      // show the content anyway once it should have finished.
      const total = (opts.delay ?? 0) + (opts.duration ?? 700) + (opts.stagger ?? 90) * targets.length;
      safety = window.setTimeout(snapVisible, total + 800);
      try {
        instance = anime({
          targets,
          opacity: [0, 1],
          translateY: [opts.translateY ?? 24, 0],
          easing: 'cubicBezier(0.22, 1, 0.36, 1)',
          duration: opts.duration ?? 700,
          delay: anime.stagger(opts.stagger ?? 90, { start: opts.delay ?? 0 }),
          complete: () => {
            targets.forEach((el) => el.removeAttribute('data-reveal'));
          },
        });
      } catch {
        // Defensive: if anime ever throws (e.g. weird target shape) we
        // must NOT leave reveal targets permanently invisible.
        snapVisible();
      }
    };

    if (typeof IntersectionObserver === 'undefined') {
      // No IntersectionObserver support — fall back to immediate play.
      play();
      return () => {
        window.clearTimeout(safety);
        if (instance) instance.pause();
        anime.remove(targets);
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            play();
            observer.disconnect();
            break;
          }
        }
      },
      { threshold: opts.threshold ?? 0, rootMargin: '0px 0px -12% 0px' }
    );
    observer.observe(container);

    return () => {
      observer.disconnect();
      window.clearTimeout(safety);
      if (instance) instance.pause();
      anime.remove(targets);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return ref;
}
