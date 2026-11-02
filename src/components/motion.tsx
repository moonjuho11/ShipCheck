"use client";

/**
 * Motion primitives (motion.dev). Restrained by design: short durations, small
 * offsets, play once. `reducedMotion="user"` turns transforms off for people who
 * ask their OS for less motion. LazyMotion + `m` keeps the bundle small.
 */
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m, type Variants } from "motion/react";
import { Children, cloneElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.5, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

const VIEWPORT = { once: true, margin: "0px 0px -12% 0px" } as const;

const enterStyle = (delay: number, y: number) => ({ "--d": `${delay}s`, "--y": `${y}px` }) as CSSProperties;

/**
 * Fades content up into place, once. On-mount reveals use a CSS animation (the
 * `.enter` class) so above-the-fold content shows the moment the page paints,
 * with or without JavaScript. Scroll reveals use Motion's whileInView.
 */
export function Reveal({ children, className, delay = 0, y = 14, onMount = false, id }: { children: ReactNode; className?: string; delay?: number; y?: number; onMount?: boolean; id?: string }) {
  if (onMount) return <div id={id} className={`enter ${className ?? ""}`} style={enterStyle(delay, y)}>{children}</div>;
  return (
    <m.div id={id} className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE, delay } }} viewport={VIEWPORT}>
      {children}
    </m.div>
  );
}

const container = (gap: number, delay: number): Variants => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren: delay } } });
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

type Tag = "div" | "ul" | "ol" | "li" | "section";
const TAGS = { div: m.div, ul: m.ul, ol: m.ol, li: m.li, section: m.section };

/** Parent that reveals its <StaggerItem> children one after another. */
export function Stagger({ children, className, as = "div", gap = 0.07, delay = 0, onMount = false }: { children: ReactNode; className?: string; as?: Tag; gap?: number; delay?: number; onMount?: boolean }) {
  if (onMount) {
    // CSS-driven: hand each item its own delay so nothing waits for JavaScript.
    const Plain = as;
    let i = 0;
    return (
      <Plain className={className}>
        {Children.map(children, (child) =>
          isValidElement(child) ? cloneElement(child as ReactElement<{ enterDelay?: number }>, { enterDelay: delay + gap * i++ }) : child)}
      </Plain>
    );
  }
  const C = TAGS[as];
  return (
    <C className={className} variants={container(gap, delay)} initial="hidden" whileInView="show" viewport={VIEWPORT}>
      {children}
    </C>
  );
}

export function StaggerItem({ children, className, as = "div", id, enterDelay }: { children: ReactNode; className?: string; as?: Tag; id?: string; enterDelay?: number }) {
  if (enterDelay !== undefined) {
    const Plain = as;
    return <Plain id={id} className={`enter ${className ?? ""}`} style={enterStyle(enterDelay, 12)}>{children}</Plain>;
  }
  const C = TAGS[as];
  return <C id={id} className={className} variants={itemVariants}>{children}</C>;
}

/** Height + fade transition for content that opens and closes. */
export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="content"
          className={`overflow-hidden ${className ?? ""}`}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1, transition: { height: { duration: 0.32, ease: EASE }, opacity: { duration: 0.22, delay: 0.06 } } }}
          exit={{ height: 0, opacity: 0, transition: { height: { duration: 0.26, ease: EASE }, opacity: { duration: 0.12 } } }}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/** Swaps between two labels with a small vertical slide (e.g. "Copy" → "Copied"). */
export function SwapText({ active, idle, done }: { active: boolean; idle: ReactNode; done: ReactNode }) {
  return (
    <span className="relative inline-flex overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={active ? "done" : "idle"}
          className="inline-flex items-center gap-1.5"
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1, transition: { duration: 0.2, ease: EASE } }}
          exit={{ y: -10, opacity: 0, transition: { duration: 0.15 } }}
        >
          {active ? done : idle}
        </m.span>
      </AnimatePresence>
    </span>
  );
}

export { m, AnimatePresence };
