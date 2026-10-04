/**
 * Small original line icons (inline SVG, 24×24 grid). Decorative unless a
 * `title` is given; they inherit `currentColor`.
 */
type IconProps = { className?: string; title?: string };

function Svg({ className, title, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  );
}

export function ArrowUpRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 17 17 7M8 7h9v9" />
    </Svg>
  );
}

export function Phone(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function Menu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function Close(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function Shield(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3 5 6v5.5c0 4.2 2.9 7.9 7 9.5 4.1-1.6 7-5.3 7-9.5V6l-7-3Z" />
    </Svg>
  );
}

export function Runner(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="m9 21 2.5-5.5 3 2.5 1 4M7 12l3-3.5 4 1 2.5 3.5 3 .5M10 8.5 11.5 15" />
    </Svg>
  );
}

export function Flag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 21V3.5l9 3.5-9 3.5" />
      <ellipse cx="9" cy="21" rx="5" ry="1.2" />
    </Svg>
  );
}
