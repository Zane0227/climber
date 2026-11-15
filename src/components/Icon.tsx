import type { SVGProps } from "react";

const paths = {
  mountain: "M2 19 9 6l4 7 3-5 6 11H2Z M7 10l2 2 2-2",
  upload: "M12 16V3m-4 4 4-4 4 4M4 16v4h16v-4",
  film: "M4 4h16v16H4zM8 4v16M16 4v16M4 9h4m-4 6h4m8-6h4m-4 6h4",
  play: "m8 5 12 7-12 7V5Z",
  pause: "M9 5v14m6-14v14",
  back: "M5 11a7 7 0 1 1 2 6M5 5v6h6",
  forward: "M19 11a7 7 0 1 0-2 6m2-12v6h-6",
  scan: "M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5m4-3h8",
  aperture: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm1.2 0 4.4 8m2.9 0h-9.2m.9 10-4.5-8m-3.2 0h9.3",
  settings: "M4 7h16M4 17h16m-11-4v8m6-18v8",
  download: "M12 3v13m-4-4 4 4 4-4M4 16v4h16v-4",
  chevron: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  close: "m6 6 12 12M6 18 18 6",
  trim: "M8 4H5v16h3m8-16h3v16h-3m-6-8h4",
  left: "M9 5H6v14h3m7-7H9",
  right: "M15 5h3v14h-3m-7-7h7",
} as const;

export default function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.65"
      strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d={paths[name]} />
    </svg>
  );
}
