type PopcornMarkProps = {
  size: number;
};

export function PopcornMark({ size }: PopcornMarkProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 42h56l-8 46H28L20 42Z" fill="#ef4444" />
      <path d="m32 42 4 46h10V42H32Zm28 0v46h8l8-46H60Z" fill="#fff7ed" />
      <path d="M18 40h60v10H18z" fill="#b91c1c" />
      <g fill="#fef3c7" stroke="#f59e0b" strokeWidth="2">
        <circle cx="30" cy="34" r="11" />
        <circle cx="43" cy="25" r="13" />
        <circle cx="58" cy="27" r="13" />
        <circle cx="69" cy="36" r="10" />
        <circle cx="48" cy="38" r="12" />
      </g>
    </svg>
  );
}
